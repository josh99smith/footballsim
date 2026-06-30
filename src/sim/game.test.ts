import { describe, expect, it } from "vitest";
import { GameFlow } from "./game";
import { RNG } from "./rng";
import { DEFAULT_TEAMS } from "./roster";
import type { PlayResult } from "./types";

function newGame(seed: number): GameFlow {
  return new GameFlow(DEFAULT_TEAMS(seed), new RNG(seed));
}

const runResult = (yards: number, extra: Partial<PlayResult> = {}): PlayResult => ({
  yards,
  endReason: "tackle",
  playTime: 4,
  turnover: false,
  touchdown: false,
  isPass: false,
  ...extra,
});

describe("GameFlow", () => {
  it("awards a first down and resets the chains on a 10+ yard gain", () => {
    const g = newGame(1);
    g.down = 1; g.distance = 10; g.ballOn = 30;
    const out = g.commitPlayResult(runResult(12));
    expect(out.firstDown).toBe(true);
    expect(g.down).toBe(1);
    expect(g.distance).toBe(10);
    expect(g.ballOn).toBe(42);
  });

  it("advances the down and reduces distance on a short gain", () => {
    const g = newGame(1);
    g.down = 1; g.distance = 10; g.ballOn = 30;
    g.commitPlayResult(runResult(3));
    expect(g.down).toBe(2);
    expect(g.distance).toBe(7);
    expect(g.ballOn).toBe(33);
  });

  it("turns the ball over on downs after a failed 4th down", () => {
    const g = newGame(1);
    g.possession = "home"; g.down = 4; g.distance = 5; g.ballOn = 40;
    const out = g.commitPlayResult(runResult(2));
    expect(out.changedPossession).toBe(true);
    expect(g.possession).toBe("away");
    // Away takes over at the flipped spot.
    expect(g.ballOn).toBe(58);
  });

  it("scores a touchdown, defers the conversion, then kicks off", () => {
    const g = newGame(1);
    g.possession = "home"; g.down = 1; g.distance = 10; g.ballOn = 95;
    const out = g.commitPlayResult(runResult(8, { touchdown: true }));
    expect(out.isScore?.type).toBe("TD");
    expect(g.score.home).toBe(6); // 6 now; the point(s) come from the conversion
    expect(g.pendingConversion).toBe("home");
    expect(g.possession).toBe("home"); // unchanged until the try resolves
    g.resolveConversion("xp");
    expect(g.pendingConversion).toBeNull();
    expect(g.possession).toBe("away"); // kickoff after the conversion
    expect(g.score.home).toBeGreaterThanOrEqual(6);
  });

  it("handles an interception as a change of possession", () => {
    const g = newGame(1);
    g.possession = "home"; g.ballOn = 40;
    const out = g.commitPlayResult(
      runResult(0, { endReason: "interception", turnover: true, isPass: true, passResult: "intercepted" }),
    );
    expect(out.changedPossession).toBe(true);
    expect(g.possession).toBe("away");
  });

  it("runs the game clock and ends after four quarters", () => {
    const g = newGame(1);
    let guard = 0;
    while (!g.gameOver && guard < 5000) {
      g.commitPlayResult(runResult(4));
      guard++;
    }
    expect(g.gameOver).toBe(true);
    expect(g.quarter).toBeGreaterThanOrEqual(4);
  });
});
