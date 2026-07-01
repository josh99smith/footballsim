export type League = "pro" | "college";

/** Rule set derived from the chosen league. */
export interface Rules {
  league: League;
  /** College stops the clock on first downs (to reset the chains). */
  clockStopsOnFirstDown: boolean;
  /** Extra-point success rate (pro kicks from farther). */
  xpSuccess: number;
  /** Two-point success rate. */
  twoPointSuccess: number;
  /** Pro pass interference is a spot foul; college caps it at 15 yards. */
  piSpotFoul: boolean;
  /** Overtime format. */
  otType: "college" | "sudden";
  /** Whether a tied game can end in a tie (pro regular season). */
  allowTie: boolean;
  /** Distance from a sideline to a hash mark (college hashes are wider). */
  hashYards: number;
  label: string;
}

const PRO: Rules = {
  league: "pro",
  clockStopsOnFirstDown: false,
  xpSuccess: 0.94,
  twoPointSuccess: 0.47,
  piSpotFoul: true,
  otType: "sudden",
  allowTie: true,
  hashYards: 23.58,
  label: "Pro",
};

const COLLEGE: Rules = {
  league: "college",
  clockStopsOnFirstDown: true,
  xpSuccess: 0.97,
  twoPointSuccess: 0.45,
  piSpotFoul: false,
  otType: "college",
  allowTie: false,
  hashYards: 20,
  label: "College",
};

export function rulesFor(league: League): Rules {
  return league === "college" ? COLLEGE : PRO;
}
