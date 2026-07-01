import { describe, expect, it } from "vitest";
import { GameController, type GameSetup, type UIState } from "./controller";

function setup(seed: number): GameSetup {
  return {
    seed, quarterSeconds: 120, difficulty: "normal",
    home: { name: "H", abbr: "HOM", color: "#2e6fdb" },
    away: { name: "A", abbr: "AWY", color: "#d94a3d" },
  };
}

const NEUTRAL = { air: 0, explosive: 0, tempo: 0, coverage: 0, pressure: 0, press: 0 };
const AIR = { air: 0.8, explosive: 0.4, tempo: 0.3, coverage: 0, pressure: 0, press: 0 };

/** Play a full game, applying a mid-game adjustment on the 4th offensive snap. */
function playWithAdjust(c: GameController): UIState {
  let st!: UIState;
  c.onChange((s) => { st = s; });
  c.setSpeed("instant");
  c.startGame(setup(2024));
  let offSnaps = 0, guard = 0;
  while (st.phase !== "gameOver" && guard++ < 4000) {
    if (st.atHalftime) { c.confirmHalftime(NEUTRAL); continue; }
    if (st.awaitingConversion) { c.userConvert("xp"); continue; }
    if (st.callSide === "offense") {
      offSnaps++;
      if (offSnaps === 4) c.adjustGameplan(AIR); // coaching adjustment mid-drive
      c.userPickOffense("inside-zone");
    } else if (st.callSide === "defense") c.userPickDefense("cover3-base");
    else break;
  }
  return st;
}

describe("mid-game adjustment", () => {
  it("is recorded as an input and replays to the identical final state", () => {
    const a = new GameController(1);
    const finalA = playWithAdjust(a);
    const save = a.getSave()!;
    expect(save.inputs.some((i) => i.t === "adjust")).toBe(true);

    // Fresh controller, replay the recorded inputs (including the adjustment).
    const b = new GameController(999);
    let finalB!: UIState;
    b.onChange((s) => { finalB = s; });
    b.replay(save);

    expect(finalB.phase).toBe("gameOver");
    expect(finalB.info.score).toEqual(finalA.info.score);
    expect(finalB.pbp.length).toBe(finalA.pbp.length);
  });

  it("actually changes the live game plan (affects the box score)", () => {
    const withAdjust = playWithAdjust(new GameController(1));
    // Same game with no adjustment.
    const c = new GameController(1);
    let st!: UIState;
    c.onChange((s) => { st = s; });
    c.setSpeed("instant");
    c.startGame(setup(2024));
    let guard = 0;
    while (st.phase !== "gameOver" && guard++ < 4000) {
      if (st.atHalftime) { c.confirmHalftime(NEUTRAL); continue; }
      if (st.awaitingConversion) { c.userConvert("xp"); continue; }
      if (st.callSide === "offense") c.userPickOffense("inside-zone");
      else if (st.callSide === "defense") c.userPickDefense("cover3-base");
      else break;
    }
    // The air-raid adjustment shifts the run-only offense's output, so the games
    // diverge somewhere in the box score.
    const diverged =
      withAdjust.info.score.home !== st.info.score.home ||
      withAdjust.info.score.away !== st.info.score.away ||
      withAdjust.pbp.length !== st.pbp.length;
    expect(diverged).toBe(true);
  });
});
