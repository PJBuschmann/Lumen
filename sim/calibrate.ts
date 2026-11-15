/**
 * npm run sim:calibrate -- <milestone> <balance.path> <low> <high> [--linear] [--seeds N] [--policy P]
 *
 * Bisects one balance value until the chosen bot's median time to a milestone hits its
 * pacing target. Works on any value the milestone time depends on monotonically
 * (gates, costs, rates). Prints the value to put in src/content; it does not edit files.
 *
 * Because each layer's gate only affects milestones after it, calibrate in order:
 * firstDawn, firstCoast, firstTides, firstStar, auroraUnlocked.
 */
import { PACING } from '../src/content/pacing';
import type { PacingMilestone } from '../src/content/pacing';
import type { MilestoneId } from '../src/engine';
import { fmtTime, quantile } from './aggregate';
import type { PolicyName } from './bots/policies';
import { applyOverrides, getParam, setParam } from './params';
import { runBot } from './runner';

// The four positional arguments come first; flags follow.
const argv = process.argv.slice(2);
const firstFlag = argv.findIndex((a) => a.startsWith('--'));
const [milestoneArg, path, lowArg, highArg] = firstFlag < 0 ? argv : argv.slice(0, firstFlag);
const flags = new Map<string, string>();
argv.forEach((arg, i) => {
  if (!arg.startsWith('--')) return;
  const next = argv[i + 1];
  flags.set(arg.slice(2), next !== undefined && !next.startsWith('--') ? next : 'true');
});

if (!milestoneArg || !path || !lowArg || !highArg) {
  console.error('usage: sim:calibrate <milestone> <balance.path> <low> <high> [--linear] [--seeds N] [--policy P] [--set A.b=1]');
  process.exit(1);
}
const milestone = milestoneArg as PacingMilestone;
const target = PACING.targets[milestone];
if (target === undefined) throw new Error(`Unknown milestone ${milestoneArg}`);
const seeds = Number(flags.get('seeds') ?? 3);
const policy = (flags.get('policy') ?? 'greedy-best-roi') as PolicyName;
const linear = flags.get('linear') === 'true';
applyOverrides(flags.get('set'));

function measure(value: number): number {
  setParam(path, value);
  const times: number[] = [];
  for (let i = 0; i < seeds; i++) {
    const result = runBot({
      policy,
      seed: 1000 + i * 7919,
      horizonSeconds: target * 4,
      stopAfter: milestone as MilestoneId,
    });
    times.push(result.milestones[milestone as MilestoneId] ?? Infinity);
  }
  return quantile(times.sort((a, b) => a - b), 0.5);
}

const original = getParam(path);
let lo = Number(lowArg);
let hi = Number(highArg);
const tLo = measure(lo);
const tHi = measure(hi);
console.log(`${path}: currently ${original}; target ${fmtTime(target)} for ${milestone} (${policy}, ${seeds} seeds)`);
console.log(`  ${lo} -> ${fmtTime(tLo)}    ${hi} -> ${fmtTime(tHi)}`);
if ((tLo - target) * (tHi - target) > 0) {
  console.error('The target is not bracketed by [low, high]; widen the range.');
  process.exit(1);
}
const increasing = tHi > tLo;
let best = lo;
let bestTime = tLo;
for (let i = 0; i < 24; i++) {
  const mid = linear ? (lo + hi) / 2 : Math.sqrt(lo * hi);
  const t = measure(mid);
  if (Math.abs(t - target) < Math.abs(bestTime - target)) {
    best = mid;
    bestTime = t;
  }
  console.log(`  ${mid.toPrecision(5)} -> ${fmtTime(t)}`);
  if (Math.abs(t - target) / target < 0.01) break;
  if (t > target === increasing) hi = mid;
  else lo = mid;
}
console.log(`\nBest: ${path} = ${best.toPrecision(4)}  (${fmtTime(bestTime)}, target ${fmtTime(target)})`);
