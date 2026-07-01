import { useSeason } from "../../store/seasonStore";
import type { ProgressEntry } from "../../season/types";

function delta(e: ProgressEntry): number {
  return e.newOvr - e.oldOvr;
}

export function OffseasonScreen() {
  const season = useSeason((s) => s.season)!;
  const nextSeason = useSeason((s) => s.nextSeason);
  const leaveToMenu = useSeason((s) => s.leaveToMenu);

  const user = season.teams[season.userTeam];
  const champ = season.championKey
    ? season.teams.find((t) => t.key === season.championKey)
    : null;
  const userWon = champ?.key === user.key;

  const report = season.lastReport;
  const retirements = report.filter((e) => e.retired);
  const active = report.filter((e) => !e.retired);
  const risers = [...active].filter((e) => delta(e) > 0).sort((a, b) => delta(b) - delta(a)).slice(0, 6);
  const fallers = [...active].filter((e) => delta(e) < 0).sort((a, b) => delta(a) - delta(b)).slice(0, 6);

  return (
    <div className="season-hub">
      <div className="season-card panel">
        <div className={`champ-banner ${userWon ? "won" : ""}`}>
          <div className="champ-trophy">🏆</div>
          <div>
            <div className="champ-title">{champ ? `${champ.name} — Champions` : "Season complete"}</div>
            <div className="champ-sub">
              {userWon ? "You won the title!" : `Year ${season.year} in the books`}
            </div>
          </div>
        </div>

        <h2 className="offseason-h">Offseason development</h2>
        <p className="season-hint">
          Your roster ages a year. The young rise toward their ceiling; veterans slow down.
        </p>

        <div className="offseason-cols">
          <ReportCol title="Risers ▲" tone="up" entries={risers} />
          <ReportCol title="Fallers ▼" tone="down" entries={fallers} />
        </div>

        {retirements.length > 0 && (
          <div className="season-section">
            <h3 className="season-h3">Retirements &amp; rookies</h3>
            <div className="retire-list">
              {retirements.map((e) => (
                <div key={e.playerId} className="retire-row">
                  <span className="rt-pos">{e.pos}</span>
                  <span className="rt-old">{e.replacedName} retired</span>
                  <span className="rt-arrow">→</span>
                  <span className="rt-new">#{e.number} {e.name} <b>{e.newOvr}</b> <em>rookie, age {e.age}</em></span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="season-start-actions">
          <button className="primary big" onClick={nextSeason}>Start Year {season.year + 1} →</button>
          <button className="ghost-btn" onClick={leaveToMenu}>Menu</button>
        </div>
      </div>
    </div>
  );
}

function ReportCol({ title, tone, entries }: { title: string; tone: "up" | "down"; entries: ProgressEntry[] }) {
  return (
    <div className="report-col">
      <h4 className={`report-h ${tone}`}>{title}</h4>
      {entries.length === 0 && <p className="report-empty">—</p>}
      {entries.map((e) => {
        const d = e.newOvr - e.oldOvr;
        return (
          <div key={e.playerId} className="report-row">
            <span className="rr-pos">{e.pos}</span>
            <span className="rr-name">{e.name}</span>
            <span className="rr-age">a{e.age}</span>
            <span className="rr-ovr">{e.oldOvr}→{e.newOvr}</span>
            <span className={`rr-d ${tone}`}>{d > 0 ? "+" : ""}{d}</span>
          </div>
        );
      })}
    </div>
  );
}
