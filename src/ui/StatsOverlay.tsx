import { useUI } from "../store/uiStore";
import { StatsPanel } from "./StatsPanel";

/** Full-screen stats, toggled from the dock. Hidden until opened. */
export function StatsOverlay() {
  const open = useUI((s) => s.statsOpen);
  const setStatsOpen = useUI((s) => s.setStatsOpen);
  if (!open) return null;
  return (
    <div className="overlay stats-overlay-wrap" onClick={() => setStatsOpen(false)}>
      <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head">
          <h2>Game Stats</h2>
          <button className="close-btn" onClick={() => setStatsOpen(false)} aria-label="Close">✕</button>
        </div>
        <StatsPanel />
      </div>
    </div>
  );
}
