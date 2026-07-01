import { RNG } from "./rng";
import { NEUTRAL_GAMEPLAN, type Gameplan } from "./gameplan";
import { DEFAULT_PHILOSOPHY, type Philosophy } from "./coordinator";
import type { Position, Ratings } from "./types";

/** Game situation from the acting team's perspective, for trait conditions. */
export interface CoachCtx {
  quarter: number;
  clock: number; // seconds left in the quarter
  scoreDiff: number; // this team's lead (negative = trailing)
  down: number;
  distance: number;
  ballOn: number; // the offense's yard line, 0..100 (100 = opponent goal)
  overtime: number;
}

type Bonus = Partial<Record<Position, Partial<Ratings>>>;

/** A coach's signature edge: a situational rating bump for his kind of moment. */
export interface Trait {
  id: string;
  name: string;
  desc: string;
  /** Empty when the moment isn't live; otherwise per-position rating deltas. */
  bonus: (isOffense: boolean, ctx: CoachCtx) => Bonus;
}

export interface Coach {
  id: string;
  name: string;
  blurb: string;
  gameplan: Gameplan;
  philosophy: Philosophy;
  trait: Trait;
}

// ---- traits -----------------------------------------------------------------

const TWO_MIN = (ctx: CoachCtx) => (ctx.quarter === 2 || ctx.quarter >= 4) && ctx.clock <= 120;

const GUNSLINGER: Trait = {
  id: "gunslinger", name: "Gunslinger",
  desc: "When trailing, the passing game sharpens.",
  bonus: (off, ctx) =>
    off && ctx.scoreDiff < 0
      ? { QB: { awareness: 6 }, WR: { catching: 6, speed: 3 }, TE: { catching: 4 } }
      : {},
};

const CLOSER: Trait = {
  id: "closer", name: "Closer",
  desc: "Protecting a 4th-quarter lead, the run game grinds it out.",
  bonus: (off, ctx) =>
    off && ctx.quarter >= 4 && ctx.scoreDiff > 0
      ? { OL: { blocking: 7, strength: 5 }, RB: { strength: 5, agility: 3 }, TE: { blocking: 5 } }
      : {},
};

const DIAL_UP_PRESSURE: Trait = {
  id: "pressure", name: "Dial-Up Pressure",
  desc: "On obvious passing downs, the rush gets home.",
  bonus: (off, ctx) =>
    !off && ctx.down >= 3 && ctx.distance >= 5
      ? { DL: { strength: 6, tackling: 4 }, LB: { speed: 5, strength: 3 } }
      : {},
};

const RED_ZONE_WALL: Trait = {
  id: "redzone", name: "Red Zone Wall",
  desc: "Backed up near the goal, the secondary clamps down.",
  bonus: (off, ctx) =>
    !off && ctx.ballOn >= 80
      ? { CB: { awareness: 7, tackling: 4 }, S: { awareness: 6, tackling: 4 }, LB: { awareness: 4 } }
      : {},
};

const GO_FOR_IT: Trait = {
  id: "gofor", name: "Go For It",
  desc: "Fourth down is just another down — the unit rises to it.",
  bonus: (off, ctx) =>
    off && ctx.down === 4
      ? { OL: { blocking: 5 }, RB: { agility: 5, strength: 3 }, WR: { catching: 4 }, QB: { awareness: 4 } }
      : {},
};

const TWO_MINUTE: Trait = {
  id: "twomin", name: "Two-Minute Drill",
  desc: "In the hurry-up, the offense operates with cold efficiency.",
  bonus: (off, ctx) =>
    off && TWO_MIN(ctx)
      ? { QB: { awareness: 7 }, WR: { catching: 5, agility: 3 } }
      : {},
};

// ---- archetypes -------------------------------------------------------------

const gp = (p: Partial<Gameplan>): Gameplan => ({ ...NEUTRAL_GAMEPLAN, ...p });
const phi = (p: Partial<Philosophy>): Philosophy => ({ ...DEFAULT_PHILOSOPHY, ...p });

export const COACHES: Coach[] = [
  {
    id: "air-raid", name: "Air Raid", blurb: "Spread them out and let it fly.",
    gameplan: gp({ air: 0.6, explosive: 0.35, tempo: 0.35 }),
    philosophy: phi({ aggression: 0.6, passLean: 0.82, blitzFreq: 0.45, tempo: 0.7, risk: 0.62 }),
    trait: GUNSLINGER,
  },
  {
    id: "smashmouth", name: "Smashmouth", blurb: "Run it down their throat, win the clock.",
    gameplan: gp({ air: -0.6, explosive: -0.25, tempo: -0.35, coverage: -0.2, pressure: 0.1 }),
    philosophy: phi({ aggression: 0.45, passLean: 0.28, blitzFreq: 0.35, tempo: 0.3, risk: 0.3 }),
    trait: CLOSER,
  },
  {
    id: "blitzburgh", name: "Blitzburgh", blurb: "Bring the heat on every snap.",
    gameplan: gp({ explosive: 0.1, pressure: 0.6, press: 0.35 }),
    philosophy: phi({ aggression: 0.62, passLean: 0.5, blitzFreq: 0.85, tempo: 0.5, risk: 0.52 }),
    trait: DIAL_UP_PRESSURE,
  },
  {
    id: "bend-dont-break", name: "Bend Don't Break", blurb: "Keep it in front, tighten near the stripe.",
    gameplan: gp({ explosive: -0.1, tempo: -0.1, coverage: 0.55, pressure: -0.25, press: -0.2 }),
    philosophy: phi({ aggression: 0.4, passLean: 0.45, blitzFreq: 0.2, tempo: 0.45, risk: 0.35 }),
    trait: RED_ZONE_WALL,
  },
  {
    id: "riverboat", name: "Riverboat", blurb: "Fortune favors the bold — go for it.",
    gameplan: gp({ air: 0.25, explosive: 0.45, tempo: 0.2, pressure: 0.2, press: 0.15 }),
    philosophy: phi({ aggression: 0.9, passLean: 0.6, blitzFreq: 0.6, tempo: 0.6, risk: 0.75 }),
    trait: GO_FOR_IT,
  },
  {
    id: "field-general", name: "Field General", blurb: "Play the percentages, master the moment.",
    gameplan: gp({}),
    philosophy: phi({ aggression: 0.55, passLean: 0.5, blitzFreq: 0.45, tempo: 0.5, risk: 0.5 }),
    trait: TWO_MINUTE,
  },
];

export const DEFAULT_COACH: Coach = COACHES[COACHES.length - 1]; // Field General

export function coachById(id: string | undefined): Coach {
  return COACHES.find((c) => c.id === id) ?? DEFAULT_COACH;
}

/** A stable opponent coach for a seed (with a small gameplan jitter). */
export function deriveAiCoach(seed: number): Coach {
  const rng = new RNG((seed ^ 0xc0ac4) >>> 0);
  const base = COACHES[rng.int(0, COACHES.length - 1)];
  const jitter = (v: number) => Math.max(-1, Math.min(1, v + rng.range(-0.12, 0.12)));
  return {
    ...base,
    id: `ai-${base.id}`,
    gameplan: {
      air: jitter(base.gameplan.air), explosive: jitter(base.gameplan.explosive),
      tempo: jitter(base.gameplan.tempo), coverage: jitter(base.gameplan.coverage),
      pressure: jitter(base.gameplan.pressure), press: jitter(base.gameplan.press),
    },
  };
}

// ---- trait application ------------------------------------------------------

/** Per-position rating bonus from a coach's trait in the given situation. */
export function traitBonus(coach: Coach, isOffense: boolean, ctx: CoachCtx): Bonus {
  return coach.trait.bonus(isOffense, ctx);
}

/** Whether a coach's signature is currently live (for the UI badge). */
export function traitActive(coach: Coach, isOffense: boolean, ctx: CoachCtx): boolean {
  const b = coach.trait.bonus(isOffense, ctx);
  return Object.keys(b).length > 0;
}

/** Apply a bonus map onto a ratings object (clamped), returning a new object. */
export function addBonus(r: Ratings, bonus: Partial<Ratings> | undefined): Ratings {
  if (!bonus) return r;
  const out: Ratings = { ...r };
  for (const k of Object.keys(bonus) as (keyof Ratings)[]) {
    out[k] = Math.max(1, Math.min(99, out[k] + (bonus[k] ?? 0)));
  }
  return out;
}
