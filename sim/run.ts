/**
 * npm run sim — runs every bot strategy across many seeds on the real engine and writes
 * sim/out/report.html plus CSVs.
 *
 *   --seeds N        games per strategy (default 12; --quick uses 2)
 *   --days D         wall-clock horizon per game (default: enough for the last target)
 *   --policies a,b   subset of strategies
 *   --jobs N         worker processes (default: CPU count - 1)
 *   --set A.b=1,...  balance overrides for this run only
 *   --out DIR        output directory (default sim/out)
 *   --check          exit with code 1 if any pacing check fails
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACING } from '../src/content/pacing';
import type { MilestoneId } from '../src/engine';
import { aggregate, pacingChecks, pacingMilestones } from './aggregate';
import { POLICY_ORDER } from './bots/policies';
import type { PolicyName } from './bots/policies';
import { applyOverrides } from './params';
import { defaultJobs, runAll } from './pool';
import { writeCsvs, writeHtml } from './report';
import type { RunConfig } from './runner';

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = 'true';
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

/** Long enough for the offline-heavy player to reach the last milestone, with margin. */
export function defaultHorizonSeconds(): number {
  const milestones = pacingMilestones();
  const last = milestones.length ? PACING.targets[milestones[milestones.length - 1]] : 0;
  return Math.max(6 * 3600, last * PACING.offlineFactor * (1 + PACING.tolerance) * 1.1);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const quick = args.quick === 'true';
  const seeds = Number(args.seeds ?? (quick ? 2 : 12));
  const jobs = Number(args.jobs ?? defaultJobs());
  const outDir = args.out ?? 'sim/out';
  const policies = (args.policies ? args.policies.split(',') : [...POLICY_ORDER]) as PolicyName[];
  for (const policy of policies) {
    if (!POLICY_ORDER.includes(policy)) throw new Error(`Unknown policy: ${policy}`);
  }
  const overrides = applyOverrides(args.set);
  const horizon = args.days ? Number(args.days) * 86400 : defaultHorizonSeconds();
  const milestones = pacingMilestones();
  const last = milestones[milestones.length - 1] as MilestoneId | undefined;

  const configs: RunConfig[] = [];
  for (const policy of policies) {
    for (let i = 0; i < seeds; i++) {
      configs.push({
        policy,
        seed: 1000 + i * 7919,
        horizonSeconds: horizon,
        // Once the last milestone is in, play one more day and stop.
        stopAfter: args.days ? undefined : last,
        tailSeconds: 86400,
        // The Aurora is endgame content with deliberately distant goals: pacing rules stop there.
        gapsUntil: last,
      });
    }
  }

  const started = Date.now();
  let lastPrint = 0;
  process.stdout.write(`Simulating ${configs.length} games (${policies.length} strategies x ${seeds} seeds) on ${jobs} workers...\n`);
  const results = await runAll(configs, {
    jobs,
    overrides: args.set,
    onProgress: (done, total) => {
      const now = Date.now();
      if (now - lastPrint > 5000 || done === total) {
        lastPrint = now;
        process.stdout.write(`  ${done}/${total} games (${((now - started) / 1000).toFixed(0)} s)\n`);
      }
    },
  });

  const agg = aggregate(results, horizon);
  mkdirSync(outDir, { recursive: true });
  writeCsvs(outDir, results, agg);
  writeHtml(outDir, agg, overrides);
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ aggregate: agg, checks: pacingChecks(agg) }, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v), 2));

  const checks = pacingChecks(agg);
  process.stdout.write(`\n${agg.runs} games, ${agg.sessions} sessions, peak Light 1e${Math.round(agg.peakLightLog)}\n\n`);
  for (const check of checks) {
    process.stdout.write(`  ${check.pass ? 'PASS' : 'FAIL'}  ${check.name}\n        ${check.detail}\n`);
  }
  const failed = checks.filter((c) => !c.pass).length;
  process.stdout.write(`\n${checks.length - failed}/${checks.length} checks passed. Report: ${join(outDir, 'report.html')}\n`);
  if (args.check === 'true' && failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
