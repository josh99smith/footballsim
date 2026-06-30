import { describe, expect, it } from "vitest";
import { PlaySim, type PlaySetup } from "./engine";
import { getDefPlay, getOffPlay } from "./playbook";
import { RNG } from "./rng";
import { DEFAULT_TEAMS } from "./roster";
import { FIELD } from "./constants";

function makeSetup(seed: number, offId: string, defId: string, ballOn = 25): PlaySetup {
  const teams = DEFAULT_TEAMS(seed);
  return {
    offPlay: getOffPlay(offId),
    defPlay: getDefPlay(defId),
    offRoster: teams.home.offense,
    defRoster: teams.away.defense,
    ballY: FIELD.WIDTH / 2,
    yardsToGoal: 100 - ballOn,
    rng: new RNG(seed ^ 0x777),
  };
}

describe("PlaySim", () => {
  it("places exactly 22 agents (11 per side)", () => {
    const sim = new PlaySim(makeSetup(1, "inside-zone", "cover3-base"));
    expect(sim.agents).toHaveLength(22);
    expect(sim.agents.filter((a) => a.side === "off")).toHaveLength(11);
    expect(sim.agents.filter((a) => a.side === "def")).toHaveLength(11);
  });

  it("runs a play to completion with a valid end reason", () => {
    const sim = new PlaySim(makeSetup(2, "inside-zone", "cover3-base"));
    const result = sim.runToCompletion();
    expect(sim.done).toBe(true);
    expect(result.endReason).toBeDefined();
    expect(result.playTime).toBeGreaterThan(0);
  });

  it("is fully deterministic: same seed + same calls = identical result", () => {
    const a = new PlaySim(makeSetup(123, "quick-slants", "cover2-man")).runToCompletion();
    const b = new PlaySim(makeSetup(123, "quick-slants", "cover2-man")).runToCompletion();
    expect(a).toEqual(b);
  });

  it("different seeds can produce different results", () => {
    const results = new Set<string>();
    for (let s = 0; s < 12; s++) {
      const r = new PlaySim(makeSetup(s, "quick-slants", "cover3-base")).runToCompletion();
      results.add(`${r.endReason}:${r.yards}`);
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it("step() and runToCompletion() yield the same final state for a seed", () => {
    const stepped = new PlaySim(makeSetup(55, "power-sweep", "nickel-man"));
    while (!stepped.done) stepped.step();
    const instant = new PlaySim(makeSetup(55, "power-sweep", "nickel-man")).runToCompletion();
    expect(stepped.result).toEqual(instant);
  });

  it("pass plays are flagged as passes; run plays are not", () => {
    const pass = new PlaySim(makeSetup(9, "four-verticals", "cover3-base")).runToCompletion();
    expect(pass.isPass).toBe(true);
    const run = new PlaySim(makeSetup(9, "inside-zone", "cover3-base")).runToCompletion();
    expect(run.isPass).toBe(false);
  });

  it("never exceeds the field on a touchdown", () => {
    // Goal-to-go: yardsToGoal small so TDs are reachable.
    let sawTD = false;
    for (let s = 0; s < 40 && !sawTD; s++) {
      const r = new PlaySim(makeSetup(s, "inside-zone", "cover3-base", 98)).runToCompletion();
      if (r.touchdown) {
        sawTD = true;
        expect(r.yards).toBeLessThanOrEqual(2 + 0.01);
      }
    }
  });
});
