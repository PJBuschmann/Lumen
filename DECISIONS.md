# Decisions

Choices made where the brief left room, newest sections at the bottom. Each entry says what
was chosen and why, so it can be revisited.

## Architecture

- **Continuous time with scheduled events.** `tick(state, dt)` advances in segments that end
  at the next scheduled event. Inside a segment every rate is constant, so a segment of any
  length is integrated exactly in O(1). This is what lets one function serve 16 ms frames,
  24 h offline catch-up and multi-week simulator runs.
- **Ships are counted with fractional accumulators, not dice.** Arrivals and guided ships
  accumulate fractions and emit whole ships when they cross 1. Ship counts therefore depend
  only on elapsed time, never on frame size, which makes offline progress equal online
  progress by construction. The seeded RNG is reserved for weather, the ship's log and
  bottles, each on its own stream so cosmetic draws can never shift gameplay ones.
- **Automation acts only on a heartbeat.** The heartbeat is scheduled on a fixed grid of
  "seconds since the night began" (1 s, stretching to 64 s as the night ages), so any way of
  slicing time visits the same beats.
- **`tick` and `applyAction` are pure; the simulator uses in-place twins.** `advanceInPlace`
  and `applyActionInPlace` are the same code without the defensive copy, so the simulator
  does not allocate a state per step.
- **Derived values are cached on the state** and invalidated at events. Their inputs may only
  change at events; a comment in `derive.ts` records the rule.
- **Engine state for React is a throttled snapshot (~10 Hz).** The authoritative state
  advances every frame; canvases read it directly, React components read the snapshot. This
  keeps 60 fps scenes without re-rendering the whole tree every frame.

## Numbers

- All currencies are `break_infinity.js` Decimals. Native numbers are used only for levels,
  seconds, probabilities and log10 exponents.
- Formatting never prints `NaN`/`Infinity`: invalid values render as `0`. Suffixes run to
  `Dc` (1e33), then scientific notation.

## Saves

- Saves are JSON `{ schema, savedAt, game }` with Decimals as strings. Loading validates
  every field and repairs bad ones to defaults rather than rejecting the save.
- A save that cannot be read is kept under a separate key instead of being overwritten.
- Export strings are `LUMEN.<base64 json>.<checksum>` so truncated pastes are detected.
- Offline time is measured from the `savedAt` wall-clock stamp, which the UI layer supplies;
  the engine itself never reads a clock.

## Dawn and the apprentice

- **Glimmer is a power law of the night's Light** (`coef * (runLight / threshold)^0.25`) and
  multiplies Light by `(1 + total Glimmer)^0.25`. Spending Glimmer on upgrades never lowers
  the multiplier: it is driven by the total gathered, so buying is never a loss.
- **The apprentice arrives free with the first Dawn** already able to trim the wick; three
  more lessons (oil, rotation, lens) cost Glimmer. Lessons are permanent across every reset.
- **The apprentice buys on the heartbeat, most expensive ratio first**, so cheap wick levels
  only use what is left.

## Simulator

- **Bots are one brain with four policies** (`sim/bots`): how purchases are picked (cheapest
  vs best value), when to prestige (when it would double vs when gain per second has peaked),
  and when the player is present (always vs four sessions a day).
- **Bots tap like people**: 0.5–1.0 s between actions, seeded per run. The runner's
  randomness is separate from the game's RNG streams.
- **"Offline-heavy" means four 15-minute sessions a day at waking hours** (think 08:00, 12:00,
  17:00, 21:00, each up to ±10 min late or early), away the rest. Evenly spaced sessions would
  make the "within 2x" rule impossible for the 2-hour milestone by construction (the second
  session would start at hour 6), so a realistic day is the fairer reading.
- **Pass criteria** (`src/content/pacing.ts`, checked by `npm run sim:check`): best-ROI median
  within ±20% of each target; offline-heavy median within 2x the target (+20% tolerance);
  the longest stretch of active play without a player purchase at most 30 minutes; no
  non-finite numbers. A prestige counts as a purchase; purchases made by automation do not.
- **"Aurora in 2–3 weeks" is read as 17.5 days ±20%**, which is exactly 14 to 21 days.
- **Milestone times are wall-clock from a fresh save**; active time is tracked separately and
  used for purchase gaps.
