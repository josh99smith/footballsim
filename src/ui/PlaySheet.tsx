import { useMemo, useState } from "react";
import { useGame } from "../store/gameStore";
import { useUI } from "../store/uiStore";
import { DEF_PLAYS, OFF_PLAYS, type DefPlay, type OffPlay } from "../sim/playbook";
import { PlayArt } from "./PlayArt";

/** Formations in a sensible display order; unknown ones fall to the end. */
const FORMATION_ORDER = ["Shotgun", "Singleback", "I-Form", "4-3", "Nickel", "Bear", "Goal Line"];
const formationRank = (f: string) => {
  const i = FORMATION_ORDER.indexOf(f);
  return i === -1 ? 99 : i;
};

/**
 * Bottom sheet for calling plays. Organised into formation pages, each play
 * shown as a schematic card, with a Flip option to mirror the call.
 */
export function PlaySheet() {
  const s = useGame();
  const pickOffense = useGame((g) => g.pickOffense);
  const pickDefense = useGame((g) => g.pickDefense);
  const specialTeams = useGame((g) => g.specialTeams);
  const clockPlay = useGame((g) => g.clockPlay);
  const timeout = useGame((g) => g.timeout);
  const convert = useGame((g) => g.convert);
  const flip = useUI((u) => u.playFlip);
  const togglePlayFlip = useUI((u) => u.togglePlayFlip);
  const setPlayFlip = useUI((u) => u.setPlayFlip);
  const setAdjustOpen = useUI((u) => u.setAdjustOpen);

  const callingOffense = s.callSide === "offense";
  const plays: (OffPlay | DefPlay)[] = callingOffense ? OFF_PLAYS : DEF_PLAYS;

  // Distinct formations for the current side, in display order → these are the pages.
  const formations = useMemo(() => {
    const set = [...new Set(plays.map((p) => p.formation))];
    set.sort((a, b) => formationRank(a) - formationRank(b));
    return set;
  }, [plays]);
  const [page, setPage] = useState<string>("All");
  const activePage = formations.includes(page) || page === "All" ? page : "All";
  const shown = activePage === "All" ? plays : plays.filter((p) => p.formation === activePage);

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

  const myTimeouts = s.info.timeouts[s.userTeam];

  const call = (id: string) => {
    if (callingOffense) { pickOffense(id, flip); setPlayFlip(false); }
    else pickDefense(id);
  };

  return (
    <div className="sheet">
      <div className="sheet-grip" />
      <div className="sheet-head">
        <h2>{callingOffense ? "Call Offense" : "Call Defense"}</h2>
        <div className="sheet-head-right">
          {callingOffense && (
            <button
              className={`flip-btn ${flip ? "on" : ""}`}
              onClick={togglePlayFlip}
              aria-pressed={flip}
              title="Mirror the play to the other side (F)"
            >
              ⇄ Flip{flip ? " ✓" : ""}
            </button>
          )}
          <button
            className="flip-btn adjust-open"
            onClick={() => setAdjustOpen(true)}
            title="Mid-game coaching adjustment (A)"
          >
            ⚙ Adjust
          </button>
        </div>
      </div>

      <div className="form-tabs">
        <button className={`form-tab ${activePage === "All" ? "active" : ""}`} onClick={() => setPage("All")}>
          All
        </button>
        {formations.map((f) => (
          <button key={f} className={`form-tab ${activePage === f ? "active" : ""}`} onClick={() => setPage(f)}>
            {f}
          </button>
        ))}
      </div>

      <div className={`coach-strip ${s.coach.userTraitHot ? "hot" : ""}`}>
        <div className="cs-line">
          <span className="cs-you">{s.coach.userName}</span>
          <span className="cs-vs">vs</span>
          <span className="cs-opp">{s.coach.aiName}</span>
          <span className={`cs-badge ${s.coach.userTraitHot ? "hot" : ""}`}>
            ★ {s.coach.userTrait}{s.coach.userTraitHot ? " · ACTIVE" : ""}
          </span>
        </div>
      </div>

      <div className="sheet-scroll">
        <div className="pcard-grid">
          {shown.map((p) => (
            <button key={p.id} className="pcard" onClick={() => call(p.id)}>
              <div className="pcard-art">
                <PlayArt
                  play={p}
                  side={callingOffense ? "offense" : "defense"}
                  flip={callingOffense && flip}
                />
                <span className="pcard-type">{p.type}</span>
              </div>
              <div className="pcard-info">
                <span className="pcard-name">{p.name}</span>
                <span className="pcard-blurb">{p.blurb}</span>
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

      </div>
    </div>
  );
}
