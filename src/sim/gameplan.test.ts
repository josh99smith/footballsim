import { describe, expect, it } from "vitest";
import { applyGameplan, deriveAiGameplan, NEUTRAL_GAMEPLAN, type Gameplan } from "./gameplan";
import type { Ratings } from "./types";

const R: Ratings = {
  speed: 70, strength: 70, agility: 70, awareness: 70,
  catching: 70, tackling: 70, blocking: 70,
};

describe("applyGameplan", () => {
  it("is the identity for a neutral plan", () => {
    for (const pos of ["QB", "RB", "WR", "OL", "DL", "CB", "S", "LB", "TE"] as const) {
      expect(applyGameplan(R, pos, NEUTRAL_GAMEPLAN)).toEqual(R);
    }
  });

  it("air emphasis boosts receiving and takes from the run game", () => {
    const air: Gameplan = { ...NEUTRAL_GAMEPLAN, air: 1 };
    expect(applyGameplan(R, "WR", air).catching).toBeGreaterThan(R.catching);
    expect(applyGameplan(R, "OL", air).blocking).toBeLessThan(R.blocking);
    expect(applyGameplan(R, "RB", air).speed).toBeLessThan(R.speed);
  });

  it("ground emphasis is the mirror of air", () => {
    const ground: Gameplan = { ...NEUTRAL_GAMEPLAN, air: -1 };
    expect(applyGameplan(R, "WR", ground).catching).toBeLessThan(R.catching);
    expect(applyGameplan(R, "OL", ground).blocking).toBeGreaterThan(R.blocking);
    expect(applyGameplan(R, "RB", ground).speed).toBeGreaterThan(R.speed);
  });

  it("coverage focus boosts DBs while taking from run defense", () => {
    const cover: Gameplan = { ...NEUTRAL_GAMEPLAN, coverage: 1 };
    expect(applyGameplan(R, "CB", cover).speed).toBeGreaterThan(R.speed);
    expect(applyGameplan(R, "CB", cover).awareness).toBeGreaterThan(R.awareness);
    expect(applyGameplan(R, "DL", cover).tackling).toBeLessThan(R.tackling);
  });

  it("pressure focus boosts the pass rush", () => {
    const rush: Gameplan = { ...NEUTRAL_GAMEPLAN, pressure: 1 };
    expect(applyGameplan(R, "DL", rush).strength).toBeGreaterThan(R.strength);
  });

  it("keeps ratings within 1..99", () => {
    const extreme = applyGameplan({ ...R, catching: 96 }, "WR", { air: 1, explosive: -1, coverage: 0, pressure: 0 });
    for (const v of Object.values(extreme)) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(99);
    }
  });
});

describe("deriveAiGameplan", () => {
  it("is deterministic for a seed", () => {
    expect(deriveAiGameplan(12345)).toEqual(deriveAiGameplan(12345));
  });
  it("differs across seeds", () => {
    expect(deriveAiGameplan(1)).not.toEqual(deriveAiGameplan(2));
  });
});
