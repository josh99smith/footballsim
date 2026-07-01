import { describe, expect, it } from "vitest";
import { pickOffense, teamTendency, type Tendency } from "./coordinator";
import { DEFAULT_PHILOSOPHY } from "./coordinator";
import { generateTeam } from "./roster";
import { getOffPlay } from "./playbook";
import { RNG } from "./rng";
import type { GameInfo } from "./game";

const baseInfo = (over: Partial<GameInfo> = {}): GameInfo => ({
  quarter: 1, clock: 600, possession: "home",
  down: 1, distance: 10, ballOn: 25, score: { home: 0, away: 0 },
  gameOver: false, timeouts: { home: 3, away: 3 }, pendingConversion: null,
  league: "pro", overtime: 0, ...over,
});

/** Count run vs pass over many calls for a fixed situation + tendency. */
function passRate(info: GameInfo, tnd: Tendency, seed = 1): number {
  const rng = new RNG(seed);
  let pass = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const id = pickOffense(info, DEFAULT_PHILOSOPHY, rng, 0, undefined, tnd);
    if (getOffPlay(id).type === "pass") pass++;
  }
  return pass / N;
}

const RUN_TEAM: Tendency = { passLean: -0.8, passStrength: 68, runStrength: 88, protection: 88 };
const PASS_TEAM: Tendency = { passLean: 0.8, passStrength: 90, runStrength: 66, protection: 66 };

describe("play-calling tendencies", () => {
  it("pass-first rosters throw more than run-first rosters in the same spot", () => {
    const info = baseInfo({ down: 1, distance: 10 });
    expect(passRate(info, PASS_TEAM)).toBeGreaterThan(passRate(info, RUN_TEAM) + 0.03);
  });

  it("teamTendency reads a stacked backfield as run-leaning", () => {
    // A strong-strength team still splits, but the derived lean is a number in range.
    const t = generateTeam("home", "T", "T", "#fff", 42, 80);
    const tnd = teamTendency(t);
    expect(tnd.passLean).toBeGreaterThanOrEqual(-1);
    expect(tnd.passLean).toBeLessThanOrEqual(1);
    expect(tnd.runStrength).toBeGreaterThan(40);
    expect(tnd.passStrength).toBeGreaterThan(40);
  });

  it("never dials up play-action on 3rd-and-long (the fake isn't believable)", () => {
    const info = baseInfo({ down: 3, distance: 15 });
    const rng = new RNG(7);
    let pa = 0;
    for (let i = 0; i < 3000; i++) {
      if (pickOffense(info, DEFAULT_PHILOSOPHY, rng, 0, undefined, PASS_TEAM) === "play-action-deep") pa++;
    }
    // A tiny residual weight is allowed, but it should be vanishingly rare.
    expect(pa / 3000).toBeLessThan(0.02);
  });

  it("leans run on short yardage regardless of roster", () => {
    const info = baseInfo({ down: 3, distance: 1 });
    expect(passRate(info, PASS_TEAM)).toBeLessThan(0.5);
  });
});
