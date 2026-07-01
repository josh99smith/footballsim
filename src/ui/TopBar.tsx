import { useEffect, useRef, useState } from "react";
import { useGame } from "../store/gameStore";

/** Returns true for ~600ms after `value` increases (for a score-pop flash). */
function useBump(value: number): boolean {
  const [bump, setBump] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (value > prev.current) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 600);
      prev.current = value;
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value]);
  return bump;
}

const fmtClock = (s: number): string => {
  const m = Math.floor(Math.max(0, s) / 60);
  return `${m}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
};
const ordinal = (n: number): string =>
  n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
const qtr = (q: number): string => (q > 4 ? "OT" : `Q${q}`);

/** Translucent scoreboard overlay across the top of the field. */
export function TopBar() {
  const s = useGame();
  const ballOn = Math.round(s.info.ballOn);
  const spot = ballOn < 50 ? `OWN ${ballOn}` : ballOn > 50 ? `OPP ${100 - ballOn}` : "50";
  const togo = s.info.distance >= 100 - ballOn ? "& Goal" : `& ${Math.round(s.info.distance)}`;
  const hasBallHome = s.info.possession === "home";
  const homeBump = useBump(s.info.score.home);
  const awayBump = useBump(s.info.score.away);

  return (
    <div className="topbar">
      <div className={`tb-team ${hasBallHome ? "has" : ""}`}>
        <span className="tb-dot" style={{ background: s.homeColor }} />
        <span className="tb-abbr">{s.homeAbbr || "HOME"}</span>
        <span className={`tb-pts ${homeBump ? "bump" : ""}`}>{s.info.score.home}</span>
        {hasBallHome && <span className="tb-poss">🏈</span>}
      </div>

      <div className="tb-center">
        <div className="tb-dd">{ordinal(s.info.down)} {togo}</div>
        <div className="tb-sub">{spot} · {fmtClock(s.info.clock)} {qtr(s.info.quarter)}</div>
      </div>

      <div className={`tb-team away ${!hasBallHome ? "has" : ""}`}>
        {!hasBallHome && <span className="tb-poss">🏈</span>}
        <span className={`tb-pts ${awayBump ? "bump" : ""}`}>{s.info.score.away}</span>
        <span className="tb-abbr">{s.awayAbbr || "AWAY"}</span>
        <span className="tb-dot" style={{ background: s.awayColor }} />
      </div>

      <DriveBar />
    </div>
  );
}

/** Thin field-position bar: where the ball is on the offense's drive, with a
 *  first-down tick. Oriented so the offense always drives left → right. */
function DriveBar() {
  const s = useGame();
  const color = s.info.possession === "home" ? s.homeColor : s.awayColor;
  const ballPct = Math.max(0, Math.min(100, s.info.ballOn));
  const fdPct = Math.max(0, Math.min(100, s.info.ballOn + s.info.distance));
  return (
    <div className="tb-progress" aria-hidden>
      <div className="tb-prog-fill" style={{ width: `${ballPct}%`, background: color }} />
      <div className="tb-prog-fd" style={{ left: `${fdPct}%` }} />
      <div className="tb-prog-ball" style={{ left: `${ballPct}%`, background: color }} />
    </div>
  );
}
