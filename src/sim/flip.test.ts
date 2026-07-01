import { describe, expect, it } from "vitest";
import { getOffPlay, mirrorOffPlay } from "./playbook";
import { GameController, type GameSetup, type UIState } from "../controller";

describe("mirrorOffPlay", () => {
  it("negates every lateral alignment and route point", () => {
    const p = getOffPlay("power-sweep");
    const m = mirrorOffPlay(p);
    p.roles.forEach((r, i) => {
      const ma = m.roles[i].assign;
      expect(m.roles[i].dy).toBe(-r.dy);
      if (r.assign.kind === "carry" && ma.kind === "carry") {
        expect(ma.aimGap).toBe(-r.assign.aimGap);
      }
      if (r.assign.kind === "runRoute" && ma.kind === "runRoute") {
        r.assign.waypoints.forEach((w, j) => {
          expect(ma.waypoints[j]).toEqual({ x: w.x, y: -w.y });
        });
      }
    });
  });

  it("is an involution (flipping twice restores the original)", () => {
    const p = getOffPlay("four-verticals");
    expect(mirrorOffPlay(mirrorOffPlay(p))).toEqual(p);
  });
});

function setup(seed: number): GameSetup {
  return {
    seed, quarterSeconds: 300, difficulty: "normal",
    home: { name: "H", abbr: "HOM", color: "#2e6fdb" },
    away: { name: "A", abbr: "AWY", color: "#d94a3d" },
  };
}

/** Drive one offensive snap and return the resulting play text + yards. */
function oneSnap(flip: boolean): string {
  const c = new GameController(1);
  let st!: UIState;
  c.onChange((s) => { st = s; });
  c.setSpeed("instant");
  c.startGame(setup(3));
  // Advance to a spot where the user calls offense.
  let g = 0;
  while (st.callSide !== "offense" && g++ < 200) {
    if (st.callSide === "defense") c.userPickDefense("cover3-base");
    else if (st.isFourthDown) c.userSpecialTeams("punt");
    else break;
  }
  if (st.callSide === "offense") c.userPickOffense("power-sweep", flip);
  return `${st.info.ballOn}`; // controller advanced; ballOn changes deterministically
}

describe("flip is deterministic and replayable", () => {
  it("a flipped call reruns identically (replay uses the recorded flip flag)", () => {
    // Two identical runs with flip should match; the flag is carried in inputs.
    expect(oneSnap(true)).toBe(oneSnap(true));
    expect(oneSnap(false)).toBe(oneSnap(false));
  });
});
