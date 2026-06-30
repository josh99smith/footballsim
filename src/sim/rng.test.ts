import { describe, expect, it } from "vitest";
import { RNG } from "./rng";

describe("RNG", () => {
  it("is deterministic for the same seed", () => {
    const a = new RNG(12345);
    const b = new RNG(12345);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = new RNG(1);
    const b = new RNG(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it("stays within [0,1)", () => {
    const r = new RNG(99);
    for (let i = 0; i < 1000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("int() respects inclusive bounds", () => {
    const r = new RNG(7);
    for (let i = 0; i < 1000; i++) {
      const x = r.int(3, 8);
      expect(x).toBeGreaterThanOrEqual(3);
      expect(x).toBeLessThanOrEqual(8);
    }
  });

  it("gaussian() has roughly zero mean", () => {
    const r = new RNG(42);
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) sum += r.gaussian();
    expect(Math.abs(sum / n)).toBeLessThan(0.05);
  });
});
