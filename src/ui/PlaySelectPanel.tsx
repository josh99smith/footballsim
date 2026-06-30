import { useGame } from "../store/gameStore";
import { DEF_PLAYS, OFF_PLAYS } from "../sim/playbook";
import type { Philosophy } from "../sim/coordinator";

const SLIDERS: { key: keyof Philosophy; label: string; lo: string; hi: string }[] = [
  { key: "passLean", label: "Run / Pass Lean", lo: "Run", hi: "Pass" },
  { key: "aggression", label: "Aggression", lo: "Safe", hi: "Bold" },
  { key: "risk", label: "Risk Tolerance", lo: "Low", hi: "High" },
  { key: "blitzFreq", label: "Blitz Frequency", lo: "Sit", hi: "Heat" },
];

export function PlaySelectPanel() {
  const s = useGame();
  const pickOffense = useGame((g) => g.pickOffense);
  const pickDefense = useGame((g) => g.pickDefense);
  const specialTeams = useGame((g) => g.specialTeams);
  const setPhilosophy = useGame((g) => g.setPhilosophy);
  const newGame = useGame((g) => g.newGame);

  if (s.phase === "gameOver") {
    const w = s.winner;
    const txt =
      w === "tie" ? "Final — Tie game" :
      w === "home" ? `Final — ${s.homeName} win` :
      `Final — ${s.awayName} win`;
    return (
      <div className="panel play-select">
        <h2>Game Over</h2>
        <p className="final-line">{txt}</p>
        <p className="final-score">{s.homeAbbr} {s.info.score.home} — {s.info.score.away} {s.awayAbbr}</p>
        <button className="primary big" onClick={newGame}>New Game</button>
      </div>
    );
  }

  const callingOffense = s.callSide === "offense";
  const waiting = s.phase !== "preSnap";

  return (
    <div className="panel play-select">
      <div className="panel-head">
        <h2>{callingOffense ? "Call Offense" : "Call Defense"}</h2>
        <span className="you-tag">You: {s.userTeam === "home" ? s.homeAbbr : s.awayAbbr}</span>
      </div>

      {waiting ? (
        <div className="play-waiting">
          <div className="status-dot" />
          <p>{s.phase === "live" ? "Play in progress…" : "Setting up…"}</p>
          {s.aiCallName && <p className="ai-call">Opponent: <b>{s.aiCallName}</b></p>}
        </div>
      ) : (
        <>
          <div className="play-list">
            {(callingOffense ? OFF_PLAYS : DEF_PLAYS).map((p) => (
              <button
                key={p.id}
                className="play-card"
                onClick={() => (callingOffense ? pickOffense(p.id) : pickDefense(p.id))}
              >
                <div className="play-card-top">
                  <span className="play-name">{p.name}</span>
                  <span className="play-form">{p.formation}</span>
                </div>
                <span className="play-blurb">{p.blurb}</span>
              </button>
            ))}
          </div>

          {callingOffense && s.isFourthDown && (
            <div className="st-row">
              <span className="st-label">4th down — special teams:</span>
              <button className="st-btn" onClick={() => specialTeams("punt")}>Punt</button>
              <button className="st-btn" onClick={() => specialTeams("fieldGoal")}>Field Goal</button>
            </div>
          )}
        </>
      )}

      <div className="philosophy">
        <h3>Coaching Philosophy</h3>
        <p className="phil-note">Drives the AI on the side you're not calling, and biases tendencies.</p>
        {SLIDERS.map((sl) => (
          <label key={sl.key} className="slider-row">
            <span className="slider-label">{sl.label}</span>
            <div className="slider-track">
              <span className="ends">{sl.lo}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(s.philosophy[sl.key] * 100)}
                onChange={(e) => setPhilosophy({ [sl.key]: Number(e.target.value) / 100 } as Partial<Philosophy>)}
              />
              <span className="ends">{sl.hi}</span>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
