import { useEffect } from 'react';
import {
  formatDuration,
  formatNumber,
  formatPercent,
  getDerived,
  nightUpgradeAffordable,
  nightUpgradeCost,
  nightUpgradeMaxLevel,
} from '../engine';
import { NIGHT, NIGHT_UPGRADE_ORDER } from '../content/night';
import { startLoop } from './runtime/loop';
import { loadGame } from './runtime/persistence';
import { dismissOfflineSummary, dispatch, useGameStore } from './runtime/store';

/** First playable build: the Night layer. The full scenes arrive with later milestones. */
export function App() {
  const ready = useGameStore((s) => s.ready);
  const game = useGameStore((s) => s.game);
  const offline = useGameStore((s) => s.offline);

  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    void loadGame().then(() => {
      if (!cancelled) stop = startLoop();
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  if (!ready) return <main className="app loading">Lighting the lamp…</main>;

  const derived = getDerived(game);
  return (
    <main className="app">
      <header className="top">
        <h1>Lumen</h1>
        <p className="light">{formatNumber(game.night.light)} Light</p>
        <p className="rate">
          {formatNumber(derived.lightPerSecond)} / s · {formatNumber(derived.lightPerShip)} per ship ·{' '}
          {formatPercent(derived.guideChance)} guided
        </p>
        <p className="rate">
          {game.night.shipsGuided} ships guided · {game.night.shipsMissed} drifted by
        </p>
      </header>

      <section className="upgrades">
        {NIGHT_UPGRADE_ORDER.map((id) => {
          const def = NIGHT.upgrades[id];
          const level = game.night.upgrades[id];
          const maxed = level >= nightUpgradeMaxLevel(id);
          const affordable = nightUpgradeAffordable(id, level, game.night.light) > 0;
          return (
            <button
              key={id}
              className="upgrade"
              disabled={maxed || !affordable}
              onClick={() => dispatch({ type: 'buyNightUpgrade', id })}
            >
              <span className="name">
                {def.name} <small>Lv {level}</small>
              </span>
              <span className="desc">{def.description}</span>
              <span className="cost">{maxed ? 'Complete' : `${formatNumber(nightUpgradeCost(id, level))} Light`}</span>
            </button>
          );
        })}
      </section>

      {offline && (
        <div className="sheet" role="dialog" aria-label="While you were away">
          <h2>While you were away</h2>
          <p>
            {formatDuration(offline.appliedSeconds)} passed{offline.capped ? ' (the lamp burns for a day at most)' : ''}.
          </p>
          <p>
            {offline.shipsGuided} ships found their way and left {formatNumber(offline.lightEarned)} Light.
          </p>
          <button onClick={dismissOfflineSummary}>Back to the lamp</button>
        </div>
      )}
    </main>
  );
}
