import { describe, expect, it } from "vitest";
import { GameController, type GameSetup, type UIState } from "./controller";

/**
 * Golden determinism regression: a fixed seed + a fixed scripted call sheet must
 * always produce the exact same box score. If the sim is changed intentionally
 * (tuning, new mechanics), these goldens are expected to move — update them
 * deliberately. An *accidental* change to determinism will trip this test.
 */
function setup(seed: number): GameSetup {
  return {
    seed, quarterSeconds: 120, difficulty: "normal",
    home: { name: "H", abbr: "HOM", color: "#2e6fdb" },
    away: { name: "A", abbr: "AWY", color: "#d94a3d" },
  };
}

function playScripted(seed: number): { home: number; away: number; plays: number } {
  const c = new GameController(1);
  let st!: UIState;
  c.onChange((s) => { st = s; });
  c.setSpeed("instant");
  c.startGame(setup(seed));
  let g = 0;
  while (st.phase !== "gameOver" && g++ < 5000) {
    if (st.atHalftime) { c.confirmHalftime({ air: 0, explosive: 0, tempo: 0, coverage: 0, pressure: 0, press: 0 }); continue; }
    if (st.awaitingConversion) { c.userConvert("xp"); continue; }
    if (st.callSide === "offense") c.userPickOffense("inside-zone");
    else if (st.callSide === "defense") c.userPickDefense("cover3-base");
    else break;
  }
  return { home: st.info.score.home, away: st.info.score.away, plays: st.pbp.length };
}

// Baselines reflect the AI opponent's seed-derived game plan (which nudges its
// ratings). Regenerate deliberately when the sim changes intentionally.
const GOLDEN: Record<number, { home: number; away: number; plays: number }> = {
  1: { home: 0, away: 21, plays: 25 },
  7: { home: 7, away: 13, plays: 32 },
  42: { home: 0, away: 14, plays: 24 },
  123: { home: 0, away: 20, plays: 24 },
};

describe("golden determinism", () => {
  for (const [seed, exp] of Object.entries(GOLDEN)) {
    it(`seed ${seed} reproduces its golden box score`, () => {
      expect(playScripted(Number(seed))).toEqual(exp);
    });
  }
});
