import { useGame } from "../store/gameStore";
import { DEF_PLAYS, OFF_PLAYS } from "../sim/playbook";
import type { Philosophy } from "../sim/coordinator";

const SLIDERS: { key: keyof Philosophy; label: string; lo: string; hi: string }[] = [
  { key: "passLean", label: "Run / Pass", lo: "Run", hi: "Pass" },
  { key: "aggression", label: "Aggression", lo: "Safe", hi: "Bold" },
  { key: "risk", label: "Risk", lo: "Low", hi: "High" },
  { key: "blitzFreq", label: "Blitz", lo: "Sit", hi: "Heat" },
];

/**
 * Bottom sheet for calling plays. Only mounts when the coach actually has a
 * decision to make (pre-snap play call, or a post-touchdown conversion), so the
 * field stays maximised the rest of the time.
 */
export function PlaySheet() {
  const s = useGame();
  const pickOffense = useGame((g) => g.pickOffense);
  const pickDefense = useGame((g) => g.pickDefense);
  const specialTeams = useGame((g) => g.specialTeams);
  const clockPlay = useGame((g) => g.clockPlay);
  const timeout = useGame((g) => g.timeout);
  const convert = useGame((g) => g.convert);
  const setPhilosophy = useGame((g) => g.setPhilosophy);

  if (s.awaitingConversion) {
    return (
      <div className="sheet">
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h2>Conversion</h2>
          <span className="sheet-tag">Touchdown!</span>
        </div>
        <div className="conv-row">
          <button className="conv-btn" onClick={() => convert("xp")}>
            <span className="conv-title">Extra Point</span>
            <span className="conv-sub">+1 · safe</span>
          </button>
          <button className="conv-btn two" onClick={() => convert("two")}>
            <span className="conv-title">Go for Two</span>
            <span className="conv-sub">+2 · ~47%</span>
          </button>
        </div>
      </div>
    );
  }

  if (s.phase !== "preSnap" || !s.callSide) return null;

  const callingOffense = s.callSide === "offense";
  const myTimeouts = s.info.timeouts[s.userTeam];

  return (
    <div className="sheet">
      <div className="sheet-grip" />
      <div className="sheet-head">
        <h2>{callingOffense ? "Call Offense" : "Call Defense"}</h2>
        <span className="sheet-tag">You: {s.userTeam === "home" ? s.homeAbbr : s.awayAbbr}</span>
      </div>

      <div className="sheet-scroll">
        <div className="play-grid">
          {(callingOffense ? OFF_PLAYS : DEF_PLAYS).map((p, i) => (
            <button
              key={p.id}
              className="play-card"
              onClick={() => (callingOffense ? pickOffense(p.id) : pickDefense(p.id))}
            >
              <span className="play-num">{i + 1}</span>
              <div className="play-body">
                <div className="play-card-top">
                  <span className="play-name">{p.name}</span>
                  <span className="play-form">{p.formation}</span>
                </div>
                <span className="play-blurb">{p.blurb}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="action-row">
          {callingOffense && s.isFourthDown && (
            <>
              <button className="act-btn st" onClick={() => specialTeams("punt")}>Punt</button>
              <button className="act-btn st" onClick={() => specialTeams("fieldGoal")}>Field Goal</button>
            </>
          )}
          <button className="act-btn" disabled={myTimeouts <= 0} onClick={timeout}>
            ⏱ TO ({myTimeouts})
          </button>
          {callingOffense && (
            <>
              <button className="act-btn" onClick={() => clockPlay("kneel")}>Kneel</button>
              <button className="act-btn" onClick={() => clockPlay("spike")}>Spike</button>
            </>
          )}
        </div>

        <details className="philosophy">
          <summary>Coaching Philosophy</summary>
          <p className="phil-note">Drives the AI on the side you're not calling.</p>
          <div className="phil-grid">
            {SLIDERS.map((sl) => (
              <label key={sl.key} className="slider-row">
                <span className="slider-label">{sl.label}</span>
                <input
                  type="range" min={0} max={100}
                  value={Math.round(s.philosophy[sl.key] * 100)}
                  onChange={(e) => setPhilosophy({ [sl.key]: Number(e.target.value) / 100 } as Partial<Philosophy>)}
                />
              </label>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
