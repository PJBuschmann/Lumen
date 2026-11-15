/**
 * Quick look at a single run: `npx tsx sim/probe.ts [policy] [hours] [seed]`.
 * Prints milestones and a coarse growth trace. Handy while tuning.
 */
import { formatDuration } from '../src/engine';
import { POLICY_ORDER } from './bots/policies';
import type { PolicyName } from './bots/policies';
import { runBot } from './runner';

const policy = (process.argv[2] ?? 'greedy-best-roi') as PolicyName;
const hours = Number(process.argv[3] ?? 6);
const seed = Number(process.argv[4] ?? 1);
if (!POLICY_ORDER.includes(policy)) throw new Error(`Unknown policy ${policy}`);

const result = runBot({ policy, seed, horizonSeconds: hours * 3600 });
console.log(`${policy} seed ${seed}: ${hours}h simulated in ${result.computeMs.toFixed(0)} ms`);
for (const [id, t] of Object.entries(result.milestones)) {
  console.log(`  ${id.padEnd(16)} ${formatDuration(t as number)}`);
}
console.log(
  `  purchases ${result.purchases}, longest gap ${formatDuration(result.maxGap)} (ending at ${formatDuration(result.maxGapAt)}), sessions ${result.sessions}`,
);
const step = Math.max(1, Math.floor(result.samples.length / 24));
for (let i = 0; i < result.samples.length; i += step) {
  const s = result.samples[i];
  console.log(
    `  t=${formatDuration(s.t).padEnd(9)} light=e${s.light.toFixed(1).padEnd(7)} rate=e${s.rate.toFixed(1).padEnd(7)} glimmer=e${s.glimmer.toFixed(2)}`,
  );
}
