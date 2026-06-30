import type { Vec2 } from "./vec2";

export type Side = "off" | "def";
export type TeamId = "home" | "away";

export interface Ratings {
  speed: number; // 0..100
  strength: number;
  agility: number;
  awareness: number;
  catching: number;
  tackling: number;
  blocking: number;
}

export type Position =
  | "QB" | "RB" | "WR" | "TE" | "OL"
  | "DL" | "LB" | "CB" | "S";

export interface PlayerDef {
  id: string;
  number: number;
  name: string;
  pos: Position;
  ratings: Ratings;
}

/** Per-snap job for one of the 22 agents. */
export type Assignment =
  | { kind: "qb"; dropDepth: number }
  | { kind: "carry"; aimGap: number } // lateral aim point at the LOS (yards from center)
  | { kind: "runRoute"; waypoints: Vec2[]; isCheckdown?: boolean }
  | { kind: "block"; targetId?: string; gap?: number } // pass-pro / run block
  | { kind: "coverMan"; targetId: string }
  | { kind: "coverZone"; center: Vec2; radius: number }
  | { kind: "rush"; lane: number }
  | { kind: "spy"; targetId: string }
  | { kind: "idle" };

/** Runtime agent state inside a single play. Positions are in LOCAL frame:
 *  x = yards downfield in the offense's attack direction (LOS = 0),
 *  y = yards across the field (0 = left sideline, FIELD.WIDTH = right). */
export interface Agent {
  id: string;
  defId: string; // PlayerDef.id
  side: Side;
  number: number;
  pos: Vec2;
  vel: Vec2;
  ratings: Ratings;
  assignment: Assignment;
  // transient flags
  engagedWith?: string; // id of blocker/blockee currently locked up
  blockedUntil?: number; // tick until which a defender is shed/stunned
  hasBall: boolean;
  routeIdx: number; // progress along waypoints
  beatBlock: boolean; // rusher has shed his blocker
}

export type PassResult = "complete" | "incomplete" | "intercepted";

export type PlayEndReason =
  | "tackle"
  | "outOfBounds"
  | "touchdown"
  | "incomplete"
  | "interception"
  | "sack"
  | "fumbleLost"
  | "timeExpired";

export interface PlayResult {
  yards: number; // net yards gained from the LOS (can be negative)
  endReason: PlayEndReason;
  playTime: number; // seconds of game clock the play consumed
  turnover: boolean;
  touchdown: boolean;
  ballCarrierId?: string;
  passerId?: string;
  targetId?: string;
  tacklerId?: string;
  interceptorId?: string;
  sackerId?: string;
  passResult?: PassResult;
  isPass: boolean;
}

/** Typed events emitted by the sim. Consumed by stats + play-by-play. */
export type SimEvent =
  | { t: "snap" }
  | { t: "handoff"; to: string }
  | { t: "pass"; from: string; to: string; airYards: number }
  | { t: "catch"; by: string; defended: boolean }
  | { t: "incomplete"; intendedFor?: string }
  | { t: "tackle"; by: string; carrier: string; yardLine: number }
  | { t: "breakTackle"; carrier: string; by: string }
  | { t: "sack"; by: string; carrier: string }
  | { t: "interception"; by: string; from: string }
  | { t: "touchdown"; by: string }
  | { t: "outOfBounds"; carrier: string };

/** Snapshot the renderer consumes. Pure data, no behaviour. */
export interface PlaySnapshot {
  tick: number;
  agents: ReadonlyArray<Agent>;
  ball: { pos: Vec2; carrierId?: string; inAir: boolean };
  los: number; // local-frame LOS is always 0; kept for clarity
  done: boolean;
}
