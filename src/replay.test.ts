import { describe, expect, it } from "vitest";
import { GameController, type GameSetup, type UIState } from "./controller";

function setup(seed: number): GameSetup {
  return {
    seed,
    quarterSeconds: 120, // short quarters → fast full game
    difficulty: "normal",
    home: { name: "Home", abbr: "HOM", color: "#2e6fdb" },
    away: { name: "Away", abbr: "AWY", color: "#d94a3d" },
  };
}

/** Play a full game by always taking the first available choice. */
function playOut(c: GameController): UIState {
  let state!: UIState;
  c.onChange((s) => { state = s; });
  c.setSpeed("instant");
  c.startGame(setup(4242));
  let guard = 0;
  while (state.phase !== "gameOver" && guard++ < 4000) {
    if (state.awaitingConversion) { c.userConvert("xp"); continue; }
    if (state.callSide === "offense") c.userPickOffense("inside-zone");
    else if (state.callSide === "defense") c.userPickDefense("cover3-base");
    else break; // unexpected
  }
  return state;
}

describe("save / replay", () => {
  it("replays an input log to the identical final state", () => {
    const a = new GameController(1);
    const finalA = playOut(a);
    const save = a.getSave()!;
    expect(save).toBeTruthy();
    expect(save.inputs.length).toBeGreaterThan(0);

    // Fresh controller, replay the recorded inputs.
    const b = new GameController(999); // different seed; replay overrides via setup
    let finalB!: UIState;
    b.onChange((s) => { finalB = s; });
    b.replay(save);

    expect(finalB.phase).toBe("gameOver");
    expect(finalB.info.score).toEqual(finalA.info.score);
    expect(finalB.pbp.length).toBe(finalA.pbp.length);
  });

  it("the same setup + same calls is reproducible across controllers", () => {
    const a = new GameController(7);
    const fa = playOut(a);
    const b = new GameController(7);
    const fb = playOut(b);
    expect(fb.info.score).toEqual(fa.info.score);
    expect(fb.pbp.length).toBe(fa.pbp.length);
  });
});
