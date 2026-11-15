/**
 * Engine-wide timing data: the automation heartbeat and offline rules.
 *
 * The heartbeat is the only moment automation and passive flows act. It is scheduled on a
 * fixed grid of "seconds since the night began", so stepping the engine in 16 ms frames or in
 * one 24 h leap visits exactly the same beats. That is what makes offline progress match
 * online progress.
 */
export const ENGINE = {
  heartbeat: {
    /** Seconds between beats at the start of a night. */
    baseInterval: 1,
    /** The interval doubles each time the night's age doubles past this many seconds... */
    stretchAfter: 32,
    /** ...up to this ceiling. Keeps relative step size (interval / age) at or below 1/32. */
    maxInterval: 64,
  },
  offline: {
    /** Offline progress is capped at 24 hours. */
    maxSeconds: 24 * 60 * 60,
    /** Below this, returning to the game shows no summary. */
    minSummarySeconds: 60,
  },
  /** Hard stop for one advance() call; purely a guard against bugs. */
  maxStepsPerAdvance: 50_000_000,
  /** Most cosmetic UI events (ships, automatic purchases) kept from a single tick. */
  maxEventsPerTick: 12,
} as const;
