/**
 * Quick look at a single run: `npx tsx sim/probe.ts [policy] [hours] [seed]`.
 * Prints milestones and a coarse growth trace. Handy while tuning.
 */
import { formatDuration } from '../src/engine';
import { POLICY_ORDER } from './bots/policies';
import { applyOverrides } from './params';
import type { PolicyName } from './bots/policies';
import { runBot } from './runner';

const policy = (process.argv[2] ?? 'greedy-best-roi') as PolicyName;
const hours = Number(process.argv[3] ?? 6);
const seed = Number(process.argv[4] ?? 1);
applyOverrides(process.argv[5]);
if (!POLICY_ORDER.includes(policy)) throw new Error(`Unknown policy ${policy}`);

const result = runBot({ policy, seed, horizonSeconds: hours * 3600 });
console.log(`${policy} seed ${seed}: ${hours}h simulated in ${result.computeMs.toFixed(0)} ms`);
let prevT = 0;
let prevN = 0;
for (const [id, t] of Object.entries(result.milestones)) {
  const n = result.purchasesAt[id as keyof typeof result.purchasesAt] ?? 0;
  const span = (t as number) - prevT;
  const cadence = n > prevN ? formatDuration(span / (n - prevN)) : '-';
  console.log(`  ${id.padEnd(16)} ${formatDuration(t as number).padEnd(10)} purchases since previous: ${String(n - prevN).padEnd(6)} (one per ${cadence})`);
  prevT = t as number;
  prevN = n;
}
console.log(
  `  purchases ${result.purchases}, challenge tiers ${result.challengeTiers}, longest gap ${formatDuration(result.maxGap)} (ending at ${formatDuration(result.maxGapAt)}), sessions ${result.sessions}`,
);
const step = Math.max(1, Math.floor(result.samples.length / 24));
for (let i = 0; i < result.samples.length; i += step) {
  const s = result.samples[i];
  console.log(
    `  t=${formatDuration(s.t).padEnd(9)} light=e${s.light.toFixed(1).padEnd(7)} rate=e${s.rate.toFixed(1).padEnd(7)} glim=e${s.glimmer.toFixed(1).padEnd(6)} stone=e${s.stone.toFixed(2).padEnd(5)} tide=e${s.tide.toFixed(2).padEnd(5)} dust=e${s.stardust.toFixed(2).padEnd(5)} coast=${s.coastPower.toFixed(1).padEnd(6)} tideP=${s.tidePower.toFixed(1).padEnd(6)} star=${s.starPower.toFixed(1).padEnd(6)} aur=${s.auroraPower.toFixed(1)}`,
  );
}
