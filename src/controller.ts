import {
  DEFAULT_PHILOSOPHY,
  fourthDownDecision,
  pickDefense,
  pickOffense,
  type Philosophy,
} from "./sim/coordinator";
import { DEFAULT_CONFIG, GameFlow, type CommitOutcome, type GameConfig, type GameInfo, type PenaltyKind } from "./sim/game";
import { PlaySim } from "./sim/engine";
import { RNG } from "./sim/rng";
import { DEFAULT_TEAMS, type Team } from "./sim/roster";
import { DEF_PLAYS, OFF_PLAYS } from "./sim/playbook";
import { StatsAggregator } from "./stats/aggregator";
import type { PlayResult, SimEvent, TeamId } from "./sim/types";
import type { Vec2 } from "./sim/vec2";
import type { SoundCue } from "./audio/sound";

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
  /** Heading in screen space (radians), for orienting chevrons. */
  heading: number;
  moving: boolean;
}

export interface RenderRoute {
  id: string;
  color: string;
  points: { x: number; y: number }[];
}

export interface RenderTrail {
  id: string;
  color: string;
  points: { x: number; y: number }[];
}

export type EffectKind =
  | "catch" | "tackle" | "sack" | "breakTackle" | "touchdown" | "incomplete";

export interface RenderEffect {
  kind: EffectKind;
  x: number;
  y: number;
  /** 0 at birth → 1 at death. */
  age: number;
}

export interface RenderFrame {
  agents: RenderAgent[];
  ball: { x: number; y: number; inAir: boolean };
  /** Pass arc, present only while the ball is airborne. */
  flight: { fromX: number; fromY: number; toX: number; toY: number; progress: number } | null;
  routes: RenderRoute[];
  trails: RenderTrail[];
  effects: RenderEffect[];
  showRoutes: boolean;
  losAbs: number;
  firstDownAbs: number;
  dir: 1 | -1;
  homeColor: string;
  awayColor: string;
}

export type BannerTone = "score" | "turnover" | "info";

export interface Banner {
  /** Unique per emission so the UI can re-trigger the animation. */
  id: number;
  tone: BannerTone;
  title: string;
  sub: string;
  team: TeamId | null;
}

/** Discrete state mirrored into React. Per-frame motion is NOT here. */
export interface UIState {
  phase: Phase;
  info: GameInfo;
  banner: Banner | null;
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
  private banner: Banner | null = null;
  private bannerSeq = 0;
  // momentum per team (-1 cold .. +1 hot), feeds the AI coordinator
  private momentum: Record<TeamId, number> = { home: 0, away: 0 };

  // sound cues queued for the renderer to drain & play
  private soundCues: SoundCue[] = [];
  // snap cadence: brief pre-snap hold before the sim starts stepping
  private holdRemaining = 0;

  // interpolation buffers (local frame positions)
  private prevPos = new Map<string, Vec2>();
  private curPos = new Map<string, Vec2>();
  private prevBall: Vec2 = { x: 0, y: 0 };
  private curBall: Vec2 = { x: 0, y: 0 };
  private accumulator = 0;
  private alpha = 0;

  // visual-only state (synthesised from sim state; never written back)
  private trails = new Map<string, Vec2[]>(); // local-frame position history
  private effects: Array<{ kind: EffectKind; pos: Vec2; life: number; max: number }> = [];
  private readonly TRAIL_LEN = 14;

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
    this.trails.clear();
    this.effects = [];
    this.banner = null;
    this.soundCues = [];
    this.momentum = { home: 0, away: 0 };
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
    // Snap cadence: hold on the set formation briefly before the ball moves.
    if (this.holdRemaining > 0) {
      this.holdRemaining -= dtWall;
      return;
    }
    this.accumulator += dtWall * 60 * factor;
    let guard = 0;
    while (this.accumulator >= 1 && this.live && this.sim && guard < 600) {
      this.capturePrev();
      const events = this.sim.step();
      this.liveEvents.push(...events);
      this.captureCur();
      this.recordTrails();
      this.spawnEffects(events);
      this.ageEffects();
      this.accumulator -= 1;
      guard++;
      if (this.sim.done) {
        this.finishPlay();
        break;
      }
    }
    this.alpha = this.live ? Math.min(this.accumulator, 1) : 0;
  }

  private recordTrails(): void {
    if (!this.sim) return;
    for (const ag of this.sim.agents) {
      const hist = this.trails.get(ag.id) ?? [];
      hist.push({ ...ag.pos });
      if (hist.length > this.TRAIL_LEN) hist.shift();
      this.trails.set(ag.id, hist);
    }
  }

  private spawnEffects(events: SimEvent[]): void {
    if (!this.sim) return;
    const at = (id?: string): Vec2 | null => {
      if (!id) return null;
      const ag = this.sim!.agents.find((a) => a.id === id);
      return ag ? { ...ag.pos } : null;
    };
    const add = (kind: EffectKind, pos: Vec2 | null, max = 36) => {
      if (pos) this.effects.push({ kind, pos, life: max, max });
    };
    for (const e of events) {
      switch (e.t) {
        case "snap": this.soundCues.push("snap"); break;
        case "catch": add("catch", at(e.by)); this.soundCues.push("catch"); break;
        case "tackle": add("tackle", at(e.carrier)); this.soundCues.push("hit"); break;
        case "sack": add("sack", at(e.carrier), 48); this.soundCues.push("hit"); break;
        case "breakTackle": add("breakTackle", at(e.carrier)); this.soundCues.push("hit"); break;
        case "touchdown": add("touchdown", at(e.by), 60); break;
        case "interception": this.soundCues.push("turnover"); break;
        case "incomplete":
          add("incomplete", this.sim.ball.target ? { ...this.sim.ball.target } : null);
          break;
      }
    }
  }

  /** Drained by the renderer each frame; returns and clears queued sound cues. */
  takeSoundCues(): SoundCue[] {
    if (this.soundCues.length === 0) return [];
    const out = this.soundCues;
    this.soundCues = [];
    return out;
  }

  private ageEffects(): void {
    this.effects = this.effects.filter((e) => {
      e.life -= 1;
      return e.life > 0;
    });
  }

  renderFrame(): RenderFrame | null {
    if (!this.sim) return null;
    const a = this.live ? this.alpha : 1;
    const losAbs = this.flow.losAbs();
    const dir = this.flow.dir();
    const offColor = this.teams[this.flow.possession].color;
    const defColor = this.teams[this.flow.possession === "home" ? "away" : "home"].color;
    // local -> absolute field coords
    const toAbs = (p: Vec2): { x: number; y: number } => ({ x: losAbs + dir * p.x, y: p.y });

    const agents: RenderAgent[] = this.sim.agents.map((ag) => {
      const cur = this.curPos.get(ag.id) ?? ag.pos;
      const prev = this.prevPos.get(ag.id) ?? cur;
      const lx = prev.x + (cur.x - prev.x) * a;
      const ly = prev.y + (cur.y - prev.y) * a;
      const speed = Math.hypot(ag.vel.x, ag.vel.y);
      return {
        id: ag.id,
        x: losAbs + dir * lx,
        y: ly,
        side: ag.side,
        number: ag.number,
        color: ag.side === "off" ? offColor : defColor,
        hasBall: ag.hasBall,
        heading: Math.atan2(ag.vel.y, dir * ag.vel.x),
        moving: speed > 0.4,
      };
    });

    const bx = this.prevBall.x + (this.curBall.x - this.prevBall.x) * a;
    const by = this.prevBall.y + (this.curBall.y - this.prevBall.y) * a;

    // Routes: only meaningful pre-snap / very early; drawn faintly.
    const showRoutes = !this.live || this.sim.tick < 30;
    const routes: RenderRoute[] = showRoutes
      ? this.sim.routePolylines().map((r) => ({
          id: r.id,
          color: offColor,
          points: r.points.map(toAbs),
        }))
      : [];

    const trails: RenderTrail[] = this.live
      ? [...this.trails.entries()]
          .filter(([, pts]) => pts.length > 2)
          .map(([id, pts]) => {
            const ag = this.sim!.agents.find((x) => x.id === id);
            return {
              id,
              color: ag && ag.side === "off" ? offColor : defColor,
              points: pts.map(toAbs),
            };
          })
      : [];

    const effects: RenderEffect[] = this.effects.map((e) => {
      const p = toAbs(e.pos);
      return { kind: e.kind, x: p.x, y: p.y, age: 1 - e.life / e.max };
    });

    const pf = this.sim.passFlight();
    let flight: RenderFrame["flight"] = null;
    if (pf) {
      const f = toAbs(pf.from);
      const t = toAbs(pf.to);
      flight = { fromX: f.x, fromY: f.y, toX: t.x, toY: t.y, progress: pf.progress };
    }

    return {
      agents,
      ball: { x: losAbs + dir * bx, y: by, inAir: this.sim.ball.inAir },
      flight,
      routes,
      trails,
      effects,
      showRoutes,
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

    const aiTeam: TeamId = info.possession === "home" ? "away" : "home";

    if (offenseIsUser) {
      // User calls offense; AI (defense) is the opponent of the ball carrier.
      this.callSide = "offense";
      this.pendingHiddenCall = pickDefense(info, this.aiPhilosophy(), this.flow.rng, this.momentum[aiTeam]);
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
      this.pendingHiddenCall = pickOffense(info, this.aiPhilosophy(), this.flow.rng, this.momentum[info.possession]);
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
    // Pre-snap flags (false start / offside) can wipe out the play.
    if (this.maybePreSnapPenalty()) return;
    this.aiCallName = this.callSide === "offense"
      ? defPlayLabel(defId)
      : offPlayLabel(offId);
    this.sim = this.flow.createSnap(offId, defId);
    this.liveEvents = [];
    this.trails.clear();
    this.effects = [];
    this.captureBoth();
    this.live = true;
    this.phase = "live";
    this.accumulator = 0;
    this.holdRemaining = this.speed === "instant" ? 0 : 0.45;
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

    // Flag on the play? A post-play penalty supersedes the result, so resolve it
    // BEFORE committing the play (which would otherwise advance down/distance).
    if (!result.touchdown && !result.turnover) {
      const pk = this.rollPostPlayPenalty(result);
      if (pk) { this.applyPenaltyOutcome(pk); return; }
    }

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
    this.stats.recordTop(this.flow.top.home, this.flow.top.away);
    this.lastPlayText = commit.text;
    this.logPbp(offTeam, commit.text);
    this.makeBanner(offTeam, commit, result);
    this.updateMomentum(offTeam, commit, result);
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
    this.stats.recordTop(this.flow.top.home, this.flow.top.away);
    this.lastPlayText = commit.text;
    this.logPbp(offTeam, commit.text);
    this.makeBanner(offTeam, commit, null);
    this.beginPlaySelection();
  }

  /** Build the transient broadcast banner + closing sound for a play. */
  private makeBanner(offTeam: TeamId, commit: CommitOutcome, result: PlayResult | null): void {
    const abbr = (t: TeamId) => this.teams[t].abbr;
    let banner: Omit<Banner, "id">;
    if (commit.isScore) {
      const s = commit.isScore;
      const titles: Record<typeof s.type, string> = {
        TD: "TOUCHDOWN", FG: "FIELD GOAL", SAFETY: "SAFETY", XP: "EXTRA POINT",
      };
      banner = { tone: "score", title: titles[s.type], sub: this.teams[s.team].name, team: s.team };
      this.soundCues.push("cheer");
    } else if (commit.changedPossession) {
      const turnover = /INTERCEPT/i.test(commit.text)
        ? "INTERCEPTED"
        : /downs/i.test(commit.text)
          ? "TURNOVER ON DOWNS"
          : /Punt/i.test(commit.text)
            ? "PUNT"
            : "TURNOVER";
      banner = { tone: "turnover", title: turnover, sub: `${abbr(this.flow.possession)} ball`, team: this.flow.possession };
      this.soundCues.push("whistle");
    } else if (result) {
      // Ordinary scrimmage result card.
      const yds = Math.round(result.yards);
      let title: string;
      if (result.endReason === "sack") title = `SACK -${Math.abs(yds)}`;
      else if (result.endReason === "incomplete") title = "INCOMPLETE";
      else if (commit.firstDown) title = "FIRST DOWN";
      else title = `${yds >= 0 ? "+" : ""}${yds} YD${Math.abs(yds) === 1 ? "" : "S"}`;
      const verb = result.isPass
        ? (result.endReason === "incomplete" ? "pass" : "pass complete")
        : "run";
      banner = { tone: "info", title, sub: `${abbr(offTeam)} ${verb}`, team: offTeam };
      this.soundCues.push("whistle");
    } else {
      return;
    }
    this.banner = { id: ++this.bannerSeq, ...banner };
  }

  /** Update momentum from a play's outcome (decays toward neutral). */
  private updateMomentum(offTeam: TeamId, commit: CommitOutcome, result: PlayResult | null): void {
    const def: TeamId = offTeam === "home" ? "away" : "home";
    this.momentum.home *= 0.8;
    this.momentum.away *= 0.8;
    if (commit.isScore) {
      this.momentum[commit.isScore.team] += 0.5;
      this.momentum[commit.isScore.team === "home" ? "away" : "home"] -= 0.3;
    } else if (commit.changedPossession) {
      this.momentum[offTeam] -= 0.4;
      this.momentum[def] += 0.4;
    } else if (commit.firstDown || (result && result.yards >= 15)) {
      this.momentum[offTeam] += 0.15;
      this.momentum[def] -= 0.1;
    } else if (result && result.yards <= 0) {
      this.momentum[offTeam] -= 0.1;
      this.momentum[def] += 0.08;
    }
    const clamp = (x: number) => Math.max(-1, Math.min(1, x));
    this.momentum.home = clamp(this.momentum.home);
    this.momentum.away = clamp(this.momentum.away);
  }

  // ---- penalties ----

  /** Roll a pre-snap flag; if one fires, enforce it and re-open selection. */
  private maybePreSnapPenalty(): boolean {
    const r = this.flow.rng;
    const tempo = this.philosophy.tempo;
    const blitz = this.philosophy.blitzFreq;
    if (r.chance(0.016 * (0.7 + tempo * 0.6))) { this.applyPenaltyOutcome("falseStart"); return true; }
    if (r.chance(0.011 * (0.6 + blitz * 0.9))) { this.applyPenaltyOutcome("offside"); return true; }
    return false;
  }

  /** Roll for a flag during the play (holding / pass interference). */
  private rollPostPlayPenalty(result: PlayResult): PenaltyKind | null {
    const r = this.flow.rng;
    if (result.isPass && result.endReason === "incomplete") {
      if (r.chance(0.06)) return "passInterference"; // DPI on the incompletion
    }
    if (result.endReason !== "interception" && result.yards >= 3 && r.chance(0.04)) {
      return "holdingOff"; // offensive holding negates a positive play
    }
    return null;
  }

  private applyPenaltyOutcome(kind: PenaltyKind): void {
    const pen = this.flow.applyPenalty(kind);
    this.stats.recordPenalty(pen.penalizedTeam, pen.yards);
    this.stats.recordScores(this.flow.score.home, this.flow.score.away);
    this.stats.recordTop(this.flow.top.home, this.flow.top.away);
    const titles: Record<PenaltyKind, string> = {
      falseStart: "FALSE START",
      offside: "OFFSIDE",
      holdingOff: "HOLDING",
      passInterference: "PASS INTERFERENCE",
    };
    this.lastPlayText = `🚩 ${pen.text}`;
    this.logPbp(pen.penalizedTeam, `Penalty — ${pen.text}`);
    this.banner = {
      id: ++this.bannerSeq,
      tone: "info",
      title: `🚩 ${titles[kind]}`,
      sub: `${this.teams[pen.penalizedTeam].abbr} • ${pen.yards} yds`,
      team: pen.penalizedTeam,
    };
    this.soundCues.push("whistle");
    this.phase = "result";
    this.publish();
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
      banner: this.banner,
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
