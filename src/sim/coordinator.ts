import type { GameInfo } from "./game";
import { DEF_PLAYS, OFF_PLAYS } from "./playbook";
import type { RNG } from "./rng";
import { NEUTRAL_GAMEPLAN, type Gameplan } from "./gameplan";

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

const RUN_PLAYS = ["inside-zone", "power-sweep", "draw"];
const SHORT_PASS = ["quick-slants", "mesh", "hb-screen"];
const DEEP_PASS = ["four-verticals", "play-action-deep"];

const other = (t: GameInfo["possession"]): GameInfo["possession"] =>
  t === "home" ? "away" : "home";

/** True in a hurry-up situation (end of either half). */
function twoMinute(info: GameInfo): boolean {
  return (info.quarter === 2 || info.quarter >= 4) && info.clock <= 120;
}

/**
 * Pick an offensive play. Situationally aware: down & distance, score & clock
 * (two-minute hurry-up vs. clock-kill), field zone (red zone / goal-to-go), and
 * a momentum nudge (-1 cold .. +1 hot) that bends aggression.
 */
export function pickOffense(
  info: GameInfo, phi: Philosophy, rng: RNG, momentum = 0, plan: Gameplan = NEUTRAL_GAMEPLAN,
): string {
  const yardsToGo = info.distance;
  const lead = info.score[info.possession] - info.score[other(info.possession)];
  const late = info.quarter >= 4;
  const hurry = twoMinute(info) && lead <= 0;
  const killClock = late && lead > 0 && info.clock <= 300;
  const redZone = info.ballOn >= 80;
  const goalToGo = info.ballOn + info.distance >= 100;

  // Game plan: an "Air" plan leans the calls to the pass, "Ground" to the run.
  let passProb = 0.35 + phi.passLean * 0.4 + momentum * 0.08 + plan.air * 0.22;
  if (yardsToGo >= 8) passProb += 0.2;
  if (yardsToGo <= 2) passProb -= 0.25;
  if (info.down >= 3) passProb += yardsToGo >= 4 ? 0.25 : -0.1;
  if (hurry) passProb += 0.3;
  if (killClock) passProb -= 0.35;
  if (goalToGo && yardsToGo <= 2) passProb -= 0.2; // pound it in
  passProb = Math.max(0.05, Math.min(0.95, passProb));

  if (!rng.chance(passProb)) return rng.pick(RUN_PLAYS);

  // Pass depth: "Explosive" plans take more shots; no room for verticals in the
  // red zone; hurry-up trailing late wants chunk plays.
  let deepProb = 0.22 + phi.risk * 0.4 + momentum * 0.08 + plan.explosive * 0.25 + plan.air * 0.08
    + (yardsToGo >= 12 ? 0.2 : 0);
  if (redZone) deepProb = 0; // keep it underneath
  if (hurry && lead < -3) deepProb += 0.25;
  return rng.pick(rng.chance(Math.max(0, Math.min(0.85, deepProb))) ? DEEP_PASS : SHORT_PASS);
}

/** Pick a defensive play, aware of situation, momentum, and game plan. */
export function pickDefense(
  info: GameInfo, phi: Philosophy, rng: RNG, momentum = 0, plan: Gameplan = NEUTRAL_GAMEPLAN,
): string {
  const passDown = info.down >= 3 && info.distance >= 5;
  const shortYardage = info.distance <= 2;
  const goalLineRun = info.ballOn >= 92 && shortYardage;
  const preventMode = twoMinute(info) && info.score[other(info.possession)] >= info.score[info.possession];

  // Goal-line / short yardage near the stripe: stack the box (run-stop plans
  // reach for it more readily).
  if (goalLineRun && rng.chance(0.6 - plan.coverage * 0.25)) return "goal-line";

  // Two-minute prevent: sit in deep zones, don't get beaten over the top.
  if (preventMode) return rng.chance(0.5) ? "cover4-quarters" : "cover2-man";

  // "Pressure" plans blitz more; "Contain" plans blitz less.
  let blitz = phi.blitzFreq + (passDown ? 0.15 : 0) + (info.down >= 3 ? 0.1 : 0)
    - momentum * 0.06 + plan.pressure * 0.28;
  blitz = Math.max(0, Math.min(0.92, blitz));
  if (rng.chance(blitz)) {
    // All-out Cover 0 when feeling aggressive or a heavy pressure plan.
    const wild = phi.aggression > 0.6 || plan.pressure > 0.4;
    return rng.pick(wild ? ["zone-blitz", "nickel-man", "cover0-blitz"] : ["zone-blitz", "nickel-man"]);
  }
  // Coverage-focused plans favour pass coverage; run-stop plans favour the base.
  if (passDown || plan.coverage > 0.2) return rng.pick(["cover2-man", "cover4-quarters"]);
  if (plan.coverage < -0.2) return rng.chance(0.5) ? "cover3-base" : "goal-line";
  return rng.chance(0.6) ? "cover3-base" : "cover4-quarters";
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
