import { describe, expect, it } from "vitest";
import { GameFlow, type GameConfig } from "./game";
import { RNG } from "./rng";
import { DEFAULT_TEAMS } from "./roster";
import { pickOffense, pickDefense, fourthDownDecision, DEFAULT_PHILOSOPHY } from "./coordinator";
import type { League } from "./rules";

/** Play a full game (flow + coordinator) and return the final flow. */
function playFullGame(seed: number, league: League): GameFlow {
  const cfg: GameConfig = { quarterSeconds: 90, league };
  const flow = new GameFlow(DEFAULT_TEAMS(seed), new RNG(seed), cfg);
  const phi = DEFAULT_PHILOSOPHY;
  let guard = 0;
  while (!flow.gameOver && guard++ < 4000) {
    if (flow.pendingConversion) { flow.resolveConversion(flow.rng.chance(0.9) ? "xp" : "two"); continue; }
    const info = flow.info();
    if (info.down === 4 && info.overtime === 0) {
      const d = fourthDownDecision(info, phi, flow.rng);
      if (d === "punt") { flow.punt(); continue; }
      if (d === "fieldGoal") { flow.fieldGoalAttempt(); continue; }
    } else if (info.down === 4) {
      // In OT, kick from field-goal range rather than punt.
      if (info.ballOn >= 60 && flow.rng.chance(0.5)) { flow.fieldGoalAttempt(); continue; }
    }
    const sim = flow.createSnap(pickOffense(info, phi, flow.rng), pickDefense(info, phi, flow.rng));
    flow.commitPlayResult(sim.runToCompletion());
  }
  return flow;
}

describe("overtime", () => {
  it("college games always terminate with a winner (never a tie)", () => {
    for (let s = 0; s < 60; s++) {
      const flow = playFullGame(s, "college");
      expect(flow.gameOver).toBe(true);
      expect(flow.score.home).not.toBe(flow.score.away); // college has no ties
    }
  });

  it("pro games always terminate", () => {
    for (let s = 0; s < 60; s++) {
      const flow = playFullGame(s, "pro");
      expect(flow.gameOver).toBe(true);
    }
  });

  it("at least one college game reaches overtime in a batch", () => {
    let sawOT = false;
    for (let s = 0; s < 120 && !sawOT; s++) {
      if (playFullGame(s, "college").overtime > 0) sawOT = true;
    }
    expect(sawOT).toBe(true);
  });

  it("is deterministic for a seed + league", () => {
    const a = playFullGame(11, "college");
    const b = playFullGame(11, "college");
    expect(a.score).toEqual(b.score);
    expect(a.overtime).toBe(b.overtime);
  });
});
