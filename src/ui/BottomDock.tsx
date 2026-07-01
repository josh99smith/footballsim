import { useState } from "react";
import { useGame } from "../store/gameStore";
import { useUI } from "../store/uiStore";
import type { Speed } from "../controller";
import { sound } from "../audio/sound";
import { iconFor } from "./icons";

const SPEEDS: { id: Speed; label: string }[] = [
  { id: "pause", label: "❚❚" },
  { id: "1", label: "1×" },
  { id: "2", label: "2×" },
  { id: "4", label: "4×" },
  { id: "instant", label: "⚡" },
];

/** Persistent bottom dock: speed control + ticker + stats/mute/share. */
export function BottomDock() {
  const speed = useGame((s) => s.speed);
  const setSpeed = useGame((s) => s.setSpeed);
  const lastPlayText = useGame((s) => s.lastPlayText);
  const phase = useGame((s) => s.phase);
  const shareCode = useGame((s) => s.shareCode);
  const toggleStats = useUI((s) => s.toggleStats);
  const toggleRatings = useUI((s) => s.toggleRatings);
  const [muted, setMuted] = useState(sound.muted);
  const [shared, setShared] = useState(false);

  const text = lastPlayText || "Kickoff. Game on.";

  const share = async () => {
    const code = shareCode();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setShared(true);
      setTimeout(() => setShared(false), 1400);
    } catch {
      window.prompt("Game code (copy to share):", code);
    }
  };
  const toggleMute = () => { const n = !muted; sound.setMuted(n); setMuted(n); };

  return (
    <div className="dock">
      {phase !== "preSnap" && (
        <div className="dock-ticker" role="status" aria-live="polite">
          <span className="dt-icon" key={text}>{iconFor(text)}</span>
          <span className="dt-text">{text}</span>
        </div>
      )}
      <div className="dock-row">
        <div className="dock-speed">
          {SPEEDS.map((sp) => (
            <button
              key={sp.id}
              className={speed === sp.id ? "active" : ""}
              disabled={phase === "gameOver"}
              onClick={() => setSpeed(sp.id)}
              aria-label={`speed ${sp.label}`}
            >
              {sp.label}
            </button>
          ))}
        </div>
        <div className="dock-tools">
          <button onClick={toggleStats} aria-label="Stats" title="Stats">📊</button>
          <button onClick={toggleRatings} aria-label="Rosters and ratings" title="Rosters &amp; ratings">👥</button>
          <button onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} title={muted ? "Unmute" : "Mute"}>
            {muted ? "🔇" : "🔊"}
          </button>
          <button onClick={share} aria-label="Share game code" title="Copy game code">
            {shared ? "✓" : "⤴"}
          </button>
        </div>
      </div>
    </div>
  );
}
