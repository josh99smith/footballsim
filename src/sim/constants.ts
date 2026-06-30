/** Field & simulation constants. All distances in YARDS, time in SECONDS. */

export const FIELD = {
  /** Playing field length between goal lines. */
  LENGTH: 100,
  /** Depth of each end zone. */
  END_ZONE: 10,
  /** Total length including both end zones. */
  TOTAL_LENGTH: 120,
  /** Field width (NFL hash-to-sideline). */
  WIDTH: 53.33,
  /** Distance from sideline to a hash mark. */
  HASH: 23.58,
} as const;

/** Fixed simulation timestep. 60 ticks per second, decoupled from wall clock. */
export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;

/** Hard cap on a single play's duration so the sim can never hang. */
export const MAX_PLAY_TICKS = TICK_HZ * 20;

/** Engagement / interaction radii (yards). */
export const RADII = {
  block: 1.1,
  tackle: 1.0,
  catch: 1.4,
  contest: 2.2,
} as const;
