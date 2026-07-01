import type { GameInfo } from "./game";
import { DEF_PLAYS, OFF_PLAYS } from "./playbook";
import type { RNG } from "./rng";
import { NEUTRAL_GAMEPLAN, overall, type Gameplan } from "./gameplan";
import type { Team } from "./roster";
import type { Position } from "./types";

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

const other = (t: GameInfo["possession"]): GameInfo["possession"] =>
  t === "home" ? "away" : "home";

/** True in a hurry-up situation (end of either half). */
function twoMinute(info: GameInfo): boolean {
  return (info.quarter === 2 || info.quarter >= 4) && info.clock <= 120;
}

/** Weighted random pick (weights clamped to ≥0). */
function weighted(rng: RNG, entries: Array<[string, number]>): string {
  const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0);
  if (total <= 0) return entries[0][0];
  let r = rng.next() * total;
  for (const [id, w] of entries) { r -= Math.max(0, w); if (r <= 0) return id; }
  return entries[entries.length - 1][0];
}

/**
 * A team's play-calling identity, derived from its roster so squads lean on
 * their strengths (a great backfield runs more; loaded receivers throw more).
 */
export interface Tendency {
  /** −1 run-first … +1 pass-first, relative to a balanced roster. */
  passLean: number;
  passStrength: number; // OVR of the pass game (QB + receivers)
  runStrength: number; // OVR of the run game (RB + line)
  protection: number; // pass-pro quality (OL)
}

export const NEUTRAL_TENDENCY: Tendency = {
  passLean: 0, passStrength: 75, runStrength: 75, protection: 75,
};

function unitOvr(players: Team["offense"], pos: Position): number {
  const ps = players.filter((p) => p.pos === pos);
  if (!ps.length) return 75;
  return ps.reduce((s, p) => s + overall(p.ratings, p.pos), 0) / ps.length;
}

/** Compute a team's offensive tendency from its roster. */
export function teamTendency(team: Team): Tendency {
  const qb = unitOvr(team.offense, "QB");
  const wr = unitOvr(team.offense, "WR");
  const te = unitOvr(team.offense, "TE");
  const rb = unitOvr(team.offense, "RB");
  const ol = unitOvr(team.offense, "OL");
  const passStrength = qb * 0.55 + wr * 0.35 + te * 0.1;
  const runStrength = rb * 0.45 + ol * 0.55;
  const passLean = Math.max(-1, Math.min(1, (passStrength - runStrength) / 22));
  return { passLean, passStrength, runStrength, protection: ol };
}

/** Choose a specific run given the situation + who's blocking. */
function chooseRun(info: GameInfo, rng: RNG, tnd: Tendency): string {
  const short = info.distance <= 2;
  const longAndOdd = info.down >= 2 && info.distance >= 7;
  const speedEdge = tnd.runStrength >= 78 ? 1.4 : 1; // sweep needs blockers
  return weighted(rng, [
    ["inside-zone", short ? 1.8 : 1.1],
    ["power-sweep", (short ? 1.2 : 0.9) * speedEdge],
    // Draw is a passing-down changeup — useless on short yardage.
    ["draw", longAndOdd ? 1.4 : short ? 0.1 : 0.5],
  ]);
}

/** Choose a short/intermediate pass. Screens shine on obvious blitz downs. */
function chooseShortPass(info: GameInfo, rng: RNG): string {
  const obviousPass = info.down >= 3 && info.distance >= 6;
  const shortDown = info.distance <= 4;
  return weighted(rng, [
    ["quick-slants", 1.2 + (shortDown ? 0.4 : 0)],
    ["mesh", 1.1 + (shortDown ? 0.3 : 0)], // rubs beat man on 3rd-and-short
    ["hb-screen", obviousPass ? 1.3 : 0.5], // let the rush come, dump it off
  ]);
}

/** Choose a deep shot. Play-action only sells when a run is believable. */
function chooseDeep(info: GameInfo, rng: RNG, hurry: boolean): string {
  // On 3rd/4th-and-long or in a hurry-up, the run fake is a lie — drop back.
  const paBelievable = info.down <= 2 && info.distance <= 8 && !hurry;
  return weighted(rng, [
    ["four-verticals", 1.2],
    ["play-action-deep", paBelievable ? 1.5 : 0],
  ]);
}

/**
 * Pick an offensive play. Situationally aware: down & distance, score & clock
 * (two-minute hurry-up vs. clock-kill), field zone (red zone / goal-to-go), and
 * a momentum nudge (-1 cold .. +1 hot) that bends aggression.
 */
export function pickOffense(
  info: GameInfo, phi: Philosophy, rng: RNG, momentum = 0, plan: Gameplan = NEUTRAL_GAMEPLAN,
  tnd: Tendency = NEUTRAL_TENDENCY,
): string {
  const yardsToGo = info.distance;
  const lead = info.score[info.possession] - info.score[other(info.possession)];
  const late = info.quarter >= 4;
  const hurry = twoMinute(info) && lead <= 0;
  const killClock = late && lead > 0 && info.clock <= 300;
  const redZone = info.ballOn >= 80;
  const goalToGo = info.ballOn + info.distance >= 100;

  // Game plan: an "Air" plan leans the calls to the pass, "Ground" to the run;
  // the roster's own tendency nudges a team toward what it does best.
  let passProb = 0.35 + phi.passLean * 0.4 + momentum * 0.08 + plan.air * 0.22
    + tnd.passLean * 0.12;
  // Long yardage signals pass — but only once behind the sticks (1st-and-10 is
  // a neutral down, not an obvious passing down).
  if (info.down >= 2 && yardsToGo >= 8) passProb += 0.2;
  if (yardsToGo <= 2) passProb -= 0.25;
  if (info.down >= 3) passProb += yardsToGo >= 4 ? 0.25 : -0.1;
  if (hurry) passProb += 0.3;
  if (killClock) passProb -= 0.35;
  if (goalToGo && yardsToGo <= 2) passProb -= 0.2; // pound it in
  passProb = Math.max(0.05, Math.min(0.95, passProb));

  if (!rng.chance(passProb)) return chooseRun(info, rng, tnd);

  // Pass depth: "Explosive" plans and strong, well-protected passers take more
  // shots; no room for verticals in the red zone; trailing late wants chunks.
  let deepProb = 0.2 + phi.risk * 0.4 + momentum * 0.08 + plan.explosive * 0.25 + plan.air * 0.08
    + (yardsToGo >= 12 ? 0.2 : 0)
    + ((tnd.passStrength - 75) / 100) + ((tnd.protection - 75) / 160);
  if (redZone) deepProb = 0; // keep it underneath
  if (hurry && lead < -3) deepProb += 0.25;
  if (rng.chance(Math.max(0, Math.min(0.85, deepProb)))) return chooseDeep(info, rng, hurry);
  return chooseShortPass(info, rng);
}

/** Pick a defensive play, aware of situation, momentum, game plan, and the
 *  offense's roster tendency (run-heavy vs pass-heavy). */
export function pickDefense(
  info: GameInfo, phi: Philosophy, rng: RNG, momentum = 0, plan: Gameplan = NEUTRAL_GAMEPLAN,
  oppTnd: Tendency = NEUTRAL_TENDENCY,
): string {
  const passDown = info.down >= 3 && info.distance >= 5;
  const shortYardage = info.distance <= 2;
  const goalLineRun = info.ballOn >= 92 && shortYardage;
  const preventMode = twoMinute(info) && info.score[other(info.possession)] >= info.score[info.possession];
  // Read the offense: a run-first team on an early down invites a loaded box;
  // a pass-first team draws more coverage.
  const expectRun = !passDown && (shortYardage || oppTnd.passLean < -0.2);

  // Goal-line / short yardage near the stripe: stack the box (run-stop plans
  // reach for it more readily).
  if (goalLineRun && rng.chance(0.62 - plan.coverage * 0.25 + Math.max(0, -oppTnd.passLean) * 0.15)) {
    return "goal-line";
  }

  // Two-minute prevent: sit in deep zones, don't get beaten over the top.
  if (preventMode) return rng.chance(0.5) ? "cover4-quarters" : "cover2-man";

  // "Pressure" plans blitz more; "Contain" plans blitz less. Blitz a shaky
  // pass-pro more readily, but don't over-blitz an obvious run team.
  let blitz = phi.blitzFreq + (passDown ? 0.15 : 0) + (info.down >= 3 ? 0.1 : 0)
    - momentum * 0.06 + plan.pressure * 0.28
    + (oppTnd.protection < 72 ? 0.1 : 0) - (expectRun ? 0.08 : 0);
  blitz = Math.max(0, Math.min(0.92, blitz));
  if (rng.chance(blitz)) {
    // All-out Cover 0 when feeling aggressive or a heavy pressure plan.
    const wild = phi.aggression > 0.6 || plan.pressure > 0.4;
    return rng.pick(wild ? ["zone-blitz", "nickel-man", "cover0-blitz"] : ["zone-blitz", "nickel-man"]);
  }
  // Coverage-focused plans favour pass coverage; run reads favour the base.
  if (passDown || plan.coverage > 0.2) return rng.pick(["cover2-man", "cover4-quarters"]);
  if (expectRun || plan.coverage < -0.2) return rng.chance(0.6) ? "cover3-base" : "goal-line";
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
