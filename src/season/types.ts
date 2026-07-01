import type { League } from "../sim/rules";
import type { Team } from "../sim/roster";
import type { Gameplan } from "../sim/gameplan";

/** Per-player career metadata that lives alongside the (mutable) ratings. */
export interface PlayerMeta {
  age: number;
  /** OVR ceiling this player can develop toward (young players climb to it). */
  potential: number;
}

/** One league member: its roster (with live ratings) + career meta + record. */
export interface SeasonTeam {
  /** Stable library id (e.g. "kc"), also used for player-id prefixes. */
  key: string;
  name: string;
  abbr: string;
  color: string;
  strength: number;
  roster: Team;
  meta: Record<string, PlayerMeta>;
}

export interface Matchup {
  home: number; // index into teams[]
  away: number;
}

export interface GameResult extends Matchup {
  homeScore: number;
  awayScore: number;
  /** True once this matchup has been played/simmed. */
  played: boolean;
  /** True if this was the user's game (full engine) rather than a quick-sim. */
  user?: boolean;
}

/** A single player's offseason change, for the report. */
export interface ProgressEntry {
  key: string; // team key
  playerId: string;
  name: string;
  pos: string;
  number: number;
  oldOvr: number;
  newOvr: number;
  age: number;
  retired?: boolean;
  rookie?: boolean;
  /** For a retirement: the veteran who was replaced by this rookie. */
  replacedName?: string;
}

export type SeasonPhase = "regular" | "championship" | "offseason" | "complete";

export interface SeasonState {
  league: League;
  seed: number;
  year: number;
  /** 0-based index into `schedule` (or the championship pseudo-week). */
  week: number;
  userTeam: number; // index into teams[]
  teams: SeasonTeam[];
  /** schedule[w] = all matchups for week w (regular season only). */
  schedule: Matchup[][];
  /** results[w] = played games for that week; championship uses week index. */
  results: GameResult[][];
  phase: SeasonPhase;
  /** The user's standing game plan (adjustable before each game). */
  userGameplan: Gameplan;
  /** Head-coach archetype id for the franchise. */
  userCoach: string;
  /** Last offseason's report, shown on the offseason screen. */
  lastReport: ProgressEntry[];
  /** Champion team key once the season completes (null mid-season). */
  championKey: string | null;
}

export interface StandingRow {
  idx: number;
  key: string;
  name: string;
  abbr: string;
  color: string;
  ovr: number;
  w: number;
  l: number;
  pf: number;
  pa: number;
  diff: number;
}
