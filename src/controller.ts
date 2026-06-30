import {
  DEFAULT_PHILOSOPHY,
  fourthDownDecision,
  pickDefense,
  pickOffense,
  type Philosophy,
} from "./sim/coordinator";
import { DEFAULT_CONFIG, GameFlow, type GameConfig, type GameInfo } from "./sim/game";
import { PlaySim } from "./sim/engine";
import { RNG } from "./sim/rng";
import { DEFAULT_TEAMS, type Team } from "./sim/roster";
import { DEF_PLAYS, OFF_PLAYS } from "./sim/playbook";
import { StatsAggregator } from "./stats/aggregator";
import type { SimEvent, TeamId } from "./sim/types";
import type { Vec2 } from "./sim/vec2";

export type Speed = "pause" | "0.5" | "1" | "2" | "4" | "instant";
const SPEED_FACTOR: Record<Speed, number> = {
  pause: 0, "0.5": 0.5, "1": 1, "2": 2, "4": 4, instant: 0,
};

export type Phase = "preSnap" | "live" | "result" | "gameOver";

export interface PbpEntry {
  quarter: number;
  clock: number;
  text: string;
  team: TeamId;
}

/** A single drawable player/ball, in absolute field coords (yards). */
export interface RenderAgent {
  id: string;
  x: number; // 0..120 downfield
  y: number; // 0..53.33 width
  side: "off" | "def";
  number: number;
  color: string;
  hasBall: boolean;
}

export interface RenderFrame {
  agents: RenderAgent[];
  ball: { x: number; y: number; inAir: boolean };
  losAbs: number;
  firstDownAbs: number;
  dir: 1 | -1;
  homeColor: string;
  awayColor: string;
}

/** Discrete state mirrored into React. Per-frame motion is NOT here. */
export interface UIState {
  phase: Phase;
  info: GameInfo;
  homeName: string;
  awayName: string;
  homeAbbr: string;
  awayAbbr: string;
  homeColor: string;
  awayColor: string;
  userTeam: TeamId;
  /** What the user must call this down, if anything. */
  callSide: "offense" | "defense" | null;
  isFourthDown: boolean;
  aiCallName: string | null; // the hidden side's call (revealed after snap)
  lastPlayText: string;
  speed: Speed;
  philosophy: Philosophy;
  pbp: PbpEntry[];
  winner: TeamId | "tie" | null;
}

type Emit = (s: UIState) => void;

export class GameController {
  private flow: GameFlow;
  private stats: StatsAggregator;
  private teams: { home: Team; away: Team };
  private sim: PlaySim | null = null;
  private live = false;
  private phase: Phase = "preSnap";
  private speed: Speed = "1";
  private philosophy: Philosophy = { ...DEFAULT_PHILOSOPHY };
  private userTeam: TeamId = "home";
  private seed: number;
  private cfg: GameConfig;

  private pendingHiddenCall: string | null = null; // AI's call for the hidden side
  private callSide: "offense" | "defense" | null = null;
  private aiCallName: string | null = null;
  private lastPlayText = "Kickoff. Game on.";
  private pbp: PbpEntry[] = [];
  private startBallOn = 25;

  // interpolation buffers (local frame positions)
  private prevPos = new Map<string, Vec2>();
  private curPos = new Map<string, Vec2>();
  private prevBall: Vec2 = { x: 0, y: 0 };
  private curBall: Vec2 = { x: 0, y: 0 };
  private accumulator = 0;
  private alpha = 0;

  private emit: Emit = () => {};
  liveEvents: SimEvent[] = [];

  constructor(seed: number, cfg: GameConfig = DEFAULT_CONFIG) {
    this.seed = seed >>> 0;
    this.cfg = cfg;
    this.teams = DEFAULT_TEAMS(this.seed);
    this.flow = new GameFlow(this.teams, new RNG(this.seed ^ 0xabcdef), cfg);
    this.stats = new StatsAggregator(this.teams);
    this.beginPlaySelection();
  }

  // ---- public API ----

  onChange(fn: Emit): void {
    this.emit = fn;
    this.publish();
  }

  getStats(): StatsAggregator {
    return this.stats;
  }

  setSpeed(s: Speed): void {
    this.speed = s;
    if (s === "instant" && this.live && this.sim) this.finishInstant();
    this.publish();
  }

  setPhilosophy(p: Partial<Philosophy>): void {
    this.philosophy = { ...this.philosophy, ...p };
    this.publish();
  }

  reset(seed?: number): void {
    this.seed = (seed ?? this.seed + 1) >>> 0;
    this.teams = DEFAULT_TEAMS(this.seed);
    this.flow = new GameFlow(this.teams, new RNG(this.seed ^ 0xabcdef), this.cfg);
    this.stats = new StatsAggregator(this.teams);
    this.sim = null;
    this.live = false;
    this.phase = "preSnap";
    this.pbp = [];
    this.lastPlayText = "Kickoff. Game on.";
    this.beginPlaySelection();
  }

  // user picks
  userPickOffense(id: string): void {
    if (this.callSide !== "offense" || this.phase !== "preSnap") return;
    this.snap(id, this.pendingHiddenCall ?? DEF_PLAYS[0].id);
  }
  userPickDefense(id: string): void {
    if (this.callSide !== "defense" || this.phase !== "preSnap") return;
    this.snap(this.pendingHiddenCall ?? OFF_PLAYS[0].id, id);
  }
  userSpecialTeams(kind: "punt" | "fieldGoal"): void {
    if (this.phase !== "preSnap") return;
    this.resolveSpecialTeams(kind);
  }

  // ---- per-frame driving (called by the renderer's rAF loop) ----

  advance(dtWall: number): void {
    if (!this.live || !this.sim || this.speed === "instant") return;
    const factor = SPEED_FACTOR[this.speed];
    if (factor <= 0) return; // paused
    this.accumulator += dtWall * 60 * factor;
    let guard = 0;
    while (this.accumulator >= 1 && this.live && this.sim && guard < 600) {
      this.capturePrev();
      const events = this.sim.step();
      this.liveEvents.push(...events);
      this.captureCur();
      this.accumulator -= 1;
      guard++;
      if (this.sim.done) {
        this.finishPlay();
        break;
      }
    }
    this.alpha = this.live ? Math.min(this.accumulator, 1) : 0;
  }

  renderFrame(): RenderFrame | null {
    if (!this.sim) return null;
    const a = this.live ? this.alpha : 1;
    const losAbs = this.flow.losAbs();
    const dir = this.flow.dir();
    const agents: RenderAgent[] = this.sim.agents.map((ag) => {
      const cur = this.curPos.get(ag.id) ?? ag.pos;
      const prev = this.prevPos.get(ag.id) ?? cur;
      const lx = prev.x + (cur.x - prev.x) * a;
      const ly = prev.y + (cur.y - prev.y) * a;
      return {
        id: ag.id,
        x: losAbs + dir * lx,
        y: ly,
        side: ag.side,
        number: ag.number,
        color: ag.side === "off"
          ? this.teams[this.flow.possession].color
          : this.teams[this.flow.possession === "home" ? "away" : "home"].color,
        hasBall: ag.hasBall,
      };
    });
    const bx = this.prevBall.x + (this.curBall.x - this.prevBall.x) * a;
    const by = this.prevBall.y + (this.curBall.y - this.prevBall.y) * a;
    return {
      agents,
      ball: { x: losAbs + dir * bx, y: by, inAir: this.sim.ball.inAir },
      losAbs,
      firstDownAbs: this.flow.firstDownAbs(),
      dir,
      homeColor: this.teams.home.color,
      awayColor: this.teams.away.color,
    };
  }

  // ---- internals ----

  private capturePrev(): void {
    if (!this.sim) return;
    this.prevPos = new Map(this.curPos);
    this.prevBall = { ...this.curBall };
  }
  private captureCur(): void {
    if (!this.sim) return;
    this.curPos = new Map(this.sim.agents.map((a) => [a.id, { ...a.pos }]));
    this.curBall = { ...this.sim.ball.pos };
  }
  private captureBoth(): void {
    this.captureCur();
    this.prevPos = new Map(this.curPos);
    this.prevBall = { ...this.curBall };
  }

  private beginPlaySelection(): void {
    if (this.flow.gameOver) {
      this.phase = "gameOver";
      this.live = false;
      this.publish();
      return;
    }
    this.phase = "preSnap";
    this.live = false;
    this.accumulator = 0;
    this.alpha = 0;
    this.startBallOn = this.flow.ballOn;
    const info = this.flow.info();
    const offenseIsUser = info.possession === this.userTeam;

    if (offenseIsUser) {
      // User calls offense; AI calls defense.
      this.callSide = "offense";
      this.pendingHiddenCall = pickDefense(info, this.aiPhilosophy(), this.flow.rng);
      this.aiCallName = null;
      this.buildPreview(OFF_PLAYS[0].id, this.pendingHiddenCall);
    } else {
      // AI offense. On 4th down it may kick/punt before any snap.
      if (info.down === 4) {
        const decision = fourthDownDecision(info, this.aiPhilosophy(), this.flow.rng);
        if (decision !== "go") {
          this.resolveSpecialTeams(decision);
          return;
        }
      }
      this.callSide = "defense";
      this.pendingHiddenCall = pickOffense(info, this.aiPhilosophy(), this.flow.rng);
      this.aiCallName = null;
      this.buildPreview(this.pendingHiddenCall, DEF_PLAYS[0].id);
    }
    this.publish();
  }

  /** AI plays as the opponent of the user team. */
  private aiPhilosophy(): Philosophy {
    return this.philosophy;
  }

  private buildPreview(offId: string, defId: string): void {
    this.sim = this.flow.createSnap(offId, defId);
    this.live = false;
    this.captureBoth();
  }

  private snap(offId: string, defId: string): void {
    this.aiCallName = this.callSide === "offense"
      ? defPlayLabel(defId)
      : offPlayLabel(offId);
    this.sim = this.flow.createSnap(offId, defId);
    this.liveEvents = [];
    this.captureBoth();
    this.live = true;
    this.phase = "live";
    this.accumulator = 0;
    if (this.speed === "instant") {
      this.finishInstant();
    } else {
      this.publish();
    }
  }

  private finishInstant(): void {
    if (!this.sim) return;
    this.sim.runToCompletion();
    this.captureBoth();
    this.finishPlay();
  }

  private finishPlay(): void {
    if (!this.sim || !this.sim.result) return;
    this.live = false;
    const result = this.sim.result;
    const offTeam = this.flow.possession;
    const defTeam = offTeam === "home" ? "away" : "home";
    const commit = this.flow.commitPlayResult(result);
    this.stats.recordScrimmage(
      offTeam,
      defTeam,
      this.sim.agents,
      result,
      commit,
      this.startBallOn,
    );
    this.stats.recordScores(this.flow.score.home, this.flow.score.away);
    this.lastPlayText = commit.text;
    this.logPbp(offTeam, commit.text);
    this.phase = "result";
    this.publish();
    // Advance to the next selection (field stays frozen on the final frame).
    this.beginPlaySelection();
  }

  private resolveSpecialTeams(kind: "punt" | "fieldGoal"): void {
    const offTeam = this.flow.possession;
    const commit = kind === "punt" ? this.flow.punt() : this.flow.fieldGoalAttempt();
    this.stats.recordSpecialTeams(offTeam, kind === "punt" ? "Punt" : commit.isScore ? "Field Goal" : "Missed FG");
    this.stats.recordScores(this.flow.score.home, this.flow.score.away);
    this.lastPlayText = commit.text;
    this.logPbp(offTeam, commit.text);
    this.beginPlaySelection();
  }

  private logPbp(team: TeamId, text: string): void {
    const info = this.flow.info();
    this.pbp.unshift({ quarter: info.quarter, clock: info.clock, text, team });
    if (this.pbp.length > 200) this.pbp.pop();
  }

  private winner(): TeamId | "tie" | null {
    if (!this.flow.gameOver) return null;
    const { home, away } = this.flow.score;
    if (home === away) return "tie";
    return home > away ? "home" : "away";
  }

  private publish(): void {
    const info = this.flow.info();
    this.emit({
      phase: this.phase,
      info,
      homeName: this.teams.home.name,
      awayName: this.teams.away.name,
      homeAbbr: this.teams.home.abbr,
      awayAbbr: this.teams.away.abbr,
      homeColor: this.teams.home.color,
      awayColor: this.teams.away.color,
      userTeam: this.userTeam,
      callSide: this.phase === "preSnap" ? this.callSide : null,
      isFourthDown: info.down === 4,
      aiCallName: this.aiCallName,
      lastPlayText: this.lastPlayText,
      speed: this.speed,
      philosophy: { ...this.philosophy },
      pbp: [...this.pbp],
      winner: this.winner(),
    });
  }
}

const offPlayLabel = (id: string): string => OFF_PLAYS.find((p) => p.id === id)?.name ?? id;
const defPlayLabel = (id: string): string => DEF_PLAYS.find((p) => p.id === id)?.name ?? id;
