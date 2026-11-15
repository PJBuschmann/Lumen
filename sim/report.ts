/**
 * Writes the simulator outputs: CSV files and a self-contained HTML report
 * (no network, no dependencies; charts are drawn by sim/report.client.js).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACING } from '../src/content/pacing';
import { MILESTONE_LABELS, fmtTime, pacingChecks, pacingMilestones } from './aggregate';
import type { Aggregate } from './aggregate';
import { POLICIES } from './bots/policies';
import { GAP_BUCKETS } from './runner';
import type { RunResult } from './runner';

const QUANTITIES = [
  { key: 'light', title: 'Lifetime Light', note: 'Orders of magnitude of all Light ever earned, median across seeds. Time axis is logarithmic.' },
  { key: 'rate', title: 'Light per second', note: 'Orders of magnitude of the current income; dips are prestige resets.' },
  { key: 'glimmer', title: 'Glimmer', note: 'Orders of magnitude of Glimmer gathered in the current run.' },
] as const;

const SHORT_LABELS: Record<string, string> = {
  firstDawn: 'Dawn',
  firstCoast: 'Coast',
  firstTides: 'Tides',
  firstStar: 'Stars',
  auroraUnlocked: 'Aurora',
};

function csv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map((cell) => (typeof cell === 'number' && !Number.isFinite(cell) ? '' : String(cell))).join(',')).join('\n') + '\n';
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function writeCsvs(outDir: string, results: RunResult[], agg: Aggregate): void {
  mkdirSync(outDir, { recursive: true });
  const milestoneIds = pacingMilestones();

  writeFileSync(
    join(outDir, 'milestones.csv'),
    csv([
      ['policy', 'seed', 'milestone', 'wall_seconds', 'active_seconds'],
      ...results.flatMap((r) =>
        milestoneIds.map((id) => [
          r.policy,
          r.seed,
          id,
          (r.milestones as Record<string, number | undefined>)[id] ?? NaN,
          (r.activeMilestones as Record<string, number | undefined>)[id] ?? NaN,
        ]),
      ),
    ]),
  );
  writeFileSync(
    join(outDir, 'milestone_summary.csv'),
    csv([
      ['policy', 'milestone', 'target_seconds', 'runs', 'reached', 'median_seconds', 'p10_seconds', 'p90_seconds', 'min_seconds', 'max_seconds', 'median_over_target'],
      ...agg.milestones.map((m) => [m.policy, m.milestone, m.target, m.runs, m.reached, m.median, m.p10, m.p90, m.min, m.max, m.median / m.target]),
    ]),
  );
  writeFileSync(
    join(outDir, 'purchase_gaps.csv'),
    csv([
      ['policy', 'gap_up_to_seconds', 'count', 'share'],
      ...agg.gaps.flatMap((g) => {
        const total = g.histogram.reduce((a, b) => a + b, 0) || 1;
        return g.histogram.map((count, i) => [g.policy, Number.isFinite(GAP_BUCKETS[i]) ? GAP_BUCKETS[i] : 'inf', count, count / total]);
      }),
    ]),
  );
  writeFileSync(
    join(outDir, 'purchase_gap_summary.csv'),
    csv([
      ['policy', 'median_purchases', 'typical_longest_gap_seconds', 'worst_longest_gap_seconds', 'worst_gap_ended_at_seconds'],
      ...agg.gaps.map((g) => [g.policy, g.purchasesMedian, g.maxGapMedian, g.maxGapWorst, g.maxGapWorstAt]),
    ]),
  );
  const keys = QUANTITIES.map((q) => q.key);
  writeFileSync(
    join(outDir, 'growth.csv'),
    csv([
      ['policy', 't_seconds', ...keys.map((k) => `${k}_log10`)],
      ...agg.growth.flatMap((g) => g.t.map((t, i) => [g.policy, Math.round(t), ...keys.map((k) => Number(g.series[k][i].toFixed(3)))])),
    ]),
  );
  writeFileSync(
    join(outDir, 'runs.csv'),
    csv([
      ['policy', 'seed', 'wall_seconds', 'active_seconds', 'sessions', 'purchases', 'longest_gap_seconds', 'final_light_log10', 'numeric_failure', 'compute_ms'],
      ...results.map((r) => [r.policy, r.seed, Math.round(r.wallSeconds), Math.round(r.activeSeconds), r.sessions, r.purchases, Math.round(r.maxGap), Number(r.finalLightLog.toFixed(2)), r.numericFailure ? 1 : 0, Math.round(r.computeMs)]),
    ]),
  );
}

export function writeHtml(outDir: string, agg: Aggregate, overrides: Record<string, number>): void {
  mkdirSync(outDir, { recursive: true });
  const checks = pacingChecks(agg);
  const passed = checks.filter((c) => c.pass).length;
  const milestoneIds = pacingMilestones();

  const data = {
    policies: agg.policies,
    tolerance: PACING.tolerance,
    offlineFactor: PACING.offlineFactor,
    maxGapSeconds: PACING.maxGapSeconds,
    gapBuckets: GAP_BUCKETS.map((b) => (Number.isFinite(b) ? b : null)),
    milestones: milestoneIds.map((id) => ({
      id,
      label: MILESTONE_LABELS[id],
      short: SHORT_LABELS[id] ?? id,
      target: PACING.targets[id],
      rows: agg.policies.map((policy) => {
        const stat = agg.milestones.find((m) => m.policy === policy && m.milestone === id);
        return stat
          ? { median: Number.isFinite(stat.median) ? stat.median : null, p10: stat.p10, p90: stat.p90 }
          : { median: null, p10: null, p90: null };
      }),
    })),
    quantities: QUANTITIES,
    growth: agg.growth,
    gaps: agg.gaps,
  };
  // JSON has no NaN/Infinity; the client treats null medians as "not reached".
  const json = JSON.stringify(data, (_key, value) => (typeof value === 'number' && !Number.isFinite(value) ? null : value))
    .replace(/</g, '\\u003c');
  const client = readFileSync(fileURLToPath(new URL('./report.client.js', import.meta.url)), 'utf8')
    // medians arrive as null when not reached; the charts expect NaN.
    .replace("var data = JSON.parse(document.getElementById('report-data').textContent);", "var data = JSON.parse(document.getElementById('report-data').textContent, function (k, v) { return v === null && (k === 'median' || k === 'p10' || k === 'p90') ? NaN : v; });");

  const checkRows = checks
    .map(
      (c) => `<tr>
        <td><span class="status ${c.pass ? 'good' : 'critical'}"><span class="status-icon" aria-hidden="true">${c.pass ? '✓' : '✕'}</span>${c.pass ? 'Pass' : 'Fail'}</span></td>
        <td>${esc(c.name)}</td>
        <td class="muted">${esc(c.detail)}</td>
      </tr>`,
    )
    .join('\n');

  const milestoneHeader = agg.policies.map((p) => `<th scope="col">${esc(p)}</th>`).join('');
  const milestoneRows = milestoneIds
    .map((id) => {
      const cells = agg.policies
        .map((policy) => {
          const stat = agg.milestones.find((m) => m.policy === policy && m.milestone === id);
          if (!stat || !Number.isFinite(stat.median)) return '<td class="num muted">not reached</td>';
          return `<td class="num">${fmtTime(stat.median)}<span class="muted"> (${fmtTime(stat.p10)} – ${fmtTime(stat.p90)})</span></td>`;
        })
        .join('');
      return `<tr><th scope="row">${esc(MILESTONE_LABELS[id])}</th><td class="num">${fmtTime(PACING.targets[id])}</td>${cells}</tr>`;
    })
    .join('\n');

  const gapRows = agg.gaps
    .map(
      (g) =>
        `<tr><th scope="row">${esc(g.policy)}</th><td class="num">${Math.round(g.purchasesMedian)}</td><td class="num">${fmtTime(g.maxGapMedian)}</td><td class="num">${fmtTime(g.maxGapWorst)}</td><td class="num">${fmtTime(g.maxGapWorstAt)}</td></tr>`,
    )
    .join('\n');

  const policyList = agg.policies.map((p) => `<li><strong>${esc(p)}</strong> — ${esc(POLICIES[p].description)}</li>`).join('\n');
  const overrideNote = Object.keys(overrides).length
    ? `<p class="note">Balance overrides in this run: ${esc(Object.entries(overrides).map(([k, v]) => `${k}=${v}`).join(', '))}</p>`
    : '';

  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lumen balance report</title>
<style>
:root {
  color-scheme: light;
  --plane: #f9f9f7; --surface-1: #fcfcfb; --text-primary: #0b0b0b; --text-secondary: #52514e; --muted: #898781;
  --grid: #e1e0d9; --axis: #c3c2b7; --border: rgba(11,11,11,0.10); --band: rgba(42,120,214,0.09);
  --series-1: #2a78d6; --series-2: #eb6834; --series-3: #1baf7a; --series-4: #eda100;
  --good: #0ca30c; --critical: #d03b3b;
}
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --plane: #0d0d0d; --surface-1: #1a1a19; --text-primary: #f0efec; --text-secondary: #c3c2b7; --muted: #898781;
    --grid: #2c2c2a; --axis: #383835; --border: rgba(255,255,255,0.10); --band: rgba(57,135,229,0.14);
    --series-1: #3987e5; --series-2: #d95926; --series-3: #199e70; --series-4: #c98500;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--plane); color: var(--text-primary); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1120px; margin: 0 auto; padding: 32px 20px 64px; }
h1 { font-size: 28px; margin: 0 0 4px; }
h2 { font-size: 19px; margin: 40px 0 6px; }
h3 { font-size: 15px; margin: 0 0 2px; display: flex; align-items: center; gap: 6px; }
p { margin: 6px 0; }
.lede, .note, .muted { color: var(--text-secondary); }
.note { font-size: 13px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin: 20px 0 0; }
.tile { background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; }
.tile .label { color: var(--text-secondary); font-size: 13px; }
.tile .value { font-size: 24px; font-weight: 600; }
.card, .chart-card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; margin-top: 12px; }
.chart-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; }
.chart-grid .chart-card { margin-top: 0; }
.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--grid); vertical-align: top; }
thead th { color: var(--text-secondary); font-weight: 600; font-size: 13px; }
td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.status { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; white-space: nowrap; }
.status-icon { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; color: #fff; font-size: 12px; }
.status.good .status-icon { background: var(--good); }
.status.critical .status-icon { background: var(--critical); }
svg { width: 100%; height: auto; display: block; overflow: visible; }
.grid { stroke: var(--grid); stroke-width: 1; }
.axis { stroke: var(--axis); stroke-width: 1; }
.ref { stroke: var(--axis); stroke-width: 1; }
.band { fill: var(--band); }
.tick, .ref-label { fill: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.row-label { fill: var(--text-primary); font-size: 13px; font-weight: 600; }
.end-label { fill: var(--text-secondary); font-size: 11px; }
.line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.range { stroke-width: 2; stroke-linecap: round; opacity: 0.55; }
.dot, .end-dot { stroke: var(--surface-1); stroke-width: 2; }
.crosshair { stroke: var(--text-secondary); stroke-width: 1; pointer-events: none; }
rect[tabindex]:focus-visible { outline: 2px solid var(--series-1); outline-offset: 2px; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 8px 0 6px; font-size: 13px; color: var(--text-secondary); }
.legend-item { display: inline-flex; align-items: center; gap: 6px; }
.legend-line { width: 16px; height: 2px; border-radius: 1px; display: inline-block; }
.legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
#tooltip { position: fixed; z-index: 10; pointer-events: none; background: var(--surface-1); color: var(--text-primary); border: 1px solid var(--border); border-radius: 10px; padding: 8px 10px; font-size: 13px; box-shadow: 0 6px 24px rgba(0,0,0,0.18); max-width: 280px; }
.tt-title { color: var(--text-secondary); margin-bottom: 4px; }
.tt-row { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.tt-key { width: 12px; height: 2px; border-radius: 1px; display: inline-block; }
.tt-label { color: var(--text-secondary); }
details { margin-top: 12px; }
summary { cursor: pointer; color: var(--text-secondary); }
ul { padding-left: 20px; }
</style>
</head>
<body>
<main>
  <h1>Lumen balance report</h1>
  <p class="lede">${agg.runs} simulated games (${agg.policies.length} strategies × ${agg.seeds} seeds), ${agg.sessions.toLocaleString('en-US')} play sessions, ${(agg.simulatedSeconds / 86400).toFixed(0)} in-game days, computed in ${(agg.computeMs / 1000).toFixed(1)} s of CPU time.</p>
  ${overrideNote}

  <div class="tiles">
    <div class="tile"><div class="label">Pacing checks passed</div><div class="value">${passed} / ${checks.length}</div></div>
    <div class="tile"><div class="label">Largest number reached</div><div class="value">1e${Math.round(agg.peakLightLog).toLocaleString('en-US')}</div></div>
    <div class="tile"><div class="label">Sessions simulated</div><div class="value">${agg.sessions.toLocaleString('en-US')}</div></div>
    <div class="tile"><div class="label">Horizon per game</div><div class="value">${fmtTime(agg.horizonSeconds)}</div></div>
  </div>

  <h2>Pacing checks</h2>
  <div class="card table-wrap">
    <table>
      <thead><tr><th scope="col">Result</th><th scope="col">Check</th><th scope="col">Measured</th></tr></thead>
      <tbody>${checkRows}</tbody>
    </table>
  </div>

  <h2>Time to milestone</h2>
  <p class="note">Each dot is a strategy's median time to reach a milestone, as a multiple of the active-play target; the line spans the 10th to 90th percentile across seeds. The shaded band is the ±${PACING.tolerance * 100}% the best-ROI bot must land in; the offline-heavy player may take up to the offline limit.</p>
  <div class="card" id="chart-ratios"></div>
  <details open>
    <summary>Table: median time to milestone (10th – 90th percentile)</summary>
    <div class="card table-wrap">
      <table>
        <thead><tr><th scope="col">Milestone</th><th scope="col">Target</th>${milestoneHeader}</tr></thead>
        <tbody>${milestoneRows}</tbody>
      </table>
    </div>
  </details>

  <h2>Currency growth</h2>
  <p class="note">Median across seeds. The vertical marks are the pacing targets. Full data: <code>growth.csv</code>.</p>
  <div id="charts-growth"></div>

  <h2>Purchase gaps</h2>
  <p class="note">How long a player goes between purchases, measured in time at the keyboard. Nothing should fall right of the ${PACING.maxGapSeconds / 60}-minute mark.</p>
  <div class="chart-grid" id="charts-gaps"></div>
  <details open>
    <summary>Table: purchases and longest gaps</summary>
    <div class="card table-wrap">
      <table>
        <thead><tr><th scope="col">Strategy</th><th scope="col">Purchases per game</th><th scope="col">Typical longest gap</th><th scope="col">Worst longest gap</th><th scope="col">Worst gap ended at</th></tr></thead>
        <tbody>${gapRows}</tbody>
      </table>
    </div>
  </details>

  <h2>Strategies</h2>
  <div class="card"><ul>${policyList}</ul></div>
</main>
<div id="tooltip" hidden></div>
<script id="report-data" type="application/json">${json}</script>
<script>${client}</script>
</body>
</html>
`;
  writeFileSync(join(outDir, 'report.html'), page);
}
