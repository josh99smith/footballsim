import { useEffect, useState } from "react";
import { useGame } from "../store/gameStore";
import { GameplanControls } from "./GameplanControls";
import { planSummary, type Gameplan } from "../sim/gameplan";

/** Full-screen halftime break: review the score and adjust the game plan. */
export function HalftimeOverlay() {
  const s = useGame();
  const confirmHalftime = useGame((g) => g.confirmHalftime);
  const [plan, setPlan] = useState<Gameplan>(s.gameplan);

  // Re-seed the editor from the live plan whenever halftime opens.
  useEffect(() => {
    if (s.atHalftime) setPlan(s.gameplan);
  }, [s.atHalftime]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s.atHalftime) return null;
  const you = s.userTeam === "home" ? s.homeAbbr : s.awayAbbr;

  return (
    <div className="overlay halftime">
      <div className="overlay-card">
        <div className="overlay-head">
          <h2>Halftime</h2>
          <span className="ht-score">{s.homeAbbr} {s.info.score.home} — {s.info.score.away} {s.awayAbbr}</span>
        </div>
        <div className="tab-body">
          <p className="ht-note">Adjust your game plan for the second half. Boosting an area pulls
            strength from its opposite.</p>
          <p className="ht-scout">Opponent's plan looks like: <b>{planSummary(s.aiGameplan)}</b></p>
          <div className="ht-you">{you} game plan</div>
          <GameplanControls value={plan} onChange={setPlan} />
        </div>
        <div className="overlay-foot">
          <button className="primary big" onClick={() => confirmHalftime(plan)}>
            Start 2nd Half →
          </button>
        </div>
      </div>
    </div>
  );
}
