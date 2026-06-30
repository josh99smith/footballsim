import { RNG } from "./rng";
import type { PlayerDef, Position, Ratings, TeamId } from "./types";

/** Baseline rating profile per position. The generator jitters around these. */
const PROFILES: Record<Position, Partial<Ratings> & { base: number }> = {
  QB: { base: 75, awareness: 82, agility: 68, strength: 62 },
  RB: { base: 78, speed: 85, agility: 84, strength: 70, catching: 62 },
  WR: { base: 78, speed: 88, agility: 84, catching: 84, strength: 55 },
  TE: { base: 74, speed: 70, catching: 74, blocking: 70, strength: 72 },
  OL: { base: 74, blocking: 84, strength: 84, speed: 48, agility: 50 },
  DL: { base: 76, strength: 84, tackling: 78, speed: 64 },
  LB: { base: 77, tackling: 82, speed: 76, strength: 76, awareness: 76 },
  CB: { base: 78, speed: 88, agility: 85, awareness: 76, tackling: 64 },
  S: { base: 77, speed: 82, tackling: 78, awareness: 80 },
};

const FIRST = [
  "Jake", "Marcus", "Tyler", "Deon", "Chris", "Andre", "Cole", "Malik",
  "Brett", "Xavier", "Logan", "Dante", "Riley", "Trey", "Owen", "Jaylen",
  "Eli", "Marcus", "Quinn", "Vince", "Hank", "Nate", "Sean", "Ray",
];
const LAST = [
  "Carter", "Brooks", "Mason", "Reed", "Hayes", "Ford", "Stone", "Boone",
  "Vance", "Cross", "Pierce", "Wells", "Dunn", "Kane", "Frost", "Lane",
  "Beck", "Nash", "Rhodes", "Tate", "Fox", "Cole", "Day", "Knox",
];

function makeRatings(rng: RNG, pos: Position): Ratings {
  const p = PROFILES[pos];
  const def = (key: keyof Ratings): number => {
    const target = (p[key] as number | undefined) ?? p.base;
    return Math.round(Math.max(35, Math.min(99, target + rng.gaussian() * 7)));
  };
  return {
    speed: def("speed"),
    strength: def("strength"),
    agility: def("agility"),
    awareness: def("awareness"),
    catching: def("catching"),
    tackling: def("tackling"),
    blocking: def("blocking"),
  };
}

/** Starting-22 position template (offense + defense). */
const OFFENSE: Position[] = [
  "QB", "RB", "WR", "WR", "WR", "TE", "OL", "OL", "OL", "OL", "OL",
];
const DEFENSE: Position[] = [
  "DL", "DL", "DL", "DL", "LB", "LB", "LB", "CB", "CB", "S", "S",
];

export interface Team {
  id: TeamId;
  name: string;
  abbr: string;
  color: string;
  offense: PlayerDef[];
  defense: PlayerDef[];
}

function buildUnit(rng: RNG, positions: Position[], prefix: string): PlayerDef[] {
  const used = new Set<number>();
  return positions.map((pos, i) => {
    let number = rng.int(1, 99);
    while (used.has(number)) number = rng.int(1, 99);
    used.add(number);
    return {
      id: `${prefix}-${i}`,
      number,
      name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
      pos,
      ratings: makeRatings(rng, pos),
    };
  });
}

export function generateTeam(
  id: TeamId,
  name: string,
  abbr: string,
  color: string,
  seed: number,
): Team {
  const rng = new RNG(seed);
  return {
    id,
    name,
    abbr,
    color,
    offense: buildUnit(rng, OFFENSE, `${id}-o`),
    defense: buildUnit(rng, DEFENSE, `${id}-d`),
  };
}

export const DEFAULT_TEAMS = (seed: number): { home: Team; away: Team } => ({
  home: generateTeam("home", "Riverside Surge", "RIV", "#2e6fdb", seed ^ 0x1111),
  away: generateTeam("away", "Granite City Wolves", "GCW", "#d94a3d", seed ^ 0x2222),
});
