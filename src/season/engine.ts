import { RNG } from "../sim/rng";
import { generateTeam, hashStr, type Team } from "../sim/roster";
import { overall, NEUTRAL_GAMEPLAN } from "../sim/gameplan";
import { teamsForLeague } from "../sim/teams";
import type { League } from "../sim/rules";
import type { Position, Ratings } from "../sim/types";
import type {
  GameResult, Matchup, PlayerMeta, ProgressEntry, SeasonState, SeasonTeam, StandingRow,
} from "./types";

export const LEAGUE_SIZE = 8;
const PEAK_AGE = 27;

// ---- construction -----------------------------------------------------------

function playerOvr(pl: Team["offense"][number]): number {
  return overall(pl.ratings, pl.pos as Position);
}

/** Roster-wide mean OVR (current ratings). */
export function teamOvr(t: SeasonTeam): number {
  const all = [...t.roster.offense, ...t.roster.defense];
  return Math.round(all.reduce((s, p) => s + playerOvr(p), 0) / all.length);
}

/** Assign age + potential to each player deterministically from its id. */
function buildMeta(roster: Team, seed: number): Record<string, PlayerMeta> {
  const meta: Record<string, PlayerMeta> = {};
  for (const pl of [...roster.offense, ...roster.defense]) {
    const rng = new RNG((seed ^ hashStr(pl.id)) >>> 0);
    // Ages skew toward mid-career; a few rookies and a few grizzled vets.
    const age = Math.round(22 + Math.abs(rng.gaussian()) * 5.5);
    const ovr = playerOvr(pl);
    // Younger players carry more untapped upside.
    const youth = Math.max(0, PEAK_AGE - age);
    const potential = Math.min(99, Math.round(ovr + youth * 0.8 + rng.range(0, 8)));
    meta[pl.id] = { age: Math.min(age, 38), potential: Math.max(potential, ovr) };
  }
  return meta;
}

/** Round-robin schedule via the circle method (N even). N-1 weeks. */
function roundRobin(n: number, rng: RNG): Matchup[][] {
  const ids = Array.from({ length: n }, (_, i) => i);
  // Light shuffle so the slate differs per season.
  for (let i = ids.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const weeks: Matchup[][] = [];
  const arr = [...ids];
  for (let w = 0; w < n - 1; w++) {
    const week: Matchup[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      // Alternate home/away by week for a touch of fairness.
      week.push(w % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
    }
    weeks.push(week);
    // Rotate all but the first.
    arr.splice(1, 0, arr.pop()!);
  }
  return weeks;
}

/** Create a fresh season: pick a slate of teams, generate rosters + schedule. */
export function createSeason(league: League, userTeamKey: string, seed: number): SeasonState {
  const rng = new RNG((seed ^ 0x5ea50) >>> 0);
  const library = teamsForLeague(league);
  const userLib = library.find((t) => t.id === userTeamKey) ?? library[0];
  // The user's team is always in; fill the rest with a spread of opponents.
  const others = library.filter((t) => t.id !== userLib.id);
  for (let i = others.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [others[i], others[j]] = [others[j], others[i]];
  }
  const chosen = [userLib, ...others.slice(0, LEAGUE_SIZE - 1)];

  const teams: SeasonTeam[] = chosen.map((lib) => {
    const teamSeed = (seed ^ hashStr(`${lib.abbr}:${lib.name}`)) >>> 0;
    const roster = generateTeam(lib.id, lib.name, lib.abbr, lib.color, teamSeed, lib.strength);
    return {
      key: lib.id, name: lib.name, abbr: lib.abbr, color: lib.color,
      strength: lib.strength, roster, meta: buildMeta(roster, teamSeed),
    };
  });

  const userTeam = 0; // user is always index 0 by construction
  const schedule = roundRobin(LEAGUE_SIZE, rng);

  return {
    league, seed: seed >>> 0, year: 1, week: 0, userTeam, teams,
    schedule, results: schedule.map(() => []), phase: "regular",
    userGameplan: { ...NEUTRAL_GAMEPLAN }, lastReport: [], championKey: null,
  };
}

// ---- standings --------------------------------------------------------------

export function standings(s: SeasonState): StandingRow[] {
  const rows: StandingRow[] = s.teams.map((t, idx) => ({
    idx, key: t.key, name: t.name, abbr: t.abbr, color: t.color,
    ovr: teamOvr(t), w: 0, l: 0, pf: 0, pa: 0, diff: 0,
  }));
  for (const week of s.results) {
    for (const g of week) {
      if (!g.played) continue;
      const h = rows[g.home], a = rows[g.away];
      h.pf += g.homeScore; h.pa += g.awayScore;
      a.pf += g.awayScore; a.pa += g.homeScore;
      if (g.homeScore >= g.awayScore) { h.w++; a.l++; } else { a.w++; h.l++; }
    }
  }
  for (const r of rows) r.diff = r.pf - r.pa;
  return rows.sort((x, y) => y.w - x.w || y.diff - x.diff || y.pf - x.pf);
}

// ---- quick-sim for un-coached games ----------------------------------------

/** Deterministic plausible score between two teams (no full engine). */
export function quickSim(home: SeasonTeam, away: SeasonTeam, seed: number): { homeScore: number; awayScore: number } {
  const rng = new RNG(seed >>> 0);
  const d = teamOvr(home) - teamOvr(away);
  const margin = d * 0.8 + 2 /* home edge */ + rng.gaussian() * 9;
  const base = 20 + rng.gaussian() * 4;
  const clampPts = (v: number) => Math.max(0, Math.min(59, Math.round(v)));
  let homeScore = clampPts(base + margin / 2 + rng.gaussian() * 5);
  let awayScore = clampPts(base - margin / 2 + rng.gaussian() * 5);
  if (homeScore === awayScore) {
    // Break ties toward the stronger side (no ties in quick-sim).
    if (margin >= 0) homeScore += 3; else awayScore += 3;
  }
  return { homeScore, awayScore };
}

function matchupSeed(s: SeasonState, week: number, m: Matchup): number {
  return (s.seed ^ (s.year * 486187) ^ (week * 2654435) ^ (m.home * 40507) ^ (m.away * 97)) >>> 0;
}

// ---- playing a week ---------------------------------------------------------

/** The user's matchup for a given regular-season week (or null if none). */
export function userMatchup(s: SeasonState, week: number): Matchup | null {
  const wk = s.schedule[week];
  if (!wk) return null;
  return wk.find((m) => m.home === s.userTeam || m.away === s.userTeam) ?? null;
}

/**
 * Record the user's game result, quick-sim the rest of the week, and advance.
 * Returns the next state. The caller supplies the final home/away score.
 */
export function commitWeek(s: SeasonState, userHomeScore: number, userAwayScore: number): SeasonState {
  const week = s.week;
  const wk = s.schedule[week];
  if (!wk) return s;
  const um = userMatchup(s, week);
  const games: GameResult[] = wk.map((m) => {
    if (um && m.home === um.home && m.away === um.away) {
      return { ...m, homeScore: userHomeScore, awayScore: userAwayScore, played: true, user: true };
    }
    const sc = quickSim(s.teams[m.home], s.teams[m.away], matchupSeed(s, week, m));
    return { ...m, homeScore: sc.homeScore, awayScore: sc.awayScore, played: true };
  });
  const results = s.results.map((r, i) => (i === week ? games : r));
  const nextWeek = week + 1;
  const enteringPlayoffs = nextWeek >= s.schedule.length;
  return {
    ...s,
    results,
    week: nextWeek,
    phase: enteringPlayoffs ? "championship" : "regular",
  };
}

// ---- championship -----------------------------------------------------------

/** The two title-game seeds (top two by standings). */
export function championshipSeeds(s: SeasonState): [StandingRow, StandingRow] {
  const table = standings(s);
  return [table[0], table[1]];
}

/** Whether the user reached the championship game. */
export function userInChampionship(s: SeasonState): boolean {
  return championshipSeeds(s).some((r) => r.idx === s.userTeam);
}

/** Resolve the championship. If the user isn't in it, quick-sim it. If they
 *  are, the caller passes their final score (userScore, oppScore). */
export function commitChampionship(
  s: SeasonState,
  userScore?: number,
  oppScore?: number,
): SeasonState {
  const [top, second] = championshipSeeds(s);
  const home = s.teams[top.idx], away = s.teams[second.idx];
  let homeScore: number, awayScore: number;
  if (userInChampionship(s) && userScore != null && oppScore != null) {
    const userIsTop = top.idx === s.userTeam;
    homeScore = userIsTop ? userScore : oppScore;
    awayScore = userIsTop ? oppScore : userScore;
  } else {
    const sc = quickSim(home, away, matchupSeed(s, 999, { home: top.idx, away: second.idx }));
    homeScore = sc.homeScore; awayScore = sc.awayScore;
  }
  if (homeScore === awayScore) homeScore += 3;
  const championKey = homeScore > awayScore ? home.key : away.key;
  return { ...s, phase: "offseason", championKey };
}

// ---- progression / regression ----------------------------------------------

const PHYSICAL: (keyof Ratings)[] = ["speed", "agility"];
const MENTAL: (keyof Ratings)[] = ["awareness"];

const FIRST = ["Jake", "Marcus", "Tyler", "Deon", "Cole", "Malik", "Xavier", "Dante", "Trey", "Jaylen", "Quinn", "Nate"];
const LAST = ["Carter", "Brooks", "Mason", "Reed", "Hayes", "Stone", "Vance", "Pierce", "Kane", "Frost", "Rhodes", "Knox"];

const clampR = (v: number) => Math.max(35, Math.min(99, Math.round(v)));

/** Develop or regress one player for the offseason. Mutates in place. */
function progressPlayer(
  pl: Team["offense"][number],
  meta: PlayerMeta,
  winPct: number,
  rng: RNG,
): { oldOvr: number; newOvr: number; retired: boolean } {
  const oldOvr = playerOvr(pl);
  const age = meta.age;
  const room = meta.potential - oldOvr; // headroom toward ceiling

  // Base drift by career stage.
  let base: number;
  if (age <= 24) base = 2.4 + rng.range(0, 2.2);
  else if (age <= PEAK_AGE) base = 0.8 + rng.range(0, 1.6);
  else if (age <= 29) base = rng.range(-0.6, 1.0);
  else if (age <= 32) base = -1.6 + rng.range(-1.2, 0.6);
  else base = -3.4 + rng.range(-2.4, 0.6);

  // Young players only climb as far as their potential allows.
  if (base > 0) base = Math.min(base, Math.max(0, room) * 0.6 + 0.4);
  // Success accelerates growth / softens decline.
  base += (winPct - 0.5) * 1.6;

  for (const k of Object.keys(pl.ratings) as (keyof Ratings)[]) {
    let d = base;
    if (base < 0) {
      // Decline hits legs hardest, wisdom least.
      if (PHYSICAL.includes(k)) d *= 1.5;
      else if (MENTAL.includes(k)) d *= 0.35;
    } else {
      // Growth favours craft (awareness/catching/tackling/blocking) over raw speed.
      if (PHYSICAL.includes(k)) d *= 0.6;
      else if (MENTAL.includes(k)) d *= 1.3;
    }
    pl.ratings[k] = clampR(pl.ratings[k] + d + rng.gaussian() * 0.6);
  }

  meta.age = age + 1;
  const retired = meta.age > 34 && rng.chance(0.35 + (meta.age - 34) * 0.2);
  return { oldOvr, newOvr: playerOvr(pl), retired };
}

/** Replace a retiree with a rookie at the same position/slot. */
function makeRookie(pl: Team["offense"][number], seed: number): PlayerMeta {
  const rng = new RNG(seed >>> 0);
  const target = 58 + rng.range(0, 14);
  for (const k of Object.keys(pl.ratings) as (keyof Ratings)[]) {
    pl.ratings[k] = clampR(target + rng.gaussian() * 7);
  }
  pl.name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
  const age = 21 + rng.int(0, 2);
  const potential = Math.min(99, Math.round(playerOvr(pl) + rng.range(6, 22)));
  return { age, potential };
}

/** Apply the offseason to every team and return {state, report}. */
export function applyOffseason(s: SeasonState): SeasonState {
  const table = standings(s);
  const winPctByIdx = new Map<number, number>();
  for (const r of table) {
    const gp = r.w + r.l;
    winPctByIdx.set(r.idx, gp > 0 ? r.w / gp : 0.5);
  }

  const report: ProgressEntry[] = [];
  const teams = s.teams.map((t, idx) => {
    const winPct = winPctByIdx.get(idx) ?? 0.5;
    const roster: Team = {
      ...t.roster,
      offense: t.roster.offense.map((p) => ({ ...p, ratings: { ...p.ratings } })),
      defense: t.roster.defense.map((p) => ({ ...p, ratings: { ...p.ratings } })),
    };
    const meta: Record<string, PlayerMeta> = {};
    for (const pl of [...roster.offense, ...roster.defense]) {
      const m: PlayerMeta = { ...(t.meta[pl.id] ?? { age: 25, potential: playerOvr(pl) }) };
      const rng = new RNG((s.seed ^ hashStr(pl.id) ^ (s.year * 7919)) >>> 0);
      const vetName = pl.name;
      const { oldOvr, retired } = progressPlayer(pl, m, winPct, rng);
      let rookie = false;
      let replacedName: string | undefined;
      let newOvr = playerOvr(pl);
      let age = m.age;
      if (retired) {
        const rk = makeRookie(pl, (s.seed ^ hashStr(pl.id) ^ 0x0f00d1e ^ (s.year * 131)) >>> 0);
        meta[pl.id] = rk;
        newOvr = playerOvr(pl);
        age = rk.age;
        rookie = true;
        replacedName = vetName;
      } else {
        meta[pl.id] = m;
      }
      // Only report the user team's notable moves (risers/fallers/turnover).
      if (idx === s.userTeam) {
        report.push({
          key: t.key, playerId: pl.id, name: pl.name, pos: pl.pos, number: pl.number,
          oldOvr, newOvr, age, retired, rookie, replacedName,
        });
      }
    }
    return { ...t, roster, meta };
  });

  return { ...s, teams, lastReport: report };
}

/** Begin the next season: rebuild the schedule, reset records, bump the year. */
export function startNextSeason(s: SeasonState): SeasonState {
  const rng = new RNG((s.seed ^ (s.year * 2246822519)) >>> 0);
  const schedule = roundRobin(LEAGUE_SIZE, rng);
  return {
    ...s,
    year: s.year + 1,
    week: 0,
    schedule,
    results: schedule.map(() => []),
    phase: "regular",
    lastReport: [],
    championKey: null,
  };
}
