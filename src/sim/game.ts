import { FIELD } from "./constants";
import { PlaySim, type PlaySetup } from "./engine";
import { getDefPlay, getOffPlay } from "./playbook";
import { applyGameplan, NEUTRAL_GAMEPLAN, type Gameplan } from "./gameplan";
import { rulesFor, type League, type Rules } from "./rules";
import { RNG } from "./rng";
import type { Team } from "./roster";
import type { PlayResult, TeamId } from "./types";

export interface GameConfig {
  quarterSeconds: number;
  league?: League;
}

export const DEFAULT_CONFIG: GameConfig = { quarterSeconds: 300, league: "pro" };

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
  league: League;
  /** 0 in regulation; the overtime period/round number once in OT. */
  overtime: number;
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
  readonly rules: Rules;
  readonly teams: { home: Team; away: Team };

  quarter = 1;
  clock: number;
  /** 0 in regulation; OT period (sudden) or round (college) once in overtime. */
  overtime = 0;
  possession: TeamId = "home";
  down = 1;
  distance = 10;
  ballOn = 25; // after opening kickoff touchback
  score = { home: 0, away: 0 };
  gameOver = false;
  /** Accumulated seconds of possession per team (time of possession). */
  top = { home: 0, away: 0 };
  /** Per-team game plans (rating emphasis). */
  gameplans: Record<TeamId, Gameplan> = { home: { ...NEUTRAL_GAMEPLAN }, away: { ...NEUTRAL_GAMEPLAN } };
  timeouts = { home: 3, away: 3 };
  pendingConversion: TeamId | null = null;
  /** Set when a timeout/spike should stop the clock on the next play. */
  private clockStopNext = false;
  /** True once the two-minute warning has fired this half. */
  twoMinuteFired = false;
  // overtime bookkeeping
  private otFirstTeam: TeamId = "home";
  private otPoss = 0; // possessions taken in the current college-OT round

  constructor(teams: { home: Team; away: Team }, rng: RNG, cfg = DEFAULT_CONFIG) {
    this.teams = teams;
    this.rng = rng;
    this.cfg = cfg;
    this.rules = rulesFor(cfg.league ?? "pro");
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
      league: this.rules.league,
      overtime: this.overtime,
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
    const offPlan = this.gameplans[this.possession];
    const defPlan = this.gameplans[other(this.possession)];
    const setup: PlaySetup = {
      offPlay: getOffPlay(offPlayId),
      defPlay: getDefPlay(defPlayId),
      offRoster: offTeam.offense.map((pl) => ({ ...pl, ratings: applyGameplan(pl.ratings, pl.pos, offPlan) })),
      defRoster: defTeam.defense.map((pl) => ({ ...pl, ratings: applyGameplan(pl.ratings, pl.pos, defPlan) })),
      ballY: FIELD.WIDTH / 2,
      yardsToGoal: 100 - this.ballOn,
      defPress: defPlan.press,
      rng: this.rng,
    };
    return new PlaySim(setup);
  }

  /** Set a team's game plan (offense axes apply when it has the ball, defense
   *  axes when it's defending — both live on the same plan object). */
  setGameplan(team: TeamId, plan: Gameplan): void {
    this.gameplans[team] = { ...plan };
  }

  // ---- applying a scrimmage play result ----

  commitPlayResult(result: PlayResult): CommitOutcome {
    const offTeam = this.possession;

    // Interception: possession flips at the spot of the catch.
    if (result.endReason === "interception") {
      if (this.isCollegeOT) {
        this.endCollegeOTPossession();
        return { text: `INTERCEPTED! ${this.teams[offTeam].abbr}'s possession ends.`, scored: false, changedPossession: true, firstDown: false, isScore: null };
      }
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

    // Field position is whole yards (stats round the same way).
    const gain = Math.round(result.yards);
    const newBallOn = this.ballOn + gain;

    // Touchdown — the extra-point / two-point try is resolved separately so the
    // coach can choose. No kickoff until the conversion is done.
    if (result.touchdown || newBallOn >= 100) {
      this.score[offTeam] += 6;
      if (this.suddenScore()) {
        return { text: `TOUCHDOWN ${this.teams[offTeam].abbr}! Ballgame.`, scored: true, changedPossession: false, firstDown: false, isScore: { type: "TD", team: offTeam } };
      }
      this.pendingConversion = offTeam; // conversion (then OT possession end) resolves next
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
      if (this.suddenScore()) {
        return { text: `SAFETY! Ballgame.`, scored: true, changedPossession: true, firstDown: false, isScore: { type: "SAFETY", team: other(offTeam) } };
      }
      if (this.isCollegeOT) this.endCollegeOTPossession();
      else this.kickoffTo(offTeam); // conceding team free-kicks
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
    const gotFirst = gain >= this.distance;
    let changed = false;
    let firstDown = false;

    if (gotFirst) {
      this.down = 1;
      this.distance = this.isGoalToGo() ? 100 - this.ballOn : 10;
      firstDown = true;
    } else {
      this.down++;
      this.distance -= gain;
      if (this.down > 4) {
        // Turnover on downs.
        if (this.isCollegeOT) this.endCollegeOTPossession();
        else this.flipPossession(100 - Math.round(this.ballOn));
        changed = true;
      }
    }

    const trueStop = result.endReason === "incomplete" || result.endReason === "outOfBounds";
    // College stops the clock on first downs to reset the chains, but it winds
    // again on the ready signal — a brief stop, not the full between-play runoff.
    const collegeFirstDown = this.rules.clockStopsOnFirstDown && firstDown && !trueStop;
    this.runClock(result, trueStop, offTeam, collegeFirstDown);

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
      if (this.suddenScore()) {
        return { text: `${fgDist}-yard field goal is GOOD. Ballgame, ${this.teams[offTeam].abbr}.`, scored: true, changedPossession: true, firstDown: false, isScore: { type: "FG", team: offTeam } };
      }
      if (this.isCollegeOT) this.endCollegeOTPossession();
      else { this.kickoffTo(other(offTeam)); this.runClockSeconds(6, offTeam); }
      return {
        text: `${fgDist}-yard field goal is GOOD. ${this.teams[offTeam].abbr} +3.`,
        scored: true,
        changedPossession: true,
        firstDown: false,
        isScore: { type: "FG", team: offTeam },
      };
    }
    // Miss: opponent takes over.
    if (this.isCollegeOT) this.endCollegeOTPossession();
    else { this.flipPossession(Math.max(20, 100 - this.ballOn)); this.runClockSeconds(6, offTeam); }
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
      const good = this.rng.chance(this.rules.twoPointSuccess);
      if (good) { this.score[team] += 2; isScore = { type: "TWO", team }; }
      text = good ? `Two-point conversion GOOD. ${abbr} +2.` : `Two-point try NO GOOD.`;
    } else {
      const good = this.rng.chance(this.rules.xpSuccess);
      if (good) { this.score[team] += 1; isScore = { type: "XP", team }; }
      text = good ? `Extra point good.` : `Extra point MISSED.`;
    }
    // In overtime the possession is governed by the OT handler (no kickoff).
    if (this.overtime > 0) {
      if (this.rules.otType === "college") this.endCollegeOTPossession();
      return { text, scored: !!isScore, changedPossession: true, firstDown: false, isScore };
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
    // Pass interference: pro is a spot foul (can be big); college caps at 15.
    const piBase = this.rules.piSpotFoul ? Math.round(15 + this.rng.range(0, 28)) : 15;
    const y = fwd(piBase);
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

  // ---- overtime ----

  private startOvertime(): void {
    this.overtime = 1;
    this.quarter = 5;
    this.twoMinuteFired = false;
    this.pendingConversion = null;
    if (this.rules.otType === "college") {
      this.timeouts = { home: 1, away: 1 };
      this.otFirstTeam = this.rng.chance(0.5) ? "home" : "away";
      this.otPoss = 0;
      this.clock = 0; // untimed
      this.setCollegeOTBall(this.otFirstTeam);
    } else {
      this.timeouts = { home: 2, away: 2 };
      this.clock = Math.max(60, Math.round(this.cfg.quarterSeconds * (2 / 3)));
      this.kickoffTo(this.rng.chance(0.5) ? "home" : "away");
    }
  }

  /** 1st & 10 from the opponent's 25 (college OT). */
  private setCollegeOTBall(team: TeamId): void {
    this.possession = team;
    this.ballOn = 75;
    this.down = 1;
    this.distance = 10;
    this.pendingConversion = null;
  }

  /** A college-OT possession ended (score or turnover). Alternate; compare
   *  after both teams have had the ball; new round if still tied. */
  private endCollegeOTPossession(): void {
    this.otPoss++;
    if (this.otPoss < 2) {
      this.setCollegeOTBall(other(this.possession));
      return;
    }
    if (this.score.home !== this.score.away) { this.gameOver = true; return; }
    this.overtime++;
    this.otPoss = 0;
    this.otFirstTeam = other(this.otFirstTeam); // loser of the toss goes first next round
    this.setCollegeOTBall(this.otFirstTeam);
  }

  /** Sudden-death (pro) OT: the first score wins. Returns true if it ended. */
  private suddenScore(): boolean {
    if (this.overtime > 0 && this.rules.otType === "sudden") { this.gameOver = true; return true; }
    return false;
  }

  private get isCollegeOT(): boolean {
    return this.overtime > 0 && this.rules.otType === "college";
  }

  private runClock(result: PlayResult, clockStops: boolean, chargeTo: TeamId, collegeFirstDown = false): void {
    const stops = clockStops || this.clockStopNext;
    this.clockStopNext = false;
    // Tempo bends the between-play runoff: no-huddle (+) snaps it fast, milking
    // (-) drains toward the play clock. Only the running-clock gap is affected.
    const tempo = this.gameplans[chargeTo]?.tempo ?? 0;
    const base = collegeFirstDown ? 13 : 25;
    const between = stops ? 0 : Math.round(Math.max(6, Math.min(40, base * (1 - tempo * 0.55))));
    this.runClockSeconds(Math.ceil(result.playTime) + between, chargeTo);
  }

  private chargeClock(team: TeamId, sec: number): void {
    this.runClockSeconds(sec, team);
  }

  private runClockSeconds(sec: number, chargeTo: TeamId = this.possession): void {
    this.top[chargeTo] += sec;
    if (this.overtime > 0) {
      if (this.rules.otType === "college") return; // untimed
      // Sudden-death period: winning is decided at scoring time; if the clock
      // runs out still tied, it's a tie (pro regular season).
      this.clock = Math.max(0, this.clock - sec);
      if (this.clock <= 0) this.gameOver = true;
      return;
    }
    this.clock -= sec;
    // Two-minute warning (end of 2nd & 4th quarters).
    if ((this.quarter === 2 || this.quarter === 4) && this.clock <= 120 && !this.twoMinuteFired) {
      this.twoMinuteFired = true;
    }
    while (this.clock <= 0 && !this.gameOver) {
      if (this.quarter >= 4) {
        this.clock = 0;
        if (this.score.home === this.score.away) { this.startOvertime(); return; }
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
