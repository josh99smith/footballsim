import { useGame } from "../store/gameStore";

/** Broadcast-style ticker under the field showing the latest play. */
export function GameLog() {
  const lastPlayText = useGame((s) => s.lastPlayText);
  const aiCall = useGame((s) => s.aiCallName);
  const phase = useGame((s) => s.phase);

  return (
    <div className="game-log">
      <span className="log-tag">PLAY</span>
      <span className="log-text">{lastPlayText || "Kickoff. Game on."}</span>
      {phase === "live" && aiCall && <span className="log-aside">vs {aiCall}</span>}
    </div>
  );
}
