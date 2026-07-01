import { GAMEPLAN_AXES, planSummary, type Gameplan } from "../sim/gameplan";

/** Bipolar game-plan sliders: leaning one way boosts a cluster of ratings and
 *  takes from the opposite. Reused pre-game and at halftime. */
export function GameplanControls({
  value,
  onChange,
}: {
  value: Gameplan;
  onChange: (g: Gameplan) => void;
}) {
  const set = (k: keyof Gameplan, v: number) => onChange({ ...value, [k]: v });

  const group = (side: "offense" | "defense") => (
    <div className="gp-group">
      <h4 className="gp-group-title">{side === "offense" ? "Offense" : "Defense"}</h4>
      {GAMEPLAN_AXES.filter((a) => a.side === side).map((ax) => (
        <div key={ax.key} className="gp-axis">
          <div className="gp-axis-head">
            <span className="gp-lo">{ax.lo}</span>
            <span className="gp-label">{ax.label}</span>
            <span className="gp-hi">{ax.hi}</span>
          </div>
          <input
            type="range"
            min={-100}
            max={100}
            value={Math.round((value[ax.key] ?? 0) * 100)}
            onChange={(e) => set(ax.key, Number(e.target.value) / 100)}
          />
          <p className="gp-hint">{ax.hint}</p>
        </div>
      ))}
    </div>
  );

  return (
    <div className="gameplan">
      {group("offense")}
      {group("defense")}
      <p className="gp-summary">Emphasis: <b>{planSummary(value)}</b></p>
    </div>
  );
}
