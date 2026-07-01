import { useState } from "react";
import { useSeason } from "../../store/seasonStore";
import { teamsForLeague } from "../../sim/teams";
import type { League } from "../../sim/rules";

const LEAGUES: { id: League; label: string }[] = [
  { id: "pro", label: "Pro" },
  { id: "college", label: "College" },
];

/** Start-a-season panel: pick your league + franchise and kick off a season. */
export function SeasonStart({ onCancel }: { onCancel: () => void }) {
  const newSeason = useSeason((s) => s.newSeason);
  const existing = useSeason((s) => s.season);
  const openHub = useSeason((s) => s.openHub);
  const abandon = useSeason((s) => s.abandon);

  const [league, setLeague] = useState<League>("pro");
  const [teamKey, setTeamKey] = useState<string>(() => teamsForLeague("pro")[0].id);
  const teams = teamsForLeague(league);

  const start = () => {
    const seed = (Math.floor(Date.now() % 2147483647) ^ 0x51ea) >>> 0;
    newSeason(league, teamKey, seed);
  };

  return (
    <div className="season-start">
      {existing && (
        <button className="resume-btn" onClick={openHub}>
          ↩ Continue your season
          <span className="resume-sub">
            {existing.teams[existing.userTeam].abbr} · Year {existing.year} · Week{" "}
            {Math.min(existing.week + 1, existing.schedule.length)}
          </span>
        </button>
      )}

      <div className="setup-section">
        <label className="setup-label">League</label>
        <div className="chip-row">
          {LEAGUES.map((l) => (
            <button
              key={l.id}
              className={`chip ${league === l.id ? "active" : ""}`}
              onClick={() => { setLeague(l.id); setTeamKey(teamsForLeague(l.id)[0].id); }}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="setup-section">
        <label className="setup-label">Your franchise</label>
        <select
          className="setup-input team-select"
          value={teamKey}
          onChange={(e) => setTeamKey(e.target.value)}
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name} · {t.strength} OVR</option>
          ))}
        </select>
        <p className="setup-hint">
          8-team league · 7-week schedule · championship · players grow and decline
          each offseason.
        </p>
      </div>

      <div className="season-start-actions">
        <button className="primary big" onClick={start}>Start Season →</button>
        <button className="ghost-btn" onClick={onCancel}>← Back to exhibition</button>
        {existing && (
          <button className="ghost-btn danger" onClick={abandon}>Delete saved season</button>
        )}
      </div>
    </div>
  );
}
