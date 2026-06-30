import { describe, expect, it } from "vitest";
import { GameFlow } from "./game";
import { RNG } from "./rng";
import { DEFAULT_TEAMS } from "./roster";

function newGame(seed: number): GameFlow {
  return new GameFlow(DEFAULT_TEAMS(seed), new RNG(seed));
}

describe("clock management", () => {
  it("kneel loses a yard, advances the down, and burns clock", () => {
    const g = newGame(1);
    g.possession = "home"; g.down = 1; g.distance = 10; g.ballOn = 40;
    const clock0 = g.clock;
    g.kneel();
    expect(g.down).toBe(2);
    expect(g.ballOn).toBe(39);
    expect(g.clock).toBeLessThan(clock0 - 30);
  });

  it("spike costs a down but stops the clock fast", () => {
    const g = newGame(1);
    g.possession = "home"; g.down = 2; g.distance = 7; g.ballOn = 40;
    const clock0 = g.clock;
    g.spike();
    expect(g.down).toBe(3);
    expect(clock0 - g.clock).toBeLessThan(6);
  });

  it("timeouts decrement and run out", () => {
    const g = newGame(1);
    expect(g.timeouts.home).toBe(3);
    expect(g.useTimeout("home")).toBe(true);
    expect(g.timeouts.home).toBe(2);
    g.useTimeout("home"); g.useTimeout("home");
    expect(g.useTimeout("home")).toBe(false);
    expect(g.timeouts.home).toBe(0);
  });
});

describe("conversions", () => {
  it("two-point conversion can add 2 and hands off via kickoff", () => {
    const g = newGame(1);
    g.possession = "home"; g.ballOn = 98;
    g.commitPlayResult({
      yards: 5, endReason: "touchdown", playTime: 4, turnover: false,
      touchdown: true, isPass: false,
    });
    expect(g.pendingConversion).toBe("home");
    const before = g.score.home;
    const out = g.resolveConversion("two");
    expect(g.pendingConversion).toBeNull();
    expect(g.possession).toBe("away");
    // Either it scored 2 or missed; never anything else.
    expect([before, before + 2]).toContain(g.score.home);
    if (out.isScore) expect(out.isScore.type).toBe("TWO");
  });
});
