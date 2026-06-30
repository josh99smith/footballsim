import { useGame } from "../store/gameStore";

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

  return (
    <div className="topbar">
      <div className={`tb-team ${hasBallHome ? "has" : ""}`}>
        <span className="tb-dot" style={{ background: s.homeColor }} />
        <span className="tb-abbr">{s.homeAbbr || "HOME"}</span>
        <span className="tb-pts">{s.info.score.home}</span>
        {hasBallHome && <span className="tb-poss">🏈</span>}
      </div>

      <div className="tb-center">
        <div className="tb-dd">{ordinal(s.info.down)} {togo}</div>
        <div className="tb-sub">{spot} · {fmtClock(s.info.clock)} {qtr(s.info.quarter)}</div>
      </div>

      <div className={`tb-team away ${!hasBallHome ? "has" : ""}`}>
        {!hasBallHome && <span className="tb-poss">🏈</span>}
        <span className="tb-pts">{s.info.score.away}</span>
        <span className="tb-abbr">{s.awayAbbr || "AWAY"}</span>
        <span className="tb-dot" style={{ background: s.awayColor }} />
      </div>
    </div>
  );
}
