import { describe, expect, it } from "vitest";
import { PlaySim, type PlaySetup } from "./engine";
import { getOffPlay, getDefPlay } from "./playbook";
import { DEFAULT_TEAMS } from "./roster";
import { RNG } from "./rng";
import { FIELD } from "./constants";

function makeSetup(seed: number, off: string): PlaySetup {
  const t = DEFAULT_TEAMS(seed);
  return {
    offPlay: getOffPlay(off), defPlay: getDefPlay("cover3-base"),
    offRoster: t.home.offense, defRoster: t.away.defense,
    ballY: FIELD.WIDTH / 2, yardsToGoal: 75, rng: new RNG(seed ^ 0x777),
  };
}

/** Outcomes for a play run from midfield-ish against base coverage. */
function sample(play: string, n = 60) {
  let td = 0, comp = 0, inc = 0;
  for (let s = 0; s < n; s++) {
    const r = new PlaySim(makeSetup(s, play)).runToCompletion();
    if (r.endReason === "touchdown") td++;
    else if (r.passResult === "incomplete") inc++;
    else if (r.isPass) comp++;
  }
  return { td, comp, inc, tdRate: td / n, compRate: (comp + td) / n };
}

describe("deep-ball balance (no free 75-yard touchdowns)", () => {
  it("play-action-deep is not a house call against sound coverage", () => {
    // Was ~50% TD before deep-zone carry; a shot play should be well under 20%.
    expect(sample("play-action-deep").tdRate).toBeLessThan(0.2);
  });

  it("four-verticals is boom-or-bust, not automatic", () => {
    expect(sample("four-verticals").tdRate).toBeLessThan(0.25);
  });

  it("deep shots still connect for chunk plays sometimes", () => {
    // Coverage shouldn't have been nerfed the other way — completions happen.
    const pa = sample("play-action-deep");
    expect(pa.compRate).toBeGreaterThan(0.4);
  });

  it("a quick slant almost never goes the distance", () => {
    expect(sample("quick-slants").tdRate).toBeLessThan(0.12);
  });
});
