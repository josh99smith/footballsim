import { applyGameplan, overall, type Gameplan } from "./gameplan";
import type { Ratings } from "./types";
import type { Team } from "./roster";

/** One player's base vs game-plan-adjusted ratings, for the scouting overlay. */
export interface PlayerView {
  id: string;
  number: number;
  name: string;
  pos: string;
  base: Ratings;
  effective: Ratings;
  baseOvr: number;
  ovr: number;
}

export interface TeamRosterView {
  name: string;
  abbr: string;
  color: string;
  offense: PlayerView[];
  defense: PlayerView[];
  /** Roster-wide overall (mean of effective OVRs). */
  ovr: number;
}

export interface RostersView {
  home: TeamRosterView;
  away: TeamRosterView;
}

function playerView(pl: Team["offense"][number], plan: Gameplan): PlayerView {
  const effective = applyGameplan(pl.ratings, pl.pos, plan);
  return {
    id: pl.id,
    number: pl.number,
    name: pl.name,
    pos: pl.pos,
    base: pl.ratings,
    effective,
    baseOvr: overall(pl.ratings, pl.pos),
    ovr: overall(effective, pl.pos),
  };
}

/** Build a scouting view of one team under a given game plan. */
export function teamRosterView(team: Team, plan: Gameplan): TeamRosterView {
  const offense = team.offense.map((pl) => playerView(pl, plan));
  const defense = team.defense.map((pl) => playerView(pl, plan));
  const all = [...offense, ...defense];
  const ovr = Math.round(all.reduce((s, p) => s + p.ovr, 0) / all.length);
  return { name: team.name, abbr: team.abbr, color: team.color, offense, defense, ovr };
}
