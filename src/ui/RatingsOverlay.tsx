import { useState } from "react";
import { useUI } from "../store/uiStore";
import { useGame } from "../store/gameStore";
import type { PlayerView, TeamRosterView } from "../sim/ratingsView";
import type { Ratings } from "../sim/types";

const RATING_LABELS: Array<[keyof Ratings, string]> = [
  ["speed", "SPD"], ["strength", "STR"], ["agility", "AGI"], ["awareness", "AWR"],
  ["catching", "CAT"], ["tackling", "TAK"], ["blocking", "BLK"],
];

function ovrClass(v: number): string {
  if (v >= 88) return "ov-elite";
  if (v >= 80) return "ov-good";
  if (v >= 72) return "ov-mid";
  return "ov-low";
}

function PlayerRow({ p }: { p: PlayerView }) {
  const [open, setOpen] = useState(false);
  const delta = p.ovr - p.baseOvr;
  // Ratings the game plan actually moved, for the buff/debuff chips.
  const changes = RATING_LABELS.map(([k, lbl]) => {
    const d = p.effective[k] - p.base[k];
    return { lbl, val: p.effective[k], d };
  }).filter((c) => c.d !== 0);

  return (
    <li className={`rv-player ${open ? "open" : ""}`}>
      <button className="rv-player-head" onClick={() => setOpen((o) => !o)}>
        <span className="rv-pos">{p.pos}</span>
        <span className="rv-num">#{p.number}</span>
        <span className="rv-name">{p.name}</span>
        {delta !== 0 && (
          <span className={`rv-delta ${delta > 0 ? "up" : "down"}`}>
            {delta > 0 ? "+" : ""}{delta}
          </span>
        )}
        <span className={`rv-ovr ${ovrClass(p.ovr)}`}>{p.ovr}</span>
      </button>
      {open && (
        <div className="rv-ratings">
          {RATING_LABELS.map(([k, lbl]) => {
            const d = p.effective[k] - p.base[k];
            return (
              <div key={k} className="rv-rating">
                <span className="rv-rlbl">{lbl}</span>
                <span className="rv-rval">{p.effective[k]}</span>
                {d !== 0 && (
                  <span className={`rv-rd ${d > 0 ? "up" : "down"}`}>
                    {d > 0 ? "+" : ""}{d}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!open && changes.length > 0 && (
        <div className="rv-chips">
          {changes.map((c) => (
            <span key={c.lbl} className={`rv-chip ${c.d > 0 ? "up" : "down"}`}>
              {c.lbl} {c.d > 0 ? "+" : ""}{c.d}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

function TeamRoster({ team }: { team: TeamRosterView }) {
  return (
    <div className="rv-team">
      <ul className="rv-unit">
        <li className="rv-unit-title">Offense</li>
        {team.offense.map((p) => <PlayerRow key={p.id} p={p} />)}
      </ul>
      <ul className="rv-unit">
        <li className="rv-unit-title">Defense</li>
        {team.defense.map((p) => <PlayerRow key={p.id} p={p} />)}
      </ul>
    </div>
  );
}

/** Roster / ratings scouting overlay — base → game-plan-adjusted ratings with
 *  buff/debuff and OVR per player and team. */
export function RatingsOverlay() {
  const open = useUI((s) => s.ratingsOpen);
  const setOpen = useUI((s) => s.setRatingsOpen);
  const preview = useUI((s) => s.previewRosters);
  const liveRosters = useGame((s) => s.rosters);
  const rosters = preview ?? liveRosters;
  const [side, setSide] = useState<"home" | "away">("home");
  if (!open) return null;

  const team = rosters[side];
  const other = side === "home" ? rosters.away : rosters.home;

  return (
    <div className="overlay stats-overlay-wrap" onClick={() => setOpen(false)}>
      <div className="overlay-card rv-card" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head">
          <h2>Rosters &amp; Ratings</h2>
          <button className="close-btn" onClick={() => setOpen(false)} aria-label="Close">✕</button>
        </div>
        <div className="rv-teamtabs">
          {(["home", "away"] as const).map((s) => {
            const t = rosters[s];
            return (
              <button
                key={s}
                className={`rv-tab ${side === s ? "active" : ""}`}
                style={{ borderColor: t.color }}
                onClick={() => setSide(s)}
              >
                <span className="rv-tab-name">{t.abbr || (s === "home" ? "HOME" : "AWAY")}</span>
                <span className={`rv-tab-ovr ${ovrClass(t.ovr)}`}>{t.ovr || "—"}</span>
                <span className="rv-tab-sub">{s === "home" ? "You" : "AI"}</span>
              </button>
            );
          })}
        </div>
        <p className="rv-caption">
          Tap a player for the full card. Chips show how your game plan
          <b className="rv-c-up"> buffs</b> and <b className="rv-c-down">debuffs</b> each rating.
          {other.ovr > 0 && side === "home" && other.ovr > team.ovr && (
            <> Heads up — {other.abbr} scouts {other.ovr} OVR.</>
          )}
        </p>
        <TeamRoster team={team} />
      </div>
    </div>
  );
}
