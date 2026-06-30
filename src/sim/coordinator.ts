import type { GameInfo } from "./game";
import { DEF_PLAYS, OFF_PLAYS } from "./playbook";
import type { RNG } from "./rng";

/** Coaching "play style" knobs. Each is 0..1. */
export interface Philosophy {
  aggression: number; // higher = more big plays, more 4th-down gambles
  passLean: number; // 0 = run heavy, 1 = pass heavy
  blitzFreq: number; // 0 = sit back, 1 = bring heat
  tempo: number; // (reserved) higher = faster
  risk: number; // higher = deeper shots, fewer checkdowns
}

export const DEFAULT_PHILOSOPHY: Philosophy = {
  aggression: 0.5,
  passLean: 0.5,
  blitzFreq: 0.4,
  tempo: 0.5,
  risk: 0.5,
};

type FourthDown = "go" | "punt" | "fieldGoal";

const RUN_PLAYS = ["inside-zone", "power-sweep"];
const SHORT_PASS = ["quick-slants"];
const DEEP_PASS = ["four-verticals", "play-action-deep"];

/** Pick an offensive play id from the situation and philosophy. */
export function pickOffense(info: GameInfo, phi: Philosophy, rng: RNG): string {
  const yardsToGo = info.distance;
  // Base pass probability from philosophy, nudged by down & distance.
  let passProb = 0.35 + phi.passLean * 0.4;
  if (yardsToGo >= 8) passProb += 0.2;
  if (yardsToGo <= 2) passProb -= 0.25;
  if (info.down >= 3) passProb += yardsToGo >= 4 ? 0.25 : -0.1;
  passProb = Math.max(0.05, Math.min(0.95, passProb));

  if (!rng.chance(passProb)) {
    return rng.pick(RUN_PLAYS);
  }
  // Choose pass depth from risk + need.
  const goDeep = rng.chance(0.25 + phi.risk * 0.4 + (yardsToGo >= 12 ? 0.2 : 0));
  return rng.pick(goDeep ? DEEP_PASS : SHORT_PASS);
}

/** Pick a defensive play id. */
export function pickDefense(info: GameInfo, phi: Philosophy, rng: RNG): string {
  // Likely-pass downs invite man/blitz; likely-run downs invite base.
  const passDown = info.down >= 3 && info.distance >= 5;
  let blitz = phi.blitzFreq + (passDown ? 0.15 : 0) + (info.down >= 3 ? 0.1 : 0);
  blitz = Math.max(0, Math.min(0.9, blitz));

  if (rng.chance(blitz)) {
    return rng.pick(["zone-blitz", "nickel-man"]);
  }
  if (passDown && rng.chance(0.5)) return "cover2-man";
  return "cover3-base";
}

/** AI decision on 4th down. */
export function fourthDownDecision(info: GameInfo, phi: Philosophy, rng: RNG): FourthDown {
  const toGoal = 100 - info.ballOn;
  const fgDist = toGoal + 17;

  // Late & trailing pushes aggression up.
  const trailing = info.score[info.possession] < info.score[info.possession === "home" ? "away" : "home"];
  const desperate = info.quarter >= 4 && trailing;

  // In field-goal range and not desperate for a TD: kick.
  if (fgDist <= 52 && !(desperate && toGoal <= 5)) {
    if (info.distance >= 3 || fgDist <= 38 || !rng.chance(phi.aggression * 0.5)) {
      return "fieldGoal";
    }
  }

  // Short yardage or desperate: go for it.
  const goProb =
    (info.distance <= 2 ? 0.45 : 0.12) +
    phi.aggression * 0.35 +
    (desperate ? 0.4 : 0) +
    (info.ballOn >= 55 ? 0.15 : 0);
  if (rng.chance(Math.min(0.95, goProb))) return "go";

  // Out of FG range, not going: punt.
  if (fgDist > 52) return "punt";
  return "fieldGoal";
}

export const offPlayName = (id: string): string =>
  OFF_PLAYS.find((p) => p.id === id)?.name ?? id;
export const defPlayName = (id: string): string =>
  DEF_PLAYS.find((p) => p.id === id)?.name ?? id;
