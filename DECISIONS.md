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

## The wider layers (Coastline, Tides, and above)

- **Wider layers earn their currency over time, not per reset.** Stone is surveyed
  continuously at a rate set by the highest Glimmer ever held; Tide is drawn continuously at
  a rate set by the coastline's power. The layer's prestige ("Survey the coast", "Turn the
  tide") brings the waiting income home and begins a new night. Why: a classic "currency per
  reset" formula makes progress proportional to how often you reset, which would leave a
  four-sessions-a-day player dozens of times slower than an always-present one. Time-based
  income keeps the two within the required factor of two.
- **Income and costs are polynomials of the same degree** (rate ∝ power², cost ∝ level²).
  With matching degrees, purchases arrive at a steady cadence for weeks: no exponential
  blow-up and no walls. Exponential feel comes from what the purchases do: each adds orders
  of magnitude to Light.
- **A wider prestige only resets Night and Dawn.** Lighthouses, the shape of the tides and
  (later) stars are never lost. This fits "nothing is ever lost" and keeps a reset cheap: the
  layers below are automated and climb back in minutes.
- **Stone income follows the Glimmer record, which only rises**, so a Survey never lowers
  income; it only delays pushing the record further.
- **Automation chain.** First Dawn: the apprentice buys Night upgrades. First Survey: Dawn's
  Glimmer flows in continuously (1% of a Dawn per second, no reset) and Dawn upgrades are
  bought. First Turn of the tide: Stone arrives without Surveys and lighthouses are built by
  best value. Each handover also collects anything left waiting.
- **Synergy is per shared level between orthogonal neighbours** (`min(levelA, levelB)`), so
  clusters of evenly raised lighthouses beat one tall tower. Headlands and reefs trade cost
  for power.
- **The moon is real time**: eight phases of 90 s (before Linger). Phases trade ship traffic
  against Light per ship, so income breathes without ever stopping. Swell is spent per phase:
  every level helps always, and again while its phase is in the sky. Linger stretches a phase;
  stretching busy phases raises Tide income.

## Dawn, revised during the first Coastline balance pass

- **The apprentice tends the whole lamp from the first Dawn** (no lessons to buy). Before
  this change a player who left after their first Dawn came back to a stalled night: only
  the wick was tended, so four hours away were worth minutes. The schema 2 -> 3 migration
  hands back Glimmer spent on lessons.
- **A long night makes a brighter dawn**: Glimmer is multiplied by `(1 + hours)^1.5`, capped
  at 24 h, with a "Long vigil" upgrade that raises the exponent. Without it, rapid manual
  resets beat patient play by a wide margin and the offline player reached the Coastline at
  hour 24 instead of hour 4.
- **The offline-heavy player's first sitting is 20 minutes** (later ones 15). The first Dawn
  is designed to land at minute 15; a first session that ends on exactly that minute would
  turn a one-second difference into a four-hour one.
- **Important events are never crowded out.** Ship and automatic-purchase events are capped
  per tick; milestones, reveals, prestiges and moon phases always get through.

## Constellations and Aurora

- **The star map is generated from a small description** (`src/content/stars.ts`): Polaris,
  four inner and eight outer constellations of seven stars each (four beacons, two
  income/utility stars, one keystone), laid out from four hand-drawn shapes. 85 stars in
  all. Star levels are saved by star id, so the map can be redrawn without breaking saves.
- **A star can only be lit next to a lit star.** Lighting costs grow with the number lit;
  brightening costs grow with the star's own level; both are polynomials like every wider
  layer. Completing a constellation gives a bonus, announced as an event.
- **"First Constellation" is the first Ascension** (the Stars layer's prestige), which is also
  when the tides start reshaping themselves.
- **Aurora challenges cannot be failed and never slow the rest of the game.** A challenge is
  a fresh night under a rule; leaving costs nothing. Income of Stone, Tide and Stardust uses
  the un-nerfed structures, so trying a challenge is never a setback.
- **Challenge goals are set from measurement, not guesswork.** `npx tsx sim/challenges.ts`
  plays to the Aurora unlock and reports how far each challenge can be pushed; tier goals sit
  at about 0.9x, 1.15x, 1.45x, 1.85x and 2.4x of that. The first tier of each is within reach
  on arrival; the last tiers are weeks of endgame.
- **The first completed challenge automates the star map**, completing the chain: each layer
  tends the one below it.
- **The 30-minute purchase-gap rule is checked up to the Aurora unlock.** Beyond it the only
  manual verbs are challenges, whose goals are deliberately far apart.

## Exactness and speed

- **Ships are counted from elapsed time within a segment** (a stretch of constant traffic and
  guide chance) instead of frame by frame. A test caught a 6% offline/online drift after two
  hours: per-frame rounding could push a ship across a heartbeat and delay the apprentice by
  a beat. Now any slicing of time gives the same ship counts; offline and online agree to
  about one part in 10^11.
- **Two caches on the state**: `structure` (lighthouses, tides, stars, challenge rewards;
  rebuilt only when a structure is bought) and `derived` (per-night rates). Automation skips
  a wider layer in one comparison when the purse is below its cheapest purchase.
- **The heartbeat stretches from 1 s to 64 s as a night ages** (step at most 1/16 of the
  night's age). An 18-day game simulates in about five seconds.
