import { useGame } from "../store/gameStore";

/** Pick a broadcast icon from the play text. */
export function iconFor(text: string): string {
  if (/TOUCHDOWN/i.test(text)) return "🏈";
  if (/INTERCEPT/i.test(text)) return "🛑";
  if (/field goal/i.test(text)) return "🥅";
  if (/SACK/i.test(text)) return "💥";
  if (/punt/i.test(text)) return "🦵";
  if (/FIRST DOWN/i.test(text)) return "📏";
  if (/incomplete/i.test(text)) return "❌";
  if (/pass complete/i.test(text)) return "🎯";
  if (/run for/i.test(text)) return "🏃";
  return "📣";
}

/** Broadcast-style ticker under the field showing the latest play. */
export function GameLog() {
  const lastPlayText = useGame((s) => s.lastPlayText);
  const aiCall = useGame((s) => s.aiCallName);
  const phase = useGame((s) => s.phase);
  // Re-key on text so the entry re-animates each new play.
  const text = lastPlayText || "Kickoff. Game on.";

  return (
    <div className="game-log">
      <span className="log-tag">PLAY</span>
      <span className="log-icon" key={text}>{iconFor(text)}</span>
      <span className="log-text" key={`t-${text}`}>{text}</span>
      {phase === "live" && aiCall && <span className="log-aside">vs {aiCall}</span>}
    </div>
  );
}
