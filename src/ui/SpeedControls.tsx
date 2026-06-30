import { useState } from "react";
import { useGame } from "../store/gameStore";
import type { Speed } from "../controller";
import { sound } from "../audio/sound";

const SPEEDS: { id: Speed; label: string }[] = [
  { id: "pause", label: "❚❚" },
  { id: "0.5", label: "0.5×" },
  { id: "1", label: "1×" },
  { id: "2", label: "2×" },
  { id: "4", label: "4×" },
  { id: "instant", label: "Instant" },
];

export function SpeedControls() {
  const speed = useGame((s) => s.speed);
  const setSpeed = useGame((s) => s.setSpeed);
  const phase = useGame((s) => s.phase);
  const shareCode = useGame((s) => s.shareCode);
  const [muted, setMuted] = useState(sound.muted);
  const [shared, setShared] = useState(false);

  const toggleMute = () => {
    const next = !muted;
    sound.setMuted(next);
    setMuted(next);
  };

  const share = async () => {
    const code = shareCode();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setShared(true);
      setTimeout(() => setShared(false), 1500);
    } catch {
      // Clipboard blocked — surface the code so it can be copied manually.
      window.prompt("Game code (copy to share):", code);
    }
  };

  return (
    <div className="speed-controls">
      <span className="label">Speed</span>
      {SPEEDS.map((sp) => (
        <button
          key={sp.id}
          className={speed === sp.id ? "active" : ""}
          disabled={phase === "gameOver"}
          onClick={() => setSpeed(sp.id)}
        >
          {sp.label}
        </button>
      ))}
      <button
        className="mute-btn"
        onClick={toggleMute}
        aria-pressed={muted}
        title={muted ? "Unmute" : "Mute"}
      >
        {muted ? "🔇" : "🔊"}
      </button>
      <button className="mute-btn" onClick={share} title="Copy shareable game code">
        {shared ? "✓" : "⤴"}
      </button>
    </div>
  );
}
