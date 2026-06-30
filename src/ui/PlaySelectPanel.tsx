import { controller, useGame } from "../store/gameStore";
import { DEF_PLAYS, OFF_PLAYS } from "../sim/playbook";
import type { Philosophy } from "../sim/coordinator";
import type { TeamId } from "../sim/types";

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
  const clockPlay = useGame((g) => g.clockPlay);
  const timeout = useGame((g) => g.timeout);
  const convert = useGame((g) => g.convert);
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
        <GameLeaders />
        <button className="primary big" onClick={newGame}>New Game</button>
      </div>
    );
  }

  // Conversion choice after a touchdown.
  if (s.awaitingConversion) {
    return (
      <div className="panel play-select">
        <div className="panel-head">
          <h2>Conversion</h2>
          <span className="you-tag">You: {s.userTeam === "home" ? s.homeAbbr : s.awayAbbr}</span>
        </div>
        <p className="phil-note">Touchdown! Kick the extra point or go for two.</p>
        <div className="conv-row">
          <button className="conv-btn" onClick={() => convert("xp")}>
            <span className="conv-title">Extra Point</span>
            <span className="conv-sub">+1 · safe</span>
          </button>
          <button className="conv-btn two" onClick={() => convert("two")}>
            <span className="conv-title">Go for Two</span>
            <span className="conv-sub">+2 · ~47%</span>
          </button>
        </div>
      </div>
    );
  }

  const callingOffense = s.callSide === "offense";
  const waiting = s.phase !== "preSnap";
  const myTimeouts = s.info.timeouts[s.userTeam];
  const leadingLate = s.info.quarter >= 4 &&
    s.info.score[s.userTeam] > s.info.score[s.userTeam === "home" ? "away" : "home"];

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

          <div className="clock-row">
            <button className="clock-btn" disabled={myTimeouts <= 0} onClick={timeout}>
              ⏱ Timeout ({myTimeouts})
            </button>
            {callingOffense && (
              <>
                <button className={`clock-btn ${leadingLate ? "hint" : ""}`} onClick={() => clockPlay("kneel")}>
                  Kneel
                </button>
                <button className="clock-btn" onClick={() => clockPlay("spike")}>
                  Spike
                </button>
              </>
            )}
          </div>
        </>
      )}

      <details className="philosophy">
        <summary>Coaching Philosophy</summary>
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
      </details>
    </div>
  );
}

/** Top performers across both teams, shown on the final screen. */
function GameLeaders() {
  const homeAbbr = useGame((g) => g.homeAbbr);
  const awayAbbr = useGame((g) => g.awayAbbr);
  const stats = controller.getStats();
  const abbr = (t: TeamId) => (t === "home" ? homeAbbr : awayAbbr);
  const all = [...stats.playerRows("home"), ...stats.playerRows("away")];

  const topPass = all.filter((p) => p.pass && p.pass.att > 0)
    .sort((a, b) => (b.pass!.yds - a.pass!.yds))[0];
  const topRush = all.filter((p) => p.rush && p.rush.att > 0)
    .sort((a, b) => (b.rush!.yds - a.rush!.yds))[0];
  const topRecv = all.filter((p) => p.recv && p.recv.rec > 0)
    .sort((a, b) => (b.recv!.yds - a.recv!.yds))[0];

  if (!topPass && !topRush && !topRecv) return null;
  return (
    <div className="leaders-final">
      <h3>Game Leaders</h3>
      {topPass && (
        <div className="leader-row">
          <span className="leader-cat">PASS</span>
          <span>{abbr(topPass.teamId)} #{topPass.number} {topPass.name}</span>
          <span className="leader-stat">{topPass.pass!.comp}/{topPass.pass!.att}, {topPass.pass!.yds} yds, {topPass.pass!.td} TD</span>
        </div>
      )}
      {topRush && (
        <div className="leader-row">
          <span className="leader-cat">RUSH</span>
          <span>{abbr(topRush.teamId)} #{topRush.number} {topRush.name}</span>
          <span className="leader-stat">{topRush.rush!.att} att, {topRush.rush!.yds} yds, {topRush.rush!.td} TD</span>
        </div>
      )}
      {topRecv && (
        <div className="leader-row">
          <span className="leader-cat">REC</span>
          <span>{abbr(topRecv.teamId)} #{topRecv.number} {topRecv.name}</span>
          <span className="leader-stat">{topRecv.recv!.rec} rec, {topRecv.recv!.yds} yds, {topRecv.recv!.td} TD</span>
        </div>
      )}
    </div>
  );
}
