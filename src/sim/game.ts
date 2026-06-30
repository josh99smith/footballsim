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
}

export type SpecialTeams = "punt" | "fieldGoal";

export interface CommitOutcome {
  /** One-line description for the play-by-play log. */
  text: string;
  scored: boolean;
  changedPossession: boolean;
  firstDown: boolean;
  isScore: { type: "TD" | "FG" | "SAFETY" | "XP"; team: TeamId } | null;
}

const other = (t: TeamId): TeamId => (t === "home" ? "away" : "home");

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
      this.runClock(result, true);
      return {
        text: `INTERCEPTED by ${this.teams[this.possession].abbr} at the ${this.fieldDesc(this.ballOn)}.`,
        scored: false,
        changedPossession: true,
        firstDown: false,
        isScore: null,
      };
    }

    let newBallOn = this.ballOn + result.yards;

    // Touchdown.
    if (result.touchdown || newBallOn >= 100) {
      this.score[offTeam] += 6;
      // Automatic extra point (high probability).
      const xpGood = this.rng.chance(0.94);
      if (xpGood) this.score[offTeam] += 1;
      const text = `TOUCHDOWN ${this.teams[offTeam].abbr}! ${
        xpGood ? "Extra point good." : "Extra point MISSED."
      }`;
      this.kickoffTo(other(offTeam));
      this.runClock(result, true);
      return {
        text,
        scored: true,
        changedPossession: true,
        firstDown: false,
        isScore: { type: "TD", team: offTeam },
      };
    }

    // Safety: tackled in own end zone.
    if (newBallOn <= 0) {
      this.score[other(offTeam)] += 2;
      this.kickoffTo(offTeam); // conceding team free-kicks
      this.runClock(result, true);
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

    this.runClock(result, result.endReason === "incomplete" || result.endReason === "outOfBounds");

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
      this.runClockSeconds(6);
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
    this.runClockSeconds(6);
    return {
      text: `${fgDist}-yard field goal is NO GOOD. ${this.teams[this.possession].abbr} take over.`,
      scored: false,
      changedPossession: true,
      firstDown: false,
      isScore: null,
    };
  }

  punt(): CommitOutcome {
    const net = Math.round(38 + this.rng.gaussian() * 6);
    let spot = this.ballOn + net;
    if (spot >= 100) {
      // Touchback.
      this.flipPossession(20);
    } else {
      this.flipPossession(100 - spot);
    }
    this.runClockSeconds(6);
    return {
      text: `Punt downed. ${this.teams[this.possession].abbr} take over at the ${this.fieldDesc(this.ballOn)}.`,
      scored: false,
      changedPossession: true,
      firstDown: false,
      isScore: null,
    };
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

  private runClock(result: PlayResult, clockStops: boolean): void {
    const runoff = Math.ceil(result.playTime) + (clockStops ? 0 : 25);
    this.runClockSeconds(runoff);
  }

  private runClockSeconds(sec: number): void {
    this.clock -= sec;
    while (this.clock <= 0 && !this.gameOver) {
      if (this.quarter >= 4) {
        this.clock = 0;
        this.gameOver = true;
        return;
      }
      this.quarter++;
      this.clock += this.cfg.quarterSeconds;
      if (this.quarter === 3) {
        // Second-half kickoff to whoever did NOT receive to open the game.
        // (Tracked implicitly: give it to current defense.)
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
