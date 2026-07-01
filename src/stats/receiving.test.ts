import { describe, expect, it } from "vitest";
import { GameController, type UIState } from "../controller";

/**
 * Regression: a completed pass that ends in a tackle / TD (i.e. with YAC) must
 * still credit the receiver — completions never carry passResult "complete",
 * so the aggregator has to infer them. Play an air-heavy game and assert some
 * receiving production shows up.
 */
function playAirRaid(seed: number): { rec: number; recYds: number; passYds: number } {
  const air = { air: 0.9, explosive: 0.3, tempo: 0, coverage: 0, pressure: 0, press: 0 };
  const c = new GameController(1);
  let st!: UIState;
  c.onChange((s) => { st = s; });
  c.setSpeed("instant");
  c.startGame({
    seed, quarterSeconds: 300, difficulty: "normal", gameplan: air,
    home: { name: "H", abbr: "HOM", color: "#2e6fdb", strength: 82 },
    away: { name: "A", abbr: "AWY", color: "#d94a3d", strength: 74 },
  });
  let g = 0;
  const pass = ["quick-slants", "mesh", "four-verticals"];
  while (st.phase !== "gameOver" && g++ < 6000) {
    if (st.atHalftime) { c.confirmHalftime(air); continue; }
    if (st.awaitingConversion) { c.userConvert("xp"); continue; }
    if (st.callSide === "offense") {
      if (st.isFourthDown && st.info.distance > 3) c.userSpecialTeams("punt");
      else c.userPickOffense(pass[st.pbp.length % pass.length]);
    } else if (st.callSide === "defense") c.userPickDefense("cover3-base");
    else if (st.isFourthDown) c.userSpecialTeams("punt");
    else break;
  }
  const rows = [...c.getStats().playerRows("home"), ...c.getStats().playerRows("away")];
  let rec = 0, recYds = 0, passYds = 0;
  for (const p of rows) {
    if (p.recv) { rec += p.recv.rec; recYds += p.recv.yds; }
    if (p.pass) passYds += p.pass.yds;
  }
  return { rec, recYds, passYds };
}

describe("receiving stats", () => {
  it("credits receivers on completed passes (YAC included)", () => {
    const s = playAirRaid(7);
    expect(s.rec).toBeGreaterThan(10);
    expect(s.recYds).toBeGreaterThan(100);
  });

  it("receiving yards reconcile with passing yards", () => {
    const s = playAirRaid(42);
    // Every completion is both a passing and a receiving gain — totals match.
    expect(s.recYds).toBe(s.passYds);
  });
});
