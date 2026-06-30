import { FIELD } from "./constants";
import { PlaySim, type PlaySetup } from "./engine";
import { getDefPlay, getOffPlay } from "./playbook";
import { RNG } from "./rng";
import type { Team } from "./roster";
import type { PlayResult, TeamId } from "./types";

export interface GameConfig {
  quarterSeconds: number;
}

export const DEFAULT_CONFIG: GameConfig = { quarterSeconds: 300 };

export interface GameInfo {
  quarter: number;
  clock: number; // seconds left in the quarter
  possession: TeamId;
  down: number;
  distance: number;
  ballOn: number; // yards from the possessing team's own goal (0..100)
  score: { home: number; away: number };
  gameOver: boolean;
  timeouts: { home: number; away: number };
  /** Team that just scored a TD and owes an extra-point / two-point try. */
  pendingConversion: TeamId | null;
}

export type SpecialTeams = "punt" | "fieldGoal";

export type PenaltyKind =
  | "falseStart" | "offside" | "holdingOff" | "passInterference";

export interface PenaltyOutcome {
  text: string;
  /** Team the flag was on. */
  penalizedTeam: TeamId;
  yards: number;
  firstDown: boolean;
}

export interface CommitOutcome {
  /** One-line description for the play-by-play log. */
  text: string;
  scored: boolean;
  changedPossession: boolean;
  firstDown: boolean;
  isScore: { type: "TD" | "FG" | "SAFETY" | "XP" | "TWO"; team: TeamId } | null;
}

const other = (t: TeamId): TeamId => (t === "home" ? "away" : "home");

const ordinalDown = (n: number): string =>
  n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : "4th";

export class GameFlow {
  private cfg: GameConfig;
  readonly rng: RNG;
  readonly teams: { home: Team; away: Team };

  quarter = 1;
  clock: number;
  possession: TeamId = "home";
  down = 1;
  distance = 10;
  ballOn = 25; // after opening kickoff touchback
  score = { home: 0, away: 0 };
  gameOver = false;
  /** Accumulated seconds of possession per team (time of possession). */
  top = { home: 0, away: 0 };
  timeouts = { home: 3, away: 3 };
  pendingConversion: TeamId | null = null;
  /** Set when a timeout/spike should stop the clock on the next play. */
  private clockStopNext = false;
  /** True once the two-minute warning has fired this half. */
  twoMinuteFired = false;

  constructor(teams: { home: Team; away: Team }, rng: RNG, cfg = DEFAULT_CONFIG) {
    this.teams = teams;
    this.rng = rng;
    this.cfg = cfg;
    this.clock = cfg.quarterSeconds;
    // Coin toss: winner receives.
    this.possession = rng.chance(0.5) ? "home" : "away";
  }

  info(): GameInfo {
    return {
      quarter: this.quarter,
      clock: this.clock,
      possession: this.possession,
      down: this.down,
      distance: this.distance,
      ballOn: this.ballOn,
      score: { ...this.score },
      gameOver: this.gameOver,
      timeouts: { ...this.timeouts },
      pendingConversion: this.pendingConversion,
    };
  }

  // ---- rendering geometry ----

  /** Absolute field x (0..120) of the line of scrimmage. */
  losAbs(): number {
    return this.possession === "home"
      ? FIELD.END_ZONE + this.ballOn
      : FIELD.TOTAL_LENGTH - FIELD.END_ZONE - this.ballOn;
  }

  /** +1 if the offense attacks toward +x, -1 otherwise. */
  dir(): 1 | -1 {
    return this.possession === "home" ? 1 : -1;
  }

  firstDownAbs(): number {
    const togo = Math.min(this.distance, 100 - this.ballOn);
    return this.losAbs() + this.dir() * togo;
  }

  isGoalToGo(): boolean {
    return this.ballOn + this.distance >= 100;
  }

  // ---- snap creation ----

  createSnap(offPlayId: string, defPlayId: string): PlaySim {
    const offTeam = this.teams[this.possession];
    const defTeam = this.teams[other(this.possession)];
    const setup: PlaySetup = {
      offPlay: getOffPlay(offPlayId),
      defPlay: getDefPlay(defPlayId),
      offRoster: offTeam.offense,
      defRoster: defTeam.defense,
      ballY: FIELD.WIDTH / 2,
      yardsToGoal: 100 - this.ballOn,
      rng: this.rng,
    };
    return new PlaySim(setup);
  }

  // ---- applying a scrimmage play result ----

  commitPlayResult(result: PlayResult): CommitOutcome {
    const offTeam = this.possession;

    // Interception: possession flips at the spot of the catch.
    if (result.endReason === "interception") {
      const spot = Math.round(this.ballOn + result.yards);
      this.flipPossession(spot);
      this.runClock(result, true, offTeam);
      return {
        text: `INTERCEPTED by ${this.teams[this.possession].abbr} at the ${this.fieldDesc(this.ballOn)}.`,
        scored: false,
        changedPossession: true,
        firstDown: false,
        isScore: null,
      };
    }

    let newBallOn = this.ballOn + result.yards;

    // Touchdown — the extra-point / two-point try is resolved separately so the
    // coach can choose. No kickoff until the conversion is done.
    if (result.touchdown || newBallOn >= 100) {
      this.score[offTeam] += 6;
      this.pendingConversion = offTeam;
      this.runClock(result, true, offTeam);
      return {
        text: `TOUCHDOWN ${this.teams[offTeam].abbr}!`,
        scored: true,
        changedPossession: false,
        firstDown: false,
        isScore: { type: "TD", team: offTeam },
      };
    }

    // Safety: tackled in own end zone.
    if (newBallOn <= 0) {
      this.score[other(offTeam)] += 2;
      this.kickoffTo(offTeam); // conceding team free-kicks
      this.runClock(result, true, offTeam);
      return {
        text: `SAFETY! ${this.teams[other(offTeam)].abbr} take 2.`,
        scored: true,
        changedPossession: true,
        firstDown: false,
        isScore: { type: "SAFETY", team: other(offTeam) },
      };
    }

    this.ballOn = newBallOn;
    const gained = result.yards;
    const gotFirst = gained >= this.distance;
    let changed = false;
    let firstDown = false;

    if (gotFirst) {
      this.down = 1;
      this.distance = this.isGoalToGo() ? 100 - this.ballOn : 10;
      firstDown = true;
    } else {
      this.down++;
      this.distance -= gained;
      if (this.down > 4) {
        // Turnover on downs.
        this.flipPossession(100 - Math.round(this.ballOn));
        changed = true;
      }
    }

    this.runClock(result, result.endReason === "incomplete" || result.endReason === "outOfBounds", offTeam);

    const text = changed
      ? `Turnover on downs. ${this.teams[this.possession].abbr} take over at the ${this.fieldDesc(this.ballOn)}.`
      : firstDown
        ? `${this.describePlay(result)} FIRST DOWN ${this.teams[offTeam].abbr}.`
        : this.describePlay(result);

    return {
      text,
      scored: false,
      changedPossession: changed,
      firstDown,
      isScore: null,
    };
  }

  // ---- special teams ----

  fieldGoalAttempt(): CommitOutcome {
    const offTeam = this.possession;
    const fgDist = 100 - this.ballOn + 17;
    const prob = Math.max(0.04, Math.min(0.99, 1.02 - (fgDist - 20) * 0.017));
    const good = this.rng.chance(prob);
    if (good) {
      this.score[offTeam] += 3;
      this.kickoffTo(other(offTeam));
      this.runClockSeconds(6, offTeam);
      return {
        text: `${fgDist}-yard field goal is GOOD. ${this.teams[offTeam].abbr} +3.`,
        scored: true,
        changedPossession: true,
        firstDown: false,
        isScore: { type: "FG", team: offTeam },
      };
    }
    // Miss: opponent takes over at the spot.
    this.flipPossession(Math.max(20, 100 - this.ballOn));
    this.runClockSeconds(6, offTeam);
    return {
      text: `${fgDist}-yard field goal is NO GOOD. ${this.teams[this.possession].abbr} take over.`,
      scored: false,
      changedPossession: true,
      firstDown: false,
      isScore: null,
    };
  }

  punt(): CommitOutcome {
    const offTeam = this.possession;
    const net = Math.round(38 + this.rng.gaussian() * 6);
    const spot = this.ballOn + net;
    if (spot >= 100) {
      // Touchback.
      this.flipPossession(20);
    } else {
      this.flipPossession(100 - spot);
    }
    this.runClockSeconds(6, offTeam);
    return {
      text: `Punt downed. ${this.teams[this.possession].abbr} take over at the ${this.fieldDesc(this.ballOn)}.`,
      scored: false,
      changedPossession: true,
      firstDown: false,
      isScore: null,
    };
  }

  // ---- conversions & clock management ----

  /** Resolve the extra-point or two-point try owed after a touchdown. */
  resolveConversion(kind: "xp" | "two"): CommitOutcome {
    const team = this.pendingConversion!;
    const abbr = this.teams[team].abbr;
    this.pendingConversion = null;
    let text: string;
    let isScore: CommitOutcome["isScore"] = null;
    if (kind === "two") {
      const good = this.rng.chance(0.47);
      if (good) { this.score[team] += 2; isScore = { type: "TWO", team }; }
      text = good ? `Two-point conversion GOOD. ${abbr} +2.` : `Two-point try NO GOOD.`;
    } else {
      const good = this.rng.chance(0.94);
      if (good) { this.score[team] += 1; isScore = { type: "XP", team }; }
      text = good ? `Extra point good.` : `Extra point MISSED.`;
    }
    this.kickoffTo(other(team));
    return { text, scored: !!isScore, changedPossession: true, firstDown: false, isScore };
  }

  /** Victory-formation kneel: burns clock, loses a yard, advances the down. */
  kneel(): CommitOutcome {
    const offTeam = this.possession;
    this.ballOn = Math.max(1, this.ballOn - 1);
    this.down++;
    this.distance += 1;
    let changed = false;
    if (this.down > 4) { this.flipPossession(100 - Math.round(this.ballOn)); changed = true; }
    this.chargeClock(offTeam, 40);
    return {
      text: changed ? `${this.teams[offTeam].abbr} kneel. Turnover on downs.` : `${this.teams[offTeam].abbr} take a knee.`,
      scored: false, changedPossession: changed, firstDown: false, isScore: null,
    };
  }

  /** Spike to stop the clock: incomplete, costs a down, minimal time. */
  spike(): CommitOutcome {
    const offTeam = this.possession;
    this.down++;
    let changed = false;
    if (this.down > 4) { this.flipPossession(100 - Math.round(this.ballOn)); changed = true; }
    this.chargeClock(offTeam, 2);
    return {
      text: changed ? `${this.teams[offTeam].abbr} spike. Turnover on downs.` : `${this.teams[offTeam].abbr} spike the ball to stop the clock.`,
      scored: false, changedPossession: changed, firstDown: false, isScore: null,
    };
  }

  /** Call a timeout for a team; stops the clock on the next play. */
  useTimeout(team: TeamId): boolean {
    if (this.timeouts[team] <= 0) return false;
    this.timeouts[team]--;
    this.clockStopNext = true;
    return true;
  }

  // ---- penalties ----

  /** Enforce a penalty (no scrimmage play runs). Returns a description for the
   *  log. Possession never changes; some defensive fouls grant a first down. */
  applyPenalty(kind: PenaltyKind): PenaltyOutcome {
    const off = this.possession;
    const abbr = (t: TeamId) => this.teams[t].abbr;

    // Half-the-distance caps so we never cross a goal line.
    const back = (yds: number) => (this.ballOn <= yds * 2 ? Math.floor(this.ballOn / 2) : yds);
    const fwd = (yds: number) =>
      this.ballOn + yds >= 100 ? Math.floor((100 - this.ballOn) / 2) : yds;

    if (kind === "falseStart") {
      const y = back(5);
      this.ballOn -= y;
      this.distance += y;
      return { text: `False start, ${abbr(off)}. ${y} yards, replay ${ordinalDown(this.down)} down.`, penalizedTeam: off, yards: y, firstDown: false };
    }
    if (kind === "holdingOff") {
      const y = back(10);
      this.ballOn -= y;
      this.distance += y;
      return { text: `Holding, ${abbr(off)}. ${y} yards, replay ${ordinalDown(this.down)} down.`, penalizedTeam: off, yards: y, firstDown: false };
    }
    // Defensive fouls advance the offense.
    const def = other(off);
    if (kind === "offside") {
      const y = fwd(5);
      this.ballOn += y;
      this.distance -= y;
      let first = false;
      if (this.distance <= 0) { this.markFirstDown(); first = true; }
      return { text: `Offside, ${abbr(def)}. ${y} yards${first ? ", first down" : ""}.`, penalizedTeam: def, yards: y, firstDown: first };
    }
    // Pass interference: spot foul + automatic first down.
    const y = fwd(15);
    this.ballOn += y;
    this.markFirstDown();
    return { text: `Pass interference, ${abbr(def)}. ${y} yards, automatic first down.`, penalizedTeam: def, yards: y, firstDown: true };
  }

  private markFirstDown(): void {
    this.down = 1;
    this.distance = this.isGoalToGo() ? 100 - this.ballOn : 10;
  }

  // ---- internal helpers ----

  private flipPossession(newOwnYardLine: number): void {
    this.possession = other(this.possession);
    this.ballOn = Math.max(1, Math.min(99, Math.round(newOwnYardLine)));
    this.down = 1;
    this.distance = this.isGoalToGo() ? 100 - this.ballOn : 10;
  }

  private kickoffTo(receiving: TeamId): void {
    this.possession = receiving;
    // Touchback to the 25 with a little variance for returns.
    const ret = this.rng.chance(0.7) ? 25 : Math.max(12, Math.round(20 + this.rng.gaussian() * 8));
    this.ballOn = ret;
    this.down = 1;
    this.distance = 10;
  }

  private runClock(result: PlayResult, clockStops: boolean, chargeTo: TeamId): void {
    const stops = clockStops || this.clockStopNext;
    this.clockStopNext = false;
    const runoff = Math.ceil(result.playTime) + (stops ? 0 : 25);
    this.runClockSeconds(runoff, chargeTo);
  }

  private chargeClock(team: TeamId, sec: number): void {
    this.runClockSeconds(sec, team);
  }

  private runClockSeconds(sec: number, chargeTo: TeamId = this.possession): void {
    this.top[chargeTo] += sec;
    this.clock -= sec;
    // Two-minute warning (end of 2nd & 4th quarters).
    if ((this.quarter === 2 || this.quarter === 4) && this.clock <= 120 && !this.twoMinuteFired) {
      this.twoMinuteFired = true;
    }
    while (this.clock <= 0 && !this.gameOver) {
      if (this.quarter >= 4) {
        this.clock = 0;
        this.gameOver = true;
        return;
      }
      this.quarter++;
      this.clock += this.cfg.quarterSeconds;
      this.twoMinuteFired = false; // reset each quarter
      if (this.quarter === 3) {
        // Halftime: reset timeouts and kick off to the team that didn't receive.
        this.timeouts = { home: 3, away: 3 };
        this.kickoffTo(this.possession === "home" ? "away" : "home");
      }
    }
  }

  private describePlay(r: PlayResult): string {
    const off = this.teams[this.possession].abbr;
    if (r.endReason === "sack") return `SACKED for a loss of ${Math.abs(Math.round(r.yards))}.`;
    if (r.isPass) {
      if (r.passResult === "incomplete") return `Pass incomplete.`;
      return `${off} pass complete for ${Math.round(r.yards)} yards.`;
    }
    return `${off} run for ${Math.round(r.yards)} yards.`;
  }

  /** Human-readable field position, e.g. "OWN 32" / "OPP 8". */
  fieldDesc(ballOn: number): string {
    if (ballOn === 50) return "50";
    return ballOn < 50 ? `OWN ${Math.round(ballOn)}` : `OPP ${Math.round(100 - ballOn)}`;
  }
}
