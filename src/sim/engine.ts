import { DT, FIELD, MAX_PLAY_TICKS, RADII } from "./constants";
import { RNG } from "./rng";
import type { DefPlay, OffPlay, PlayerRole } from "./playbook";
import type {
  Agent,
  Assignment,
  PlayerDef,
  PlayResult,
  PlaySnapshot,
  Position,
  SimEvent,
} from "./types";
import {
  add,
  clamp,
  dist,
  norm,
  scale,
  sub,
  v,
  type Vec2,
} from "./vec2";

export interface PlaySetup {
  offPlay: OffPlay;
  defPlay: DefPlay;
  offRoster: PlayerDef[];
  defRoster: PlayerDef[];
  /** Lateral spot of the ball (hash), 0..FIELD.WIDTH. */
  ballY: number;
  /** Yards from the LOS to the offense's target goal line (local +x). */
  yardsToGoal: number;
  rng: RNG;
}

// --- kinematics --------------------------------------------------------------

const maxSpeed = (r: Agent["ratings"]): number => 5.5 + (r.speed / 100) * 4.5;
const maxAccel = (r: Agent["ratings"]): number => 16 + (r.agility / 100) * 16;

/** Accelerate an agent toward a desired world point, then integrate position. */
function steer(a: Agent, target: Vec2, speedScale = 1): void {
  const dir = norm(sub(target, a.pos));
  const desired = scale(dir, maxSpeed(a.ratings) * speedScale);
  const dv = sub(desired, a.vel);
  const accel = maxAccel(a.ratings) * DT;
  const dvLen = Math.hypot(dv.x, dv.y);
  if (dvLen > accel) {
    a.vel = add(a.vel, scale({ x: dv.x / dvLen, y: dv.y / dvLen }, accel));
  } else {
    a.vel = desired;
  }
  a.pos = add(a.pos, scale(a.vel, DT));
}

function stop(a: Agent): void {
  a.vel = v(0, 0);
}

// --- engine ------------------------------------------------------------------

export class PlaySim {
  readonly agents: Agent[] = [];
  ball: { pos: Vec2; carrierId?: string; inAir: boolean; target: Vec2 | null } = {
    pos: v(0, 0),
    inAir: false,
    target: null,
  };
  tick = 0;
  done = false;
  result: PlayResult | null = null;

  private rng: RNG;
  private setup: PlaySetup;
  private isPass: boolean;
  private qbId: string;
  private rbId: string | null = null;

  // pass-phase state
  private handoffDone = false;
  private handoffTick = 99999;
  private thrown = false;
  private throwTargetId: string | null = null;
  private throwFrom: Vec2 | null = null;
  private throwTick = 0;
  private landTick = 0;
  private airYards = 0;
  private scrambling = false;
  private passerId: string | null = null;
  private resolvedTargetId: string | null = null;

  private pendingEvents: SimEvent[] = [];

  constructor(setup: PlaySetup) {
    this.setup = setup;
    this.rng = setup.rng;
    this.isPass = setup.offPlay.type === "pass";
    this.buildAgents();
    this.qbId = this.agents.find((a) => a.assignment.kind === "qb")?.id ?? this.agents[0].id;
    this.passerId = this.qbId;
    this.rbId = this.agents.find((a) => a.assignment.kind === "carry")?.id ?? null;
    this.ball.carrierId = this.qbId;
    const qb = this.byId(this.qbId);
    qb.hasBall = true;
    this.ball.pos = { ...qb.pos };
    this.resolveAssignments();
  }

  // ---- setup ----

  private buildAgents(): void {
    const { offPlay, defPlay, offRoster, defRoster, ballY } = this.setup;
    const place = (roles: PlayerRole[], roster: PlayerDef[], side: "off" | "def") => {
      const pools = new Map<Position, PlayerDef[]>();
      for (const p of roster) {
        const list = pools.get(p.pos) ?? [];
        list.push(p);
        pools.set(p.pos, list);
      }
      const fallback = [...roster];
      roles.forEach((role, i) => {
        const pool = pools.get(role.want);
        const def = (pool && pool.shift()) ?? fallback[i];
        this.agents.push({
          id: `${side}-${i}`,
          defId: def.id,
          side,
          number: def.number,
          pos: v(role.dx, clamp(ballY + role.dy, 1, FIELD.WIDTH - 1)),
          vel: v(0, 0),
          ratings: def.ratings,
          assignment: structuredClone(role.assign),
          hasBall: false,
          routeIdx: 0,
          beatBlock: false,
        });
      });
    };
    place(offPlay.roles, offRoster, "off");
    place(defPlay.roles, defRoster, "def");
  }

  /** Resolve targetId / coverMan matchups that depend on alignment. */
  private resolveAssignments(): void {
    const off = this.agents.filter((a) => a.side === "off");
    const def = this.agents.filter((a) => a.side === "def");

    const rushers = def.filter((d) => d.assignment.kind === "rush");
    const eligibles = off.filter(
      (o) => o.assignment.kind === "runRoute" || o.assignment.kind === "carry",
    );

    // Each rusher is picked up by the NEAREST available blocker — this keeps the
    // interior linemen on the interior rush and frees the wideouts to block
    // downfield, rather than letting a split-out WR "claim" a defensive tackle.
    const blockers = off.filter((o) => o.assignment.kind === "block");
    const claimed = new Set<string>();
    for (const r of rushers) {
      let best: Agent | null = null;
      let bestD = Infinity;
      for (const b of blockers) {
        if (claimed.has(b.id)) continue;
        const d = dist(b.pos, r.pos);
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
      if (best) {
        claimed.add(best.id);
        (best.assignment as Extract<Assignment, { kind: "block" }>).targetId = r.id;
      }
    }

    // Man coverage: each man defender takes the nearest eligible receiver.
    const manDefenders = def.filter((d) => d.assignment.kind === "coverMan");
    const covered = new Set<string>();
    for (const m of manDefenders) {
      let best: Agent | null = null;
      let bestD = Infinity;
      for (const e of eligibles) {
        if (covered.has(e.id)) continue;
        const d = dist(m.pos, e.pos);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      if (best) {
        covered.add(best.id);
        (m.assignment as Extract<Assignment, { kind: "coverMan" }>).targetId = best.id;
      } else {
        // Nobody left to cover: drop into a short zone.
        m.assignment = { kind: "coverZone", center: { x: 6, y: m.pos.y - this.setup.ballY }, radius: 7 };
      }
    }

    // Spies / blitzers with no explicit target watch the QB.
    for (const d of def) {
      if (d.assignment.kind === "spy") {
        (d.assignment as Extract<Assignment, { kind: "spy" }>).targetId = this.qbId;
      }
    }
  }

  // ---- helpers ----

  byId(id: string): Agent {
    const a = this.agents.find((x) => x.id === id);
    if (!a) throw new Error(`no agent ${id}`);
    return a;
  }

  private emit(e: SimEvent): void {
    this.pendingEvents.push(e);
  }

  private carrier(): Agent | null {
    return this.ball.carrierId ? this.byId(this.ball.carrierId) : null;
  }

  private nearestDefender(p: Vec2, filter?: (d: Agent) => boolean): { agent: Agent | null; d: number } {
    let best: Agent | null = null;
    let bestD = Infinity;
    for (const a of this.agents) {
      if (a.side !== "def") continue;
      if (filter && !filter(a)) continue;
      const d = dist(p, a.pos);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return { agent: best, d: bestD };
  }

  // ---- main step ----

  /** Advance the sim one fixed tick; returns events produced this tick. */
  step(): SimEvent[] {
    this.pendingEvents = [];
    if (this.done) return this.pendingEvents;

    if (this.tick === 0) this.emit({ t: "snap" });

    // Run-play handoff happens a few ticks after the snap.
    if (!this.isPass && !this.handoffDone && this.tick >= 8 && this.rbId) {
      this.doHandoff(this.rbId);
    }

    this.updateOffense();
    this.updateDefense();
    this.updateBall();
    this.resolveContacts();

    this.tick++;
    if (this.tick >= MAX_PLAY_TICKS && !this.done) {
      this.finish("timeExpired");
    }
    return this.pendingEvents;
  }

  private doHandoff(toId: string): void {
    const rb = this.byId(toId);
    const qb = this.byId(this.qbId);
    qb.hasBall = false;
    rb.hasBall = true;
    this.ball.carrierId = toId;
    this.ball.pos = { ...rb.pos };
    this.handoffDone = true;
    this.handoffTick = this.tick;
    this.emit({ t: "handoff", to: toId });
  }

  /** True once second-level defenders have diagnosed the run and may pursue.
   *  The short delay is the linebacker "read" — it's what lets a back reach
   *  the line with momentum instead of being met instantly. */
  private runCommitted(): boolean {
    if (this.scrambling) return true;
    const c = this.carrier();
    if (!c || c.id === this.qbId) return false;
    return this.tick > this.handoffTick + 15;
  }

  // ---- offense behaviour ----

  private updateOffense(): void {
    for (const a of this.agents) {
      if (a.side !== "off") continue;
      switch (a.assignment.kind) {
        case "qb":
          this.updateQB(a);
          break;
        case "carry":
          if (a.hasBall) this.updateRunner(a);
          else this.updateBackfieldWait(a);
          break;
        case "runRoute":
          this.updateRouteRunner(a);
          break;
        case "block":
          this.updateBlocker(a);
          break;
        default:
          stop(a);
      }
      this.clampToField(a);
    }
  }

  private updateBackfieldWait(a: Agent): void {
    // Drift toward the mesh point with the QB before the handoff.
    const qb = this.byId(this.qbId);
    steer(a, v(qb.pos.x + 1, a.pos.y), 0.4);
  }

  private updateRunner(a: Agent): void {
    const aim = (this.byCarryAssign(a)?.aimGap ?? 0) + this.setup.ballY;
    // Avoid the nearest unblocked defender at all times.
    const { agent: nd, d } = this.nearestDefender(a.pos, (x) => !this.isEngagedByBlocker(x));
    let lateral = 0;
    if (nd && d < 6) {
      const away = a.pos.y - nd.pos.y;
      lateral = Math.sign(away || 1) * (6 - d) * 0.55;
    }
    let target: Vec2;
    if (a.pos.x < 0.5) {
      // Aim for the designed gap, but slide off the nearest defender.
      target = v(a.pos.x + 6, clamp(aim + lateral * 0.6, 2, FIELD.WIDTH - 2));
    } else {
      // Past the line: find daylight downfield.
      target = v(a.pos.x + 9, clamp(a.pos.y + lateral, 2, FIELD.WIDTH - 2));
    }
    steer(a, target, 1);
  }

  private byCarryAssign(a: Agent): { aimGap: number } | null {
    return a.assignment.kind === "carry" ? a.assignment : null;
  }

  private updateRouteRunner(a: Agent): void {
    if (this.thrown && this.throwTargetId === a.id && this.ball.target) {
      // Break on the thrown ball.
      steer(a, this.ball.target, 1.05);
      return;
    }
    const route = a.assignment.kind === "runRoute" ? a.assignment.waypoints : [];
    if (a.routeIdx < route.length) {
      // Waypoints are deltas from the snap position.
      const base = v(this.snapX(a), this.snapY(a));
      const wp = add(base, route[a.routeIdx]);
      steer(a, wp, 1);
      if (dist(a.pos, wp) < 1.2) a.routeIdx++;
    } else {
      // Past the route: keep working upfield to give the QB a target.
      steer(a, v(a.pos.x + 4, a.pos.y), 0.7);
    }
  }

  // Snap position recovered from role alignment is not stored, so we cache it.
  private snapPos = new Map<string, Vec2>();
  private snapX(a: Agent): number {
    return this.getSnap(a).x;
  }
  private snapY(a: Agent): number {
    return this.getSnap(a).y;
  }
  private getSnap(a: Agent): Vec2 {
    let s = this.snapPos.get(a.id);
    if (!s) {
      s = { ...a.pos };
      this.snapPos.set(a.id, s);
    }
    return s;
  }

  private updateBlocker(a: Agent): void {
    const tid = a.assignment.kind === "block" ? a.assignment.targetId : undefined;
    const carrier = this.carrier();
    if (!tid) {
      // No assigned rusher: lead-block downfield ahead of the ball carrier.
      if (carrier && carrier.id !== this.qbId) {
        const target = v(carrier.pos.x + 4, carrier.pos.y);
        const { agent: nd } = this.nearestDefender(target);
        steer(a, nd ? nd.pos : target, 0.85);
      } else {
        steer(a, v(a.pos.x + 2, a.pos.y), 0.4);
      }
      return;
    }
    const target = this.byId(tid);
    // Stay between the rusher and the ball (QB or runner).
    const protect = carrier ? carrier.pos : v(-5, this.setup.ballY);
    const dir = norm(sub(protect, target.pos));
    const spot = add(target.pos, scale(dir, RADII.block * 0.6));
    steer(a, spot, dist(a.pos, target.pos) < RADII.block * 1.5 ? 0.5 : 1);
  }

  private updateQB(a: Agent): void {
    if (!a.hasBall && !this.scrambling) {
      // Handed off on a run; carry out the fake then stand.
      stop(a);
      return;
    }
    if (this.scrambling) {
      this.updateRunner2(a);
      return;
    }
    const dropDepth = a.assignment.kind === "qb" ? a.assignment.dropDepth : 0;
    const targetDepth = -(1.5 + dropDepth);
    if (!this.isPass) {
      // Run play: ride the mesh then hold.
      steer(a, v(targetDepth, a.pos.y), 0.5);
      return;
    }

    // Drop back to depth.
    if (a.pos.x > targetDepth + 0.3) {
      steer(a, v(targetDepth, a.pos.y), 0.9);
    } else {
      stop(a);
    }

    if (this.thrown) return;

    const timeHeld = this.tick * DT;
    const pressure = this.nearestDefender(a.pos, (d) => d.beatBlock || this.isUnblockedRusher(d));
    const underPressure = pressure.agent !== null && pressure.d < 2.2;

    // Imminent sack?
    if (pressure.agent && pressure.d < 1.1) {
      const escape = this.rng.chance(0.18 + (a.ratings.agility / 100) * 0.35);
      if (escape) {
        this.scrambling = true;
        a.hasBall = true;
        return;
      }
      this.sack(pressure.agent, a);
      return;
    }

    const best = this.bestReceiver();
    const decisionTime = this.passDecisionTime();
    // Let routes develop: don't fire on the "he's open" read until the play
    // has had time to breathe (scaled to the drop depth), unless forced.
    const readyToThrow = timeHeld > decisionTime * 0.62;
    const wantThrow =
      (best && best.openness > 3.5 && readyToThrow) ||
      timeHeld > decisionTime ||
      (underPressure && timeHeld > 0.7);

    if (wantThrow) {
      if (best) {
        this.throwTo(a, best.agent);
      } else if (underPressure) {
        // Nobody open and pressure home: eat it or scramble.
        if (this.rng.chance(0.4 + (a.ratings.agility / 100) * 0.3)) {
          this.scrambling = true;
        } else {
          this.sack(pressure.agent ?? this.nearestDefender(a.pos).agent!, a);
        }
      }
    }
  }

  /** QB scramble reuses runner logic but from the QB agent. */
  private updateRunner2(a: Agent): void {
    const { agent: nd, d } = this.nearestDefender(a.pos);
    let lateral = 0;
    if (nd && d < 6) {
      const away = a.pos.y - nd.pos.y;
      lateral = Math.sign(away || 1) * (6 - d) * 0.5;
    }
    steer(a, v(a.pos.x + 7, clamp(a.pos.y + lateral, 2, FIELD.WIDTH - 2)), 1);
  }

  private passDecisionTime(): number {
    const drop = this.byId(this.qbId).assignment;
    const depth = drop.kind === "qb" ? drop.dropDepth : 2;
    return 1.0 + depth * 0.35; // quick game ~1.5s, deep shots ~2.7s
  }

  private isUnblockedRusher(d: Agent): boolean {
    if (d.assignment.kind !== "rush" && d.assignment.kind !== "spy") return false;
    // Engaged-by-a-blocker rushers are not (yet) pressure.
    return !this.agents.some(
      (o) =>
        o.side === "off" &&
        o.assignment.kind === "block" &&
        o.assignment.targetId === d.id &&
        dist(o.pos, d.pos) < RADII.block * 1.4 &&
        !d.beatBlock,
    );
  }

  private bestReceiver(): { agent: Agent; openness: number } | null {
    let best: { agent: Agent; openness: number } | null = null;
    for (const a of this.agents) {
      if (a.side !== "off" || a.assignment.kind !== "runRoute") continue;
      if (a.pos.x < 0.5) continue; // not yet downfield
      const { d } = this.nearestDefender(a.pos);
      // Prefer receivers who have gained separation and are makeable throws.
      const depthBonus = clamp(a.pos.x / 12, 0, 2);
      const openness = d + depthBonus;
      if (!best || openness > best.openness) best = { agent: a, openness };
    }
    return best;
  }

  private throwTo(qb: Agent, target: Agent): void {
    const throwSpeed = 21; // yards/sec
    const flight = dist(qb.pos, target.pos);
    let hang = flight / throwSpeed;
    // Lead the receiver to where they'll be.
    const lead = add(target.pos, scale(target.vel, hang));
    // Accuracy error grows with depth and falls with QB awareness.
    const errScale = (0.35 + flight / 55) * (1.2 - qb.ratings.awareness / 140);
    const err = v(this.rng.gaussian() * errScale, this.rng.gaussian() * errScale);
    const land = add(lead, err);
    land.y = clamp(land.y, 0.5, FIELD.WIDTH - 0.5);
    this.airYards = land.x; // local x == yards downfield from LOS
    hang = Math.max(0.3, dist(qb.pos, land) / throwSpeed);
    this.ball.inAir = true;
    this.ball.carrierId = undefined;
    this.ball.target = land;
    this.thrown = true;
    this.throwTargetId = target.id;
    this.resolvedTargetId = target.id;
    this.throwFrom = { ...qb.pos };
    this.throwTick = this.tick;
    this.landTick = this.tick + Math.round(hang / DT);
    qb.hasBall = false;
    this.emit({ t: "pass", from: qb.id, to: target.id, airYards: Math.round(this.airYards) });
  }

  private sack(by: Agent, qb: Agent): void {
    this.finish("sack", { yards: qb.pos.x, tacklerId: by.id, carrierId: qb.id });
    this.emit({ t: "sack", by: by.id, carrier: qb.id });
  }

  // ---- defense behaviour ----

  private updateDefense(): void {
    for (const a of this.agents) {
      if (a.side !== "def") continue;
      if (a.blockedUntil && this.tick < a.blockedUntil) {
        // briefly stunned after losing a tackle
        steer(a, this.ballSpotForPursuit(), 0.4);
        this.clampToField(a);
        continue;
      }
      switch (a.assignment.kind) {
        case "rush":
          this.updateRusher(a);
          break;
        case "coverMan":
          this.updateCoverMan(a);
          break;
        case "coverZone":
          this.updateCoverZone(a);
          break;
        case "spy":
          this.updateSpy(a);
          break;
        default:
          steer(a, this.ballSpotForPursuit(), 0.8);
      }
      this.clampToField(a);
    }
  }

  private ballSpotForPursuit(): Vec2 {
    const c = this.carrier();
    if (c) return c.pos;
    if (this.ball.inAir && this.ball.target) return this.ball.target;
    return this.ball.pos;
  }

  /** Is this defender currently tied up by a blocker (and hasn't shed)? */
  private isEngagedByBlocker(d: Agent): boolean {
    if (d.beatBlock) return false;
    return this.agents.some(
      (o) =>
        o.side === "off" &&
        o.assignment.kind === "block" &&
        o.assignment.targetId === d.id &&
        dist(o.pos, d.pos) < RADII.block * 1.4,
    );
  }

  private updateRusher(a: Agent): void {
    const carrier = this.carrier();
    const goal = carrier ? carrier.pos : this.byId(this.qbId).pos;
    // If a thrown ball is loose, peel to pursue.
    if (this.thrown && !this.scrambling) {
      steer(a, this.ballSpotForPursuit(), 1);
      return;
    }
    // Slowed while engaged with a blocker (unless shed).
    steer(a, goal, this.isEngagedByBlocker(a) ? 0.3 : 1);
  }

  private updateCoverMan(a: Agent): void {
    if (this.thrown) {
      this.reactToBall(a);
      return;
    }
    const tid = a.assignment.kind === "coverMan" ? a.assignment.targetId : undefined;
    if (!tid) {
      steer(a, this.ballSpotForPursuit(), 0.8);
      return;
    }
    const man = this.byId(tid);
    // Trail with reaction lag scaled by awareness; aim a step toward the QB side.
    const lag = 1 - a.ratings.awareness / 200; // 0.5..1.0
    const lead = add(man.pos, scale(man.vel, 0.25 * lag));
    steer(a, lead, 1);
    if (this.runCommitted()) {
      // Run is live; come up and pursue.
      steer(a, this.ballSpotForPursuit(), 0.97);
    }
  }

  private updateCoverZone(a: Agent): void {
    if (this.thrown) {
      this.reactToBall(a);
      return;
    }
    const center =
      a.assignment.kind === "coverZone"
        ? add(v(0, this.setup.ballY), a.assignment.center)
        : a.pos;
    const radius = a.assignment.kind === "coverZone" ? a.assignment.radius : 6;
    // Once the run is diagnosed, leave the zone and pursue.
    if (this.runCommitted()) {
      steer(a, this.ballSpotForPursuit(), 0.97);
      return;
    }
    // Find the most threatening receiver in the zone and squeeze.
    let threat: Agent | null = null;
    let bestD = radius;
    for (const o of this.agents) {
      if (o.side !== "off" || o.assignment.kind !== "runRoute") continue;
      const d = dist(o.pos, center);
      if (d < bestD) {
        bestD = d;
        threat = o;
      }
    }
    if (threat) {
      const lead = add(threat.pos, scale(threat.vel, 0.3));
      steer(a, lead, 0.95);
    } else {
      steer(a, center, dist(a.pos, center) < 1 ? 0 : 0.8);
    }
  }

  private updateSpy(a: Agent): void {
    const qb = this.byId(this.qbId);
    const watch = this.scrambling || (this.carrier()?.id === qb.id && this.handoffDone)
      ? this.ballSpotForPursuit()
      : v(qb.pos.x + 3, qb.pos.y);
    steer(a, watch, this.scrambling ? 1 : 0.7);
  }

  private reactToBall(a: Agent): void {
    if (!this.ball.target) return;
    const d = dist(a.pos, this.ball.target);
    // Only break on the ball if it's close enough to make a play.
    if (d < 9) steer(a, this.ball.target, 1.02);
    else steer(a, this.ballSpotForPursuit(), 0.9);
  }

  // ---- ball ----

  private updateBall(): void {
    if (this.ball.inAir && this.ball.target) {
      const remaining = this.landTick - this.tick;
      if (remaining <= 0) {
        this.ball.pos = { ...this.ball.target };
        this.resolveCatch();
      } else {
        this.ball.pos = add(
          this.ball.pos,
          scale(sub(this.ball.target, this.ball.pos), 1 / remaining),
        );
      }
      return;
    }
    const c = this.carrier();
    if (c) this.ball.pos = { ...c.pos };
  }

  private resolveCatch(): void {
    const land = this.ball.target!;
    this.ball.inAir = false;
    const target = this.resolvedTargetId ? this.byId(this.resolvedTargetId) : null;

    const dRec = target ? dist(target.pos, land) : Infinity;
    const nearestDef = this.nearestDefender(land);
    const dDef = nearestDef.d;
    const contested = dDef < 2.0;

    // A defender sitting on the throw can pick it (only when genuinely tight,
    // and only when he's closer to the ball than the receiver).
    if (contested && nearestDef.agent && dDef < dRec) {
      const closeness = clamp(1 - dDef / 2.0, 0, 1);
      const intProb = 0.02 + closeness * (nearestDef.agent.ratings.awareness / 100) * 0.07;
      if (this.rng.chance(intProb)) {
        this.emit({ t: "interception", by: nearestDef.agent.id, from: this.passerId ?? this.qbId });
        this.finish("interception", {
          yards: nearestDef.agent.pos.x,
          interceptorId: nearestDef.agent.id,
          passerId: this.passerId ?? this.qbId,
          targetId: this.resolvedTargetId ?? undefined,
          turnover: true,
          isPass: true,
          passResult: "intercepted",
        });
        return;
      }
    }

    // Overthrown / receiver couldn't get there: incompletion.
    if (!target || dRec > 3.3) {
      this.emit({ t: "incomplete", intendedFor: this.resolvedTargetId ?? undefined });
      this.finish("incomplete", {
        yards: 0,
        passerId: this.passerId ?? this.qbId,
        targetId: this.resolvedTargetId ?? undefined,
        isPass: true,
        passResult: "incomplete",
      });
      return;
    }

    // Completion odds: accuracy of placement + hands, minus tight coverage.
    let catchProb =
      1.0 - dRec * 0.13 + (target.ratings.catching - 70) / 240 - (contested ? 0.17 : 0);
    catchProb = clamp(catchProb, 0.05, 0.98);
    if (this.rng.chance(catchProb)) {
      target.hasBall = true;
      this.ball.carrierId = target.id;
      this.ball.pos = { ...target.pos };
      this.emit({ t: "catch", by: target.id, defended: contested });
      // Play continues — receiver becomes the ball carrier (yards after catch).
    } else {
      this.emit({ t: "incomplete", intendedFor: target!.id });
      this.finish("incomplete", {
        yards: 0,
        passerId: this.passerId ?? this.qbId,
        targetId: target!.id,
        isPass: true,
        passResult: "incomplete",
      });
    }
  }

  // ---- contacts: blocks & tackles ----

  private resolveContacts(): void {
    // Block shed rolls.
    for (const o of this.agents) {
      if (o.side !== "off" || o.assignment.kind !== "block") continue;
      const tid = o.assignment.targetId;
      if (!tid) continue;
      const d = this.byId(tid);
      const locked = dist(o.pos, d.pos) < RADII.block * 1.4;
      if (d.beatBlock) {
        // A shed defender can be re-engaged if the blocker latches back on.
        if (locked && this.tick % 4 === 0 && this.rng.chance(0.4)) d.beatBlock = false;
        continue;
      }
      // Give the line a moment to lock on before any shed is possible.
      if (locked && this.tick > 12) {
        const power = d.ratings.strength + d.ratings.agility;
        const anchor = o.ratings.blocking + o.ratings.strength;
        const shedProb = clamp(0.004 + (power - anchor) / 2600, 0.0006, 0.02);
        if (this.rng.chance(shedProb)) d.beatBlock = true;
      }
    }

    // Tackles on the ball carrier.
    const carrier = this.carrier();
    if (!carrier || this.ball.inAir) return;

    // Touchdown check.
    if (carrier.pos.x >= this.setup.yardsToGoal) {
      this.emit({ t: "touchdown", by: carrier.id });
      this.finish("touchdown", {
        yards: this.setup.yardsToGoal,
        touchdown: true,
        carrierId: carrier.id,
      });
      return;
    }
    // Out of bounds.
    if (carrier.pos.y <= 0.6 || carrier.pos.y >= FIELD.WIDTH - 0.6) {
      this.emit({ t: "outOfBounds", carrier: carrier.id });
      this.finish("outOfBounds", { yards: carrier.pos.x, carrierId: carrier.id });
      return;
    }

    for (const def of this.agents) {
      if (def.side !== "def") continue;
      if (def.blockedUntil && this.tick < def.blockedUntil) continue;
      // A defender tied up with a blocker can't make the tackle — this is what
      // lets the ball carrier run past the engaged line into the second level.
      if (this.isEngagedByBlocker(def)) continue;
      if (dist(def.pos, carrier.pos) > RADII.tackle) continue;
      // Tackle vs break-tackle contest.
      const tackle = def.ratings.tackling + def.ratings.strength;
      const elude = carrier.ratings.strength + carrier.ratings.agility;
      const breakProb = clamp(0.17 + (elude - tackle) / 520, 0.04, 0.5);
      if (this.rng.chance(breakProb)) {
        def.beatBlock = true;
        def.blockedUntil = this.tick + 14;
        this.emit({ t: "breakTackle", carrier: carrier.id, by: def.id });
        continue;
      }
      const reason = carrier.id === this.qbId && !this.handoffDone ? "sack" : "tackle";
      this.emit({ t: "tackle", by: def.id, carrier: carrier.id, yardLine: carrier.pos.x });
      this.finish(reason, {
        yards: carrier.pos.x,
        tacklerId: def.id,
        carrierId: carrier.id,
      });
      return;
    }
  }

  private clampToField(a: Agent): void {
    a.pos.y = clamp(a.pos.y, 0.4, FIELD.WIDTH - 0.4);
  }

  // ---- finishing ----

  private finish(
    reason: PlayResult["endReason"],
    extra: Partial<PlayResult> & { carrierId?: string } = {},
  ): void {
    if (this.done) return;
    this.done = true;
    const carrier = extra.carrierId ? this.byId(extra.carrierId) : this.carrier();
    const yards = extra.yards ?? (carrier ? carrier.pos.x : 0);
    this.result = {
      yards: Math.round(yards * 10) / 10,
      endReason: reason,
      playTime: this.tick * DT,
      turnover: extra.turnover ?? reason === "interception",
      touchdown: extra.touchdown ?? reason === "touchdown",
      isPass: extra.isPass ?? this.isPass,
      ballCarrierId: extra.carrierId ?? this.ball.carrierId,
      passerId: extra.passerId,
      targetId: extra.targetId,
      tacklerId: extra.tacklerId,
      interceptorId: extra.interceptorId,
      sackerId: reason === "sack" ? extra.tacklerId : undefined,
      passResult: extra.passResult,
    };
  }

  snapshot(): PlaySnapshot {
    return {
      tick: this.tick,
      agents: this.agents,
      ball: { pos: this.ball.pos, carrierId: this.ball.carrierId, inAir: this.ball.inAir },
      los: 0,
      done: this.done,
    };
  }

  /** Local-frame route polylines for offensive receivers, for the renderer to
   *  draw pre-snap (each line starts at the player's snap position). */
  routePolylines(): Array<{ id: string; points: Vec2[] }> {
    const out: Array<{ id: string; points: Vec2[] }> = [];
    for (const a of this.agents) {
      if (a.side !== "off" || a.assignment.kind !== "runRoute") continue;
      const base = this.getSnap(a);
      const points: Vec2[] = [{ ...base }];
      for (const wp of a.assignment.waypoints) points.push(add(base, wp));
      out.push({ id: a.id, points });
    }
    return out;
  }

  /** Pass-flight info while the ball is airborne, for arc rendering.
   *  progress is 0 at release, 1 at arrival. */
  passFlight(): { from: Vec2; to: Vec2; progress: number } | null {
    if (!this.ball.inAir || !this.throwFrom || !this.ball.target) return null;
    const span = Math.max(1, this.landTick - this.throwTick);
    const progress = clamp((this.tick - this.throwTick) / span, 0, 1);
    return { from: { ...this.throwFrom }, to: { ...this.ball.target }, progress };
  }

  /** Run the play to completion with no rendering (instant / headless / tests). */
  runToCompletion(): PlayResult {
    while (!this.done) this.step();
    return this.result!;
  }
}
