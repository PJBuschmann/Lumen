/**
 * Turns raw run results into the tables the report, the CSVs and the pacing check share.
 */
import { PACING } from '../src/content/pacing';
import type { PacingMilestone } from '../src/content/pacing';
import { MILESTONE_IDS } from '../src/engine';
import type { MilestoneId } from '../src/engine';
import { POLICY_ORDER } from './bots/policies';
import type { PolicyName } from './bots/policies';
import { GAP_BUCKETS } from './runner';
import type { RunResult, Sample } from './runner';

export const MILESTONE_LABELS: Record<PacingMilestone, string> = {
  firstDawn: 'First Dawn',
  firstCoast: 'First Coastline',
  firstTides: 'First Tides',
  firstStar: 'First Constellation',
  auroraUnlocked: 'Aurora unlocked',
};

/** Pacing milestones the engine currently knows about, in order. */
export function pacingMilestones(): PacingMilestone[] {
  const known = new Set<string>(MILESTONE_IDS);
  return (Object.keys(PACING.targets) as PacingMilestone[]).filter((id) => known.has(id));
}

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface MilestoneStat {
  policy: PolicyName;
  milestone: PacingMilestone;
  target: number;
  runs: number;
  /** Runs that reached the milestone within the horizon. */
  reached: number;
  median: number;
  p10: number;
  p90: number;
  min: number;
  max: number;
}

export interface GapStat {
  policy: PolicyName;
  histogram: number[];
  /** Longest gap per run: median and worst across runs. */
  maxGapMedian: number;
  maxGapWorst: number;
  /** Wall-clock time at which the worst gap ended. */
  maxGapWorstAt: number;
  purchasesMedian: number;
}

export interface GrowthSeries {
  policy: PolicyName;
  /** Wall-clock seconds. */
  t: number[];
  /** Median across seeds of each sampled quantity (log10). */
  series: Record<keyof Omit<Sample, 't'>, number[]>;
}

export interface Aggregate {
  policies: PolicyName[];
  seeds: number;
  horizonSeconds: number;
  runs: number;
  sessions: number;
  simulatedSeconds: number;
  computeMs: number;
  numericFailures: number;
  milestones: MilestoneStat[];
  gaps: GapStat[];
  growth: GrowthSeries[];
  /** Highest log10(lifetime Light) reached by any run. */
  peakLightLog: number;
}

const SAMPLE_KEYS: (keyof Omit<Sample, 't'>)[] = ['light', 'rate', 'glimmer', 'stone', 'tide', 'coastPower', 'tidePower'];

/** Value of a step-held sample series at time t. */
function sampleAt(samples: Sample[], t: number, key: keyof Omit<Sample, 't'>): number {
  let lo = 0;
  let hi = samples.length - 1;
  if (hi < 0 || samples[0].t > t) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (samples[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return samples[lo][key];
}

export function aggregate(results: RunResult[], horizonSeconds: number): Aggregate {
  const policies = POLICY_ORDER.filter((p) => results.some((r) => r.policy === p));
  const milestoneIds = pacingMilestones();

  const milestones: MilestoneStat[] = [];
  const gaps: GapStat[] = [];
  const growth: GrowthSeries[] = [];

  // Common log-spaced time grid for the growth curves.
  const grid: number[] = [];
  for (let t = 30; t <= horizonSeconds; t = Math.max(t + 30, t * 1.06)) grid.push(t);

  for (const policy of policies) {
    const runs = results.filter((r) => r.policy === policy);

    for (const milestone of milestoneIds) {
      const times = runs
        .map((r) => r.milestones[milestone as MilestoneId])
        .filter((t): t is number => t !== undefined)
        .sort((a, b) => a - b);
      milestones.push({
        policy,
        milestone,
        target: PACING.targets[milestone],
        runs: runs.length,
        reached: times.length,
        median: times.length * 2 > runs.length ? quantile(times, 0.5) : NaN,
        p10: quantile(times, 0.1),
        p90: quantile(times, 0.9),
        min: times.length ? times[0] : NaN,
        max: times.length ? times[times.length - 1] : NaN,
      });
    }

    const histogram = GAP_BUCKETS.map((_, i) => runs.reduce((sum, r) => sum + r.gapHistogram[i], 0));
    const maxGaps = runs.map((r) => r.maxGap).sort((a, b) => a - b);
    const worst = runs.reduce((a, b) => (b.maxGap > a.maxGap ? b : a), runs[0]);
    gaps.push({
      policy,
      histogram,
      maxGapMedian: quantile(maxGaps, 0.5),
      maxGapWorst: worst.maxGap,
      maxGapWorstAt: worst.maxGapAt,
      purchasesMedian: quantile(runs.map((r) => r.purchases).sort((a, b) => a - b), 0.5),
    });

    const series = Object.fromEntries(SAMPLE_KEYS.map((key) => [key, [] as number[]])) as GrowthSeries['series'];
    const usable = grid.filter((t) => runs.some((r) => r.wallSeconds >= t));
    for (const key of SAMPLE_KEYS) {
      for (const t of usable) {
        const values = runs
          .filter((r) => r.wallSeconds >= t)
          .map((r) => sampleAt(r.samples, t, key))
          .sort((a, b) => a - b);
        series[key].push(quantile(values, 0.5));
      }
    }
    growth.push({ policy, t: usable, series });
  }

  return {
    policies,
    seeds: new Set(results.map((r) => r.seed)).size,
    horizonSeconds,
    runs: results.length,
    sessions: results.reduce((sum, r) => sum + r.sessions, 0),
    simulatedSeconds: results.reduce((sum, r) => sum + r.wallSeconds, 0),
    computeMs: results.reduce((sum, r) => sum + r.computeMs, 0),
    numericFailures: results.filter((r) => r.numericFailure).length,
    milestones,
    gaps,
    growth,
    peakLightLog: results.reduce((max, r) => Math.max(max, r.finalLightLog), 0),
  };
}

export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'not reached';
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} min`;
  if (seconds < 86400 * 2) return `${(seconds / 3600).toFixed(2)} h`;
  return `${(seconds / 86400).toFixed(2)} d`;
}

/** The acceptance checks: pacing targets, offline factor, purchase gaps, numeric safety. */
export function pacingChecks(agg: Aggregate): Check[] {
  const checks: Check[] = [];
  const { tolerance, offlineFactor, maxGapSeconds } = PACING;

  for (const stat of agg.milestones) {
    const label = MILESTONE_LABELS[stat.milestone];
    if (stat.policy === 'greedy-best-roi') {
      const lo = stat.target * (1 - tolerance);
      const hi = stat.target * (1 + tolerance);
      checks.push({
        name: `${label}: best-ROI within ±${tolerance * 100}% of ${fmtTime(stat.target)}`,
        pass: stat.median >= lo && stat.median <= hi,
        detail: `median ${fmtTime(stat.median)} (allowed ${fmtTime(lo)} – ${fmtTime(hi)}; ${stat.reached}/${stat.runs} runs reached)`,
      });
    }
    if (stat.policy === 'offline-heavy') {
      const limit = stat.target * offlineFactor * (1 + tolerance);
      checks.push({
        name: `${label}: offline-heavy within ${offlineFactor}x of the active target`,
        pass: stat.median <= limit,
        detail: `median ${fmtTime(stat.median)} (limit ${fmtTime(limit)} = ${offlineFactor}x target +${tolerance * 100}%; ${stat.reached}/${stat.runs} runs reached)`,
      });
    }
  }

  for (const gap of agg.gaps) {
    if (gap.policy !== 'greedy-best-roi' && gap.policy !== 'offline-heavy') continue;
    checks.push({
      name: `No wall over ${maxGapSeconds / 60} min of active play: ${gap.policy}`,
      pass: gap.maxGapWorst <= maxGapSeconds,
      detail: `longest gap between purchases ${fmtTime(gap.maxGapWorst)} (at ${fmtTime(gap.maxGapWorstAt)} into the run); typical run's longest ${fmtTime(gap.maxGapMedian)}`,
    });
  }

  checks.push({
    name: 'No NaN/Infinity in any currency',
    pass: agg.numericFailures === 0,
    detail: `${agg.numericFailures} of ${agg.runs} runs hit a non-finite number`,
  });
  return checks;
}

export { fmtTime };
