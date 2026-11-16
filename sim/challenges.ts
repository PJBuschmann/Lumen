/**
 * npx tsx sim/challenges.ts [seed] [minutes]
 *
 * Measures how far each Aurora challenge can be pushed by a player who has just unlocked
 * the Aurora: plays the best-ROI bot to the unlock, then enters each challenge on a copy
 * of that game and lets the night run. Prints log10 of the Light reached, which is what
 * the tier goals in src/content/aurora.ts are set against.
 */
import { CHALLENGE_ORDER } from '../src/content/aurora';
import { advanceInPlace, applyActionInPlace, cloneState, formatDuration } from '../src/engine';
import { applyOverrides } from './params';
import { runBotWithState } from './runner';

const seed = Number(process.argv[2] ?? 1000);
const minutes = Number(process.argv[3] ?? 15);
applyOverrides(process.argv[4]);

const { result, state } = runBotWithState({
  policy: 'greedy-best-roi',
  seed,
  horizonSeconds: 40 * 86400,
  stopAfter: 'auroraUnlocked',
});
console.log(`Aurora unlocked at ${formatDuration(result.milestones.auroraUnlocked ?? NaN)}; record night Light 1e${state.stats.bestRunLight.log10().toFixed(0)}`);

const normal = cloneState(state);
applyActionInPlace(normal, { type: 'ascend' });
advanceInPlace(normal, minutes * 60);
const baseline = normal.night.runLight.log10();
console.log(`An ordinary night reaches 1e${baseline.toFixed(0)} in ${minutes} min\n`);

for (const id of CHALLENGE_ORDER) {
  const game = cloneState(state);
  // Use a very high bar so the night is not ended by completing a tier.
  game.aurora.completions[id] = 0;
  if (!applyActionInPlace(game, { type: 'enterChallenge', id })) {
    console.log(`${id.padEnd(12)} could not be entered`);
    continue;
  }
  let reach = 0;
  for (let t = 0; t < minutes * 60; t += 30) {
    advanceInPlace(game, 30);
    if (game.aurora.active !== id) {
      // Completed a tier and left; step back in to keep measuring.
      applyActionInPlace(game, { type: 'enterChallenge', id });
    }
    if (game.night.runLight.gt(1)) reach = Math.max(reach, game.night.runLight.log10());
  }
  console.log(`${id.padEnd(12)} reaches 1e${reach.toFixed(0).padEnd(6)} (${((reach / baseline) * 100).toFixed(0)}% of an ordinary night)`);
}
