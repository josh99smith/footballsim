import { describe, expect, it } from "vitest";
import {
  COACHES, coachById, deriveAiCoach, traitActive, traitBonus, type CoachCtx,
} from "./coach";

const ctx = (o: Partial<CoachCtx> = {}): CoachCtx => ({
  quarter: 1, clock: 600, scoreDiff: 0, down: 1, distance: 10, ballOn: 25, overtime: 0, ...o,
});

describe("coach archetypes", () => {
  it("coachById falls back to Field General for unknown ids", () => {
    expect(coachById("nope").id).toBe("field-general");
    expect(coachById("air-raid").name).toBe("Air Raid");
  });

  it("deriveAiCoach is deterministic per seed", () => {
    expect(deriveAiCoach(1234).id).toBe(deriveAiCoach(1234).id);
    expect(deriveAiCoach(1234).gameplan).toEqual(deriveAiCoach(1234).gameplan);
  });

  it("every archetype has a distinct trait", () => {
    const traits = new Set(COACHES.map((c) => c.trait.id));
    expect(traits.size).toBe(COACHES.length);
  });
});

describe("signature traits fire only in their moment", () => {
  it("Closer boosts the run only in the 4th quarter with a lead (on offense)", () => {
    const closer = coachById("smashmouth");
    expect(traitActive(closer, true, ctx({ quarter: 4, scoreDiff: 7 }))).toBe(true);
    expect(traitBonus(closer, true, ctx({ quarter: 4, scoreDiff: 7 })).OL?.blocking).toBeGreaterThan(0);
    // wrong quarter / trailing / on defense → dormant
    expect(traitActive(closer, true, ctx({ quarter: 2, scoreDiff: 7 }))).toBe(false);
    expect(traitActive(closer, true, ctx({ quarter: 4, scoreDiff: -7 }))).toBe(false);
    expect(traitActive(closer, false, ctx({ quarter: 4, scoreDiff: 7 }))).toBe(false);
  });

  it("Dial-Up Pressure boosts the rush on obvious passing downs (on defense)", () => {
    const blitz = coachById("blitzburgh");
    expect(traitActive(blitz, false, ctx({ down: 3, distance: 8 }))).toBe(true);
    expect(traitBonus(blitz, false, ctx({ down: 3, distance: 8 })).DL?.strength).toBeGreaterThan(0);
    expect(traitActive(blitz, false, ctx({ down: 1, distance: 10 }))).toBe(false);
  });

  it("Red Zone Wall boosts coverage only inside the 20 on defense", () => {
    const wall = coachById("bend-dont-break");
    expect(traitActive(wall, false, ctx({ ballOn: 88 }))).toBe(true);
    expect(traitActive(wall, false, ctx({ ballOn: 50 }))).toBe(false);
  });
});
