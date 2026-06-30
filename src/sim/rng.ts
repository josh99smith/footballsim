/**
 * Seeded pseudo-random number generator (mulberry32).
 *
 * This is the ONLY source of randomness in the sim. Never call Math.random()
 * inside the sim core — same seed + same sequence of draws = identical game.
 */
export class RNG {
  private state: number;

  constructor(seed: number) {
    // Force to uint32 so behaviour is identical across platforms.
    this.state = seed >>> 0;
  }

  /** Returns a float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns a float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Returns an integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Returns true with the given probability p in [0, 1]. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Approx. standard-normal sample (mean 0, sd 1) via two uniforms. */
  gaussian(): number {
    // Box-Muller. Guard against log(0).
    const u1 = Math.max(this.next(), 1e-9);
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /** Picks a uniformly random element. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** Snapshot of internal state, for debugging / replay assertions. */
  snapshot(): number {
    return this.state;
  }
}
