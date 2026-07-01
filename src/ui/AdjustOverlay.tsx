import { useEffect, useState } from "react";
import { useGame } from "../store/gameStore";
import { useUI } from "../store/uiStore";
import { GameplanControls } from "./GameplanControls";
import { planSummary, type Gameplan } from "../sim/gameplan";

const clamp1 = (x: number) => Math.max(-1, Math.min(1, x));

/** One-tap coaching directives that nudge the plan on their axes. */
const PRESETS: { label: string; side: "offense" | "defense"; delta: Partial<Gameplan> }[] = [
  { label: "Air it out", side: "offense", delta: { air: 0.5, explosive: 0.25 } },
  { label: "Pound the rock", side: "offense", delta: { air: -0.5, explosive: -0.2 } },
  { label: "Hurry-up", side: "offense", delta: { tempo: 0.5 } },
  { label: "Blitz", side: "defense", delta: { pressure: 0.5, press: 0.25 } },
  { label: "Lock coverage", side: "defense", delta: { coverage: 0.5, press: 0.2 } },
  { label: "Stack the box", side: "defense", delta: { coverage: -0.5, pressure: 0.2 } },
];

/**
 * Mid-game coaching adjustment — re-tune your game plan on the fly between
 * snaps (takes effect on the next play). Reachable any time you're calling a
 * play, not just at halftime.
 */
export function AdjustOverlay() {
  const s = useGame();
  const adjustGameplan = useGame((g) => g.adjustGameplan);
  const open = useUI((u) => u.adjustOpen);
  const setOpen = useUI((u) => u.setAdjustOpen);
  const [plan, setPlan] = useState<Gameplan>(s.gameplan);

  // Re-seed from the live plan each time the panel opens.
  useEffect(() => {
    if (open) setPlan(s.gameplan);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const applyPreset = (delta: Partial<Gameplan>) =>
    setPlan((p) => {
      const out = { ...p };
      for (const k of Object.keys(delta) as (keyof Gameplan)[]) {
        out[k] = clamp1(out[k] + (delta[k] ?? 0));
      }
      return out;
    });

  const apply = () => { adjustGameplan(plan); setOpen(false); };

  return (
    <div className="overlay" onClick={() => setOpen(false)}>
      <div className="overlay-card adjust-card" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head">
          <h2>Adjustments</h2>
          <button className="close-btn" onClick={() => setOpen(false)} aria-label="Close">✕</button>
        </div>
        <div className="tab-body">
          <p className="adj-note">
            Re-tune your plan mid-game — it takes effect on the next snap.
            <span className="adj-scout"> Opponent looks like <b>{planSummary(s.aiGameplan)}</b>.</span>
          </p>

          <div className="adj-presets">
            {PRESETS.map((p) => (
              <button key={p.label} className={`adj-preset ${p.side}`} onClick={() => applyPreset(p.delta)}>
                {p.label}
              </button>
            ))}
          </div>

          <GameplanControls value={plan} onChange={setPlan} />
        </div>
        <div className="overlay-foot">
          <button className="primary big" onClick={apply}>Apply adjustment →</button>
        </div>
      </div>
    </div>
  );
}
