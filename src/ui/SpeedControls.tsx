import { useGame } from "../store/gameStore";
import type { Speed } from "../controller";

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
    </div>
  );
}
