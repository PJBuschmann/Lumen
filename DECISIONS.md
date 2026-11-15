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
