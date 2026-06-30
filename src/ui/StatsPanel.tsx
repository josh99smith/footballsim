import { useState } from "react";
import { controller, useGame } from "../store/gameStore";
import type { PlayerStats } from "../stats/aggregator";
import type { TeamId } from "../sim/types";
import { iconFor } from "./GameLog";

type Tab = "box" | "drives" | "pbp";

const fmtClock = (s: number): string => {
  const m = Math.floor(Math.max(0, s) / 60);
  return `${m}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
};

export function StatsPanel() {
  const s = useGame(); // re-render on every discrete update
  const [tab, setTab] = useState<Tab>("box");
  const stats = controller.getStats();

  return (
    <div className="panel stats-panel">
      <div className="tabs">
        {(["box", "drives", "pbp"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {t === "box" ? "Box Score" : t === "drives" ? "Drives" : "Play-by-Play"}
          </button>
        ))}
      </div>

      <div className="tab-body">
        {tab === "box" && <BoxScore />}
        {tab === "drives" && <Drives />}
        {tab === "pbp" && <Pbp />}
      </div>
    </div>
  );

  function BoxScore() {
    const teamTotals = (id: TeamId) => stats.totals[id];
    return (
      <div className="box">
        <div className="team-totals">
          {(["home", "away"] as TeamId[]).map((id) => {
            const t = teamTotals(id);
            const name = id === "home" ? s.homeAbbr : s.awayAbbr;
            return (
              <div key={id} className="tt-card">
                <h4>{name}</h4>
                <Row k="Total yards" v={t.totalYards} />
                <Row k="Pass yards" v={t.passYards} />
                <Row k="Rush yards" v={t.rushYards} />
                <Row k="First downs" v={t.firstDowns} />
                <Row k="Turnovers" v={t.turnovers} />
                <Row k="Sacks" v={t.sacks} />
                <div className="tt-row"><span>Penalties</span><span>{t.penalties}-{t.penaltyYards}</span></div>
                <div className="tt-row"><span>Time of poss.</span><span>{fmtTop(t.topSeconds)}</span></div>
              </div>
            );
          })}
        </div>
        {(["home", "away"] as TeamId[]).map((id) => (
          <TeamLeaders key={id} id={id} name={id === "home" ? s.homeName : s.awayName} />
        ))}
      </div>
    );
  }

  function TeamLeaders({ id, name }: { id: TeamId; name: string }) {
    const rows = stats.playerRows(id);
    const passers = rows.filter((r) => r.pass && r.pass.att > 0);
    const rushers = rows.filter((r) => r.rush && r.rush.att > 0);
    const receivers = rows.filter((r) => r.recv && r.recv.rec > 0);
    const defs = rows.filter((r) => r.def && (r.def.tackles + r.def.sacks + r.def.ints > 0));
    if (!passers.length && !rushers.length && !receivers.length && !defs.length) return null;
    return (
      <div className="leaders">
        <h4>{name}</h4>
        {passers.length > 0 && (
          <StatTable
            title="Passing"
            cols={["C/A", "Yds", "TD", "INT", "RTG"]}
            rows={passers.map((p) => [
              name22(p),
              `${p.pass!.comp}/${p.pass!.att}`,
              p.pass!.yds, p.pass!.td, p.pass!.int,
              passerRating(p.pass!),
            ])}
          />
        )}
        {rushers.length > 0 && (
          <StatTable
            title="Rushing"
            cols={["Att", "Yds", "TD", "Lng"]}
            rows={rushers.map((p) => [name22(p), p.rush!.att, p.rush!.yds, p.rush!.td, p.rush!.long])}
          />
        )}
        {receivers.length > 0 && (
          <StatTable
            title="Receiving"
            cols={["Rec", "Yds", "TD", "Lng"]}
            rows={receivers.map((p) => [name22(p), p.recv!.rec, p.recv!.yds, p.recv!.td, p.recv!.long])}
          />
        )}
        {defs.length > 0 && (
          <StatTable
            title="Defense"
            cols={["Tkl", "Sack", "INT"]}
            rows={defs.map((p) => [name22(p), p.def!.tackles, p.def!.sacks, p.def!.ints])}
          />
        )}
      </div>
    );
  }

  function Drives() {
    if (!stats.drives.length) return <p className="empty">No drives yet.</p>;
    return (
      <table className="data-table">
        <thead>
          <tr><th>Team</th><th>Start</th><th>Plays</th><th>Yds</th><th>Result</th></tr>
        </thead>
        <tbody>
          {stats.drives.map((d, i) => (
            <tr key={i}>
              <td>{d.team === "home" ? s.homeAbbr : s.awayAbbr}</td>
              <td>{d.startBallOn < 50 ? `OWN ${d.startBallOn}` : d.startBallOn > 50 ? `OPP ${100 - d.startBallOn}` : "50"}</td>
              <td>{d.plays}</td>
              <td>{d.yards}</td>
              <td>{d.result}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function Pbp() {
    if (!s.pbp.length) return <p className="empty">No plays yet.</p>;
    return (
      <ul className="pbp">
        {s.pbp.map((e, i) => (
          <li key={i}>
            <span className="pbp-time">Q{e.quarter} {fmtClock(e.clock)}</span>
            <span className="pbp-icon">{iconFor(e.text)}</span>
            <span className="pbp-text">{e.text}</span>
          </li>
        ))}
      </ul>
    );
  }
}

function name22(p: PlayerStats): string {
  return `#${p.number} ${p.name}`;
}

const fmtTop = (sec: number): string => {
  const m = Math.floor(sec / 60);
  return `${m}:${String(Math.round(sec) % 60).padStart(2, "0")}`;
};

/** Standard NFL passer rating (capped components). */
function passerRating(p: { att: number; comp: number; yds: number; td: number; int: number }): string {
  if (p.att === 0) return "—";
  const cap = (x: number) => Math.max(0, Math.min(2.375, x));
  const a = cap(((p.comp / p.att) - 0.3) * 5);
  const b = cap(((p.yds / p.att) - 3) * 0.25);
  const c = cap((p.td / p.att) * 20);
  const d = cap(2.375 - (p.int / p.att) * 25);
  return (((a + b + c + d) / 6) * 100).toFixed(1);
}

function Row({ k, v }: { k: string; v: number }) {
  return (
    <div className="tt-row"><span>{k}</span><span>{v}</span></div>
  );
}

function StatTable({ title, cols, rows }: { title: string; cols: string[]; rows: (string | number)[][] }) {
  return (
    <div className="stat-table">
      <div className="stat-title">{title}</div>
      <table className="data-table">
        <thead>
          <tr><th className="lcol">Player</th>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => <td key={j} className={j === 0 ? "lcol" : ""}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
