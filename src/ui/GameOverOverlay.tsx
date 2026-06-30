import { controller, useGame } from "../store/gameStore";
import type { TeamId } from "../sim/types";

/** Full-screen final summary with stat leaders. */
export function GameOverOverlay() {
  const s = useGame();
  const newGame = useGame((g) => g.newGame);
  const shareCode = useGame((g) => g.shareCode);
  if (s.phase !== "gameOver") return null;

  const w = s.winner;
  const txt =
    w === "tie" ? "Final — Tie game" :
    w === "home" ? `${s.homeName} win` :
    `${s.awayName} win`;

  const share = async () => {
    const code = shareCode();
    if (!code) return;
    try { await navigator.clipboard.writeText(code); }
    catch { window.prompt("Game code (copy to share):", code); }
  };

  return (
    <div className="overlay gameover">
      <div className="overlay-card">
        <h2>Game Over</h2>
        <p className="final-line">{txt}</p>
        <p className="final-score">{s.homeAbbr} {s.info.score.home} — {s.info.score.away} {s.awayAbbr}</p>
        <Leaders />
        <div className="gameover-actions">
          <button className="primary big" onClick={newGame}>New Game</button>
          <button className="ghost-btn" onClick={share}>⤴ Share game code</button>
        </div>
      </div>
    </div>
  );
}

function Leaders() {
  const homeAbbr = useGame((g) => g.homeAbbr);
  const awayAbbr = useGame((g) => g.awayAbbr);
  const stats = controller.getStats();
  const abbr = (t: TeamId) => (t === "home" ? homeAbbr : awayAbbr);
  const all = [...stats.playerRows("home"), ...stats.playerRows("away")];
  const topPass = all.filter((p) => p.pass && p.pass.att > 0).sort((a, b) => b.pass!.yds - a.pass!.yds)[0];
  const topRush = all.filter((p) => p.rush && p.rush.att > 0).sort((a, b) => b.rush!.yds - a.rush!.yds)[0];
  const topRecv = all.filter((p) => p.recv && p.recv.rec > 0).sort((a, b) => b.recv!.yds - a.recv!.yds)[0];
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
