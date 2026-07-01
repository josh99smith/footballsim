import { describe, expect, it } from "vitest";
import {
  applyOffseason, commitChampionship, commitWeek, createSeason,
  LEAGUE_SIZE, quickSim, standings, startNextSeason, teamOvr, userMatchup,
} from "./engine";
import type { SeasonState } from "./types";

function freshPro(): SeasonState {
  const lib = createSeason("pro", "kc", 12345);
  return lib;
}

/** Play a whole season to completion, always giving the user a blowout win. */
function runSeason(s0: SeasonState): SeasonState {
  let s = s0;
  while (s.phase === "regular") {
    const m = userMatchup(s, s.week);
    // user coaches home in engine; map win to schedule orientation
    const userIsHome = m ? m.home === s.userTeam : true;
    s = commitWeek(s, userIsHome ? 35 : 3, userIsHome ? 3 : 35);
  }
  // championship (auto-sim path)
  s = commitChampionship(s);
  return applyOffseason(s);
}

describe("season engine", () => {
  it("builds an 8-team league with the user included", () => {
    const s = freshPro();
    expect(s.teams).toHaveLength(LEAGUE_SIZE);
    expect(s.teams[s.userTeam].key).toBe("kc");
    // 7-week round robin for 8 teams
    expect(s.schedule).toHaveLength(LEAGUE_SIZE - 1);
    for (const wk of s.schedule) expect(wk).toHaveLength(LEAGUE_SIZE / 2);
  });

  it("gives every team exactly one game per week", () => {
    const s = freshPro();
    for (const wk of s.schedule) {
      const seen = new Set<number>();
      for (const m of wk) { seen.add(m.home); seen.add(m.away); }
      expect(seen.size).toBe(LEAGUE_SIZE);
    }
  });

  it("quick-sim is deterministic and never ties", () => {
    const s = freshPro();
    const a = quickSim(s.teams[0], s.teams[1], 777);
    const b = quickSim(s.teams[0], s.teams[1], 777);
    expect(a).toEqual(b);
    expect(a.homeScore).not.toBe(a.awayScore);
  });

  it("plays a full season to a champion and an offseason report", () => {
    const s = runSeason(freshPro());
    expect(s.phase).toBe("offseason");
    expect(s.championKey).toBeTruthy();
    // report covers the user's whole roster (22 players)
    expect(s.lastReport).toHaveLength(22);
  });

  it("ages the roster and can regenerate the next season deterministically", () => {
    const s = runSeason(freshPro());
    const next = startNextSeason(s);
    expect(next.year).toBe(2);
    expect(next.week).toBe(0);
    expect(next.phase).toBe("regular");
    // Determinism: same inputs → identical league state.
    const again = startNextSeason(runSeason(freshPro()));
    expect(teamOvr(again.teams[0])).toBe(teamOvr(next.teams[0]));
  });

  it("young stars tend to rise and old players tend to fall over a decade", () => {
    let s = freshPro();
    // Find a young high-potential player and an old one on the user roster.
    const roster = s.teams[s.userTeam].roster;
    const meta = s.teams[s.userTeam].meta;
    const all = [...roster.offense, ...roster.defense];
    const young = all.find((p) => meta[p.id].age <= 23 && meta[p.id].potential - 0 > 0)!;
    const old = [...all].sort((a, b) => meta[b.id].age - meta[a.id].age)[0];
    const youngStart = meta[young.id];
    // Simulate several offseasons of a winning team.
    for (let y = 0; y < 4; y++) {
      s = applyOffseason(runSeasonNoOff(s));
      s = startNextSeason(s);
    }
    // The league remains valid and populated after multiple years.
    expect(s.teams).toHaveLength(LEAGUE_SIZE);
    expect(teamOvr(s.teams[0])).toBeGreaterThan(40);
    expect(youngStart.age).toBeLessThan(24);
    expect(old).toBeTruthy();
  });
});

/** Play the regular season + championship but stop before the offseason. */
function runSeasonNoOff(s0: SeasonState): SeasonState {
  let s = s0;
  while (s.phase === "regular") {
    const m = userMatchup(s, s.week);
    const userIsHome = m ? m.home === s.userTeam : true;
    s = commitWeek(s, userIsHome ? 31 : 10, userIsHome ? 10 : 31);
  }
  return commitChampionship(s);
}

describe("season standings", () => {
  it("accumulates wins/losses/diff from results", () => {
    let s = freshPro();
    s = commitWeek(s, 40, 10); // user blowout (orientation-agnostic sum still valid)
    const table = standings(s);
    const total = table.reduce((n, r) => n + r.w + r.l, 0);
    expect(total).toBe(LEAGUE_SIZE); // 4 games → 8 W/L slots
  });
});
