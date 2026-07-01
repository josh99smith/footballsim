import { COACHES } from "../sim/coach";
import { planSummary } from "../sim/gameplan";

/** Grid of head-coach archetypes. Picking one sets the team's identity:
 *  default gameplan, playcalling philosophy, and a signature trait. */
export function CoachPicker({
  value, onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="coach-grid">
      {COACHES.map((c) => (
        <button
          key={c.id}
          className={`coach-card ${value === c.id ? "active" : ""}`}
          onClick={() => onChange(c.id)}
          aria-pressed={value === c.id}
        >
          <span className="coach-name">{c.name}</span>
          <span className="coach-blurb">{c.blurb}</span>
          <span className="coach-plan">{planSummary(c.gameplan)}</span>
          <span className="coach-trait">
            <b>★ {c.trait.name}</b> — {c.trait.desc}
          </span>
        </button>
      ))}
    </div>
  );
}
