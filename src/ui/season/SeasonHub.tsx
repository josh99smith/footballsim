import { useState } from "react";
import { useSeason } from "../../store/seasonStore";
import { useUI } from "../../store/uiStore";
import { GameplanControls } from "../GameplanControls";
import { teamRosterView } from "../../sim/ratingsView";
import { deriveAiGameplan } from "../../sim/gameplan";
import {
  championshipSeeds, standings, teamOvr, userInChampionship, userMatchup,
} from "../../season/engine";
import type { SeasonState, StandingRow } from "../../season/types";

function record(rows: StandingRow[], idx: number): string {
  const r = rows.find((x) => x.idx === idx);
  return r ? `${r.w}-${r.l}` : "0-0";
}

export function SeasonHub() {
  const season = useSeason((s) => s.season)!;
  const playGame = useSeason((s) => s.playGame);
  const simChampionship = useSeason((s) => s.simChampionship);
  const setUserGameplan = useSeason((s) => s.setUserGameplan);
  const leaveToMenu = useSeason((s) => s.leaveToMenu);
  const openRatingsPreview = useUI((s) => s.openRatingsPreview);
  const [showPlan, setShowPlan] = useState(false);

  const table = standings(season);
  const user = season.teams[season.userTeam];
  const isChamp = season.phase === "championship";

  const scout = (oppIdx: number) => {
    openRatingsPreview({
      home: teamRosterView(user.roster, season.userGameplan),
      away: teamRosterView(season.teams[oppIdx].roster, deriveAiGameplan(season.seed ^ oppIdx)),
    });
  };

  return (
    <div className="season-hub">
      <div className="season-card panel">
        <div className="season-head">
          <div>
            <h2>{user.name}</h2>
            <p className="season-sub">
              Year {season.year} · {user.abbr} · {teamOvr(user)} OVR · {record(table, season.userTeam)}
            </p>
          </div>
          <button className="ghost-btn small" onClick={leaveToMenu}>Menu</button>
        </div>

        {isChamp ? (
          <ChampionshipCard season={season} onPlay={playGame} onSim={simChampionship} onScout={scout} />
        ) : (
          <MatchupCard
            season={season}
            table={table}
            showPlan={showPlan}
            onTogglePlan={() => setShowPlan((v) => !v)}
            onPlan={setUserGameplan}
            onPlay={playGame}
            onScout={scout}
          />
        )}

        <LastWeek season={season} />

        <div className="season-section">
          <h3 className="season-h3">Standings</h3>
          <div className="standings">
            <div className="standings-row head">
              <span className="st-team">Team</span>
              <span>OVR</span><span>W</span><span>L</span><span>Diff</span>
            </div>
            {table.map((r, i) => (
              <div
                key={r.key}
                className={`standings-row ${r.idx === season.userTeam ? "you" : ""} ${i === 1 ? "playoff-line" : ""}`}
              >
                <span className="st-team">
                  <span className="st-dot" style={{ background: r.color }} />
                  {r.abbr}
                </span>
                <span>{r.ovr}</span><span>{r.w}</span><span>{r.l}</span>
                <span className={r.diff >= 0 ? "pos" : "neg"}>{r.diff >= 0 ? "+" : ""}{r.diff}</span>
              </div>
            ))}
          </div>
          <p className="season-hint">Top 2 seeds meet in the championship.</p>
        </div>
      </div>
    </div>
  );
}

function MatchupCard({
  season, table, showPlan, onTogglePlan, onPlan, onPlay, onScout,
}: {
  season: SeasonState;
  table: StandingRow[];
  showPlan: boolean;
  onTogglePlan: () => void;
  onPlan: (p: SeasonState["userGameplan"]) => void;
  onPlay: () => void;
  onScout: (oppIdx: number) => void;
}) {
  const m = userMatchup(season, season.week);
  if (!m) return null;
  const userIsHome = m.home === season.userTeam;
  const oppIdx = userIsHome ? m.away : m.home;
  const opp = season.teams[oppIdx];
  const user = season.teams[season.userTeam];
  return (
    <div className="matchup">
      <div className="matchup-title">Week {season.week + 1} · {userIsHome ? "vs" : "@"} {opp.name}</div>
      <div className="matchup-teams">
        <Side abbr={user.abbr} color={user.color} ovr={teamOvr(user)} rec={record(table, season.userTeam)} you />
        <span className="matchup-vs">{userIsHome ? "VS" : "AT"}</span>
        <Side abbr={opp.abbr} color={opp.color} ovr={teamOvr(opp)} rec={record(table, oppIdx)} />
      </div>
      <div className="matchup-actions">
        <button className="ghost-btn" onClick={onTogglePlan}>{showPlan ? "Hide plan" : "Game plan"}</button>
        <button className="ghost-btn" onClick={() => onScout(oppIdx)}>Scout</button>
      </div>
      {showPlan && <GameplanControls value={season.userGameplan} onChange={onPlan} />}
      <button className="primary big full" onClick={onPlay}>Coach this game →</button>
    </div>
  );
}

function ChampionshipCard({
  season, onPlay, onSim, onScout,
}: {
  season: SeasonState;
  onPlay: () => void;
  onSim: () => void;
  onScout: (oppIdx: number) => void;
}) {
  const [top, second] = championshipSeeds(season);
  const userIn = userInChampionship(season);
  const oppIdx = top.idx === season.userTeam ? second.idx : top.idx;
  return (
    <div className="matchup champ">
      <div className="matchup-title">🏆 Championship</div>
      <div className="matchup-teams">
        <Side abbr={top.abbr} color={top.color} ovr={top.ovr} rec={`${top.w}-${top.l}`} you={top.idx === season.userTeam} />
        <span className="matchup-vs">VS</span>
        <Side abbr={second.abbr} color={second.color} ovr={second.ovr} rec={`${second.w}-${second.l}`} you={second.idx === season.userTeam} />
      </div>
      {userIn ? (
        <>
          <div className="matchup-actions">
            <button className="ghost-btn" onClick={() => onScout(oppIdx)}>Scout opponent</button>
          </div>
          <button className="primary big full" onClick={onPlay}>Play for the title →</button>
        </>
      ) : (
        <>
          <p className="season-hint">Your team didn't make the title game this year.</p>
          <button className="primary big full" onClick={onSim}>Watch the championship →</button>
        </>
      )}
    </div>
  );
}

function Side({ abbr, color, ovr, rec, you }: { abbr: string; color: string; ovr: number; rec: string; you?: boolean }) {
  return (
    <div className={`m-side ${you ? "you" : ""}`}>
      <span className="m-abbr" style={{ color }}>{abbr}</span>
      <span className="m-ovr">{ovr} OVR</span>
      <span className="m-rec">{rec}{you ? " · You" : ""}</span>
    </div>
  );
}

function LastWeek({ season }: { season: SeasonState }) {
  const w = season.week - 1;
  if (w < 0) return null;
  const games = season.results[w];
  if (!games || games.length === 0) return null;
  return (
    <div className="season-section">
      <h3 className="season-h3">Week {w + 1} results</h3>
      <div className="results-list">
        {games.map((g, i) => (
          <div key={i} className={`result-row ${g.user ? "you" : ""}`}>
            <span>{season.teams[g.home].abbr} {g.homeScore}</span>
            <span className="res-at">—</span>
            <span>{g.awayScore} {season.teams[g.away].abbr}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
