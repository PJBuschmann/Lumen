/**
 * Pacing targets the simulator checks the balance against.
 * Times are wall-clock seconds from a fresh save for a player who is always present
 * ("active"); the offline-heavy player gets `offlineFactor` times as long.
 */
export const PACING = {
  targets: {
    firstDawn: 15 * 60,
    firstCoast: 2 * 3600,
    firstTides: 24 * 3600,
    firstStar: 5 * 86400,
    /** "2-3 weeks": the middle, so that +/-20% spans exactly 14 to 21 days. */
    auroraUnlocked: 17.5 * 86400,
  },
  /** Allowed deviation from each target for the best-ROI bot. */
  tolerance: 0.2,
  /** The offline-heavy player must reach each milestone within this multiple of the target. */
  offlineFactor: 2,
  /** No stretch of active play longer than this without a purchase. */
  maxGapSeconds: 30 * 60,
  /**
   * The offline-heavy player: four short sessions a day during waking hours
   * (think 08:00, 12:00, 17:00, 21:00), away the rest of the time.
   */
  offlineSchedule: {
    sessionStartHours: [0, 4, 9, 13],
    sessionMinutes: 15,
    /** The very first sitting runs a little longer: a new player is still looking around. */
    firstSessionMinutes: 20,
  },
} as const;

export type PacingMilestone = keyof typeof PACING.targets;
