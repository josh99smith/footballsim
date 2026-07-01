import { RNG } from "./rng";
import type { Position, Ratings } from "./types";

/**
 * A game plan is the coach's emphasis, set pre-game and adjustable at halftime.
 * Each axis is a bipolar trade-off in [-1, 1]: leaning one way boosts a cluster
 * of player ratings while taking away from the opposite cluster. 0 is balanced.
 */
export interface Gameplan {
  air: number; // offense: -1 ground & pound .. +1 air raid
  explosive: number; // offense: -1 ball control .. +1 explosive
  tempo: number; // offense: -1 milk the clock .. +1 no-huddle
  coverage: number; // defense: -1 stop the run .. +1 lock coverage
  pressure: number; // defense: -1 contain .. +1 bring pressure
  press: number; // defense: -1 soft cushion .. +1 press man
}

export const NEUTRAL_GAMEPLAN: Gameplan = {
  air: 0, explosive: 0, tempo: 0, coverage: 0, pressure: 0, press: 0,
};

/** Metadata for the sliders (used by the UI). */
export const GAMEPLAN_AXES: Array<{
  key: keyof Gameplan;
  side: "offense" | "defense";
  label: string;
  lo: string;
  hi: string;
  hint: string;
}> = [
  { key: "air", side: "offense", label: "Attack", lo: "Ground", hi: "Air", hint: "Pass emphasis: sharper receivers, weaker run blocking." },
  { key: "explosive", side: "offense", label: "Style", lo: "Control", hi: "Explosive", hint: "Chase big plays: more speed, less ball security." },
  { key: "tempo", side: "offense", label: "Tempo", lo: "Milk", hi: "No-Huddle", hint: "No-huddle runs more plays but tires the reads." },
  { key: "coverage", side: "defense", label: "Focus", lo: "Stop Run", hi: "Coverage", hint: "Coverage over run-stop: faster DBs, softer front." },
  { key: "pressure", side: "defense", label: "Front", lo: "Contain", hi: "Pressure", hint: "Send heat: quicker rushers, thinner contain." },
  { key: "press", side: "defense", label: "Corners", lo: "Cushion", hi: "Press", hint: "Press-man jams routes early but risks the deep ball." },
];

const M = 15; // max rating swing at a full slider

const clampR = (x: number): number => Math.max(1, Math.min(99, Math.round(x)));

/** Apply a game plan to one player's ratings, based on position. */
export function applyGameplan(r: Ratings, pos: Position, plan: Gameplan): Ratings {
  const a = plan.air, e = plan.explosive, t = plan.tempo;
  const c = plan.coverage, p = plan.pressure, pr = plan.press;
  const out: Ratings = { ...r };
  switch (pos) {
    case "QB":
      // No-huddle sharpens rhythm but hurried reads cost late-down awareness.
      out.awareness = clampR(r.awareness + a * M * 0.6 - e * M * 0.3 + t * M * 0.35);
      out.agility = clampR(r.agility + e * M * 0.4 + t * M * 0.2);
      break;
    case "WR":
      out.catching = clampR(r.catching + a * M * 0.8 - e * M * 0.3);
      out.speed = clampR(r.speed + e * M * 0.7 + t * M * 0.3);
      out.agility = clampR(r.agility + e * M * 0.5 + t * M * 0.2);
      break;
    case "TE":
      out.catching = clampR(r.catching + a * M * 0.6 - e * M * 0.2);
      out.blocking = clampR(r.blocking - a * M * 0.4 - t * M * 0.3);
      out.speed = clampR(r.speed + e * M * 0.4 + t * M * 0.25);
      break;
    case "RB":
      out.speed = clampR(r.speed - a * M * 0.4 + e * M * 0.6 + t * M * 0.25);
      out.agility = clampR(r.agility - a * M * 0.3 + e * M * 0.5);
      out.strength = clampR(r.strength - a * M * 0.4 - e * M * 0.2 - t * M * 0.2);
      break;
    case "OL":
      // Up-tempo tires the line — less push as the drive goes long.
      out.blocking = clampR(r.blocking - a * M * 0.5 - t * M * 0.3);
      out.strength = clampR(r.strength - a * M * 0.3 - e * M * 0.2 - t * M * 0.25);
      break;
    case "DL":
      out.strength = clampR(r.strength - c * M * 0.5 + p * M * 0.5);
      out.tackling = clampR(r.tackling - c * M * 0.5);
      out.agility = clampR(r.agility + p * M * 0.4);
      break;
    case "LB":
      out.tackling = clampR(r.tackling - c * M * 0.5);
      out.strength = clampR(r.strength - c * M * 0.3 + p * M * 0.4);
      out.awareness = clampR(r.awareness + c * M * 0.3);
      out.speed = clampR(r.speed + c * M * 0.2);
      break;
    case "CB":
      // Press-man jams routes (strength/tackling) but a beaten cushion
      // leaves the corner exposed deep (awareness down).
      out.speed = clampR(r.speed + c * M * 0.7);
      out.awareness = clampR(r.awareness + c * M * 0.7 - p * M * 0.3 - pr * M * 0.35);
      out.tackling = clampR(r.tackling - c * M * 0.3 + pr * M * 0.4);
      out.strength = clampR(r.strength + pr * M * 0.5);
      break;
    case "S":
      out.speed = clampR(r.speed + c * M * 0.6);
      out.awareness = clampR(r.awareness + c * M * 0.6 - p * M * 0.3 - pr * M * 0.25);
      out.tackling = clampR(r.tackling - c * M * 0.4 + p * M * 0.2 + pr * M * 0.3);
      out.strength = clampR(r.strength + pr * M * 0.3);
      break;
  }
  return out;
}

/** Position-weighted overall rating (for display). */
export function overall(r: Ratings, pos: Position): number {
  const w: Partial<Record<Position, Array<[keyof Ratings, number]>>> = {
    QB: [["awareness", 3], ["agility", 1], ["strength", 1]],
    RB: [["speed", 2], ["agility", 2], ["strength", 1.5], ["catching", 1]],
    WR: [["catching", 2.5], ["speed", 2], ["agility", 1.5]],
    TE: [["catching", 2], ["blocking", 1.5], ["strength", 1]],
    OL: [["blocking", 3], ["strength", 2]],
    DL: [["strength", 2.5], ["tackling", 2], ["speed", 1]],
    LB: [["tackling", 2.5], ["speed", 1.5], ["strength", 1.5], ["awareness", 1]],
    CB: [["speed", 2.5], ["awareness", 2], ["agility", 1.5]],
    S: [["speed", 2], ["tackling", 1.5], ["awareness", 2]],
  };
  const parts = w[pos] ?? [["speed", 1], ["strength", 1]];
  let num = 0, den = 0;
  for (const [k, weight] of parts) { num += r[k] * weight; den += weight; }
  return Math.round(num / den);
}

/** A deterministic game plan for the AI opponent, derived from the seed so the
 *  opponent has a stable identity (and replays stay reproducible). */
export function deriveAiGameplan(seed: number): Gameplan {
  const rng = new RNG((seed ^ 0x60a17a5) >>> 0);
  const axis = () => Math.round((rng.range(-0.7, 0.7)) * 100) / 100;
  return {
    air: axis(), explosive: axis(), tempo: axis(),
    coverage: axis(), pressure: axis(), press: axis(),
  };
}

/** Short human summary of a plan's strengths (for the UI). */
export function planSummary(plan: Gameplan): string {
  const bits: string[] = [];
  const add = (v: number, hi: string, lo: string) => {
    if (v > 0.15) bits.push(hi);
    else if (v < -0.15) bits.push(lo);
  };
  add(plan.air, "Pass attack", "Run attack");
  add(plan.explosive, "Big plays", "Ball security");
  add(plan.tempo, "No-huddle", "Clock control");
  add(plan.coverage, "Pass D", "Run D");
  add(plan.pressure, "Pass rush", "Discipline");
  add(plan.press, "Press man", "Off coverage");
  return bits.length ? bits.join(" · ") : "Balanced";
}
