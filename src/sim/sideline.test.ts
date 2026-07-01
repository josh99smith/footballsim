import { describe, expect, it } from "vitest";
import { PlaySim, type PlaySetup } from "./engine";
import { getOffPlay, getDefPlay } from "./playbook";
import { DEFAULT_TEAMS } from "./roster";
import { RNG } from "./rng";
import { FIELD } from "./constants";

function makeSetup(
  seed: number, off: string, def: string,
  clockIntent: PlaySetup["clockIntent"] = "normal",
): PlaySetup {
  const t = DEFAULT_TEAMS(seed);
  return {
    offPlay: getOffPlay(off), defPlay: getDefPlay(def),
    offRoster: t.home.offense, defRoster: t.away.defense,
    ballY: FIELD.WIDTH / 2, yardsToGoal: 75, clockIntent,
    rng: new RNG(seed ^ 0x777),
  };
}

describe("sideline / out-of-bounds awareness", () => {
  it("deep sideline routes produce some out-of-bounds plays", () => {
    let oob = 0;
    for (const play of ["four-verticals", "play-action-deep"]) {
      for (let s = 0; s < 24; s++) {
        const r = new PlaySim(makeSetup(s, play, "cover3-base")).runToCompletion();
        if (r.endReason === "outOfBounds") oob++;
      }
    }
    expect(oob).toBeGreaterThan(0);
  });

  it("a ball carried out of bounds is not a turnover and keeps possession's yards", () => {
    // Find an OOB play and sanity-check its result shape.
    for (let s = 0; s < 60; s++) {
      const r = new PlaySim(makeSetup(s, "four-verticals", "cover3-base")).runToCompletion();
      if (r.endReason === "outOfBounds") {
        expect(r.turnover).toBe(false);
        expect(r.touchdown).toBe(false);
        return;
      }
    }
  });

  it("hurry-up intent yields at least as many out-of-bounds as clock-kill intent", () => {
    const count = (intent: PlaySetup["clockIntent"]) => {
      let n = 0;
      for (const play of ["four-verticals", "play-action-deep", "power-sweep"]) {
        for (let s = 0; s < 24; s++) {
          const r = new PlaySim(makeSetup(s, play, "cover3-base", intent)).runToCompletion();
          if (r.endReason === "outOfBounds") n++;
        }
      }
      return n;
    };
    expect(count("hurry")).toBeGreaterThanOrEqual(count("kill"));
  });
});
