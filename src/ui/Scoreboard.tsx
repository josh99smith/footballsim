import { useGame } from "../store/gameStore";

const fmtClock = (s: number): string => {
  const m = Math.floor(Math.max(0, s) / 60);
  const sec = Math.max(0, s) % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
};

const ordinal = (n: number): string =>
  n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;

const qtrLabel = (q: number): string => (q > 4 ? "OT" : `${ordinal(q)} Qtr`);

export function Scoreboard() {
  const s = useGame();
  const ballOn = Math.round(s.info.ballOn);
  const ballDesc = ballOn < 50
    ? `OWN ${ballOn}`
    : ballOn > 50
      ? `OPP ${100 - ballOn}`
      : "50";
  const dd = s.info.distance >= 100 - ballOn ? "& Goal" : `& ${Math.round(s.info.distance)}`;

  return (
    <div className="scoreboard">
      <div className={`team home ${s.info.possession === "home" ? "has-ball" : ""}`}>
        <span className="dot" style={{ background: s.homeColor }} />
        <span className="abbr">{s.homeAbbr || "HOME"}</span>
        <span className="pts">{s.info.score.home}</span>
      </div>

      <div className="situation">
        <div className="big">{ordinal(s.info.down)} {dd}</div>
        <div className="sub">{ballDesc}</div>
      </div>

      <div className="clock">
        <div className="big">{fmtClock(s.info.clock)}</div>
        <div className="sub">{qtrLabel(s.info.quarter)}</div>
      </div>

      <div className={`team away ${s.info.possession === "away" ? "has-ball" : ""}`}>
        <span className="pts">{s.info.score.away}</span>
        <span className="abbr">{s.awayAbbr || "AWAY"}</span>
        <span className="dot" style={{ background: s.awayColor }} />
      </div>
    </div>
  );
}
