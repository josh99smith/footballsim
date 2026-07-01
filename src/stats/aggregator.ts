import type { CommitOutcome } from "../sim/game";
import type { Team } from "../sim/roster";
import type { Agent, PlayerDef, PlayResult, TeamId } from "../sim/types";

export interface PassLine { att: number; comp: number; yds: number; td: number; int: number; }
export interface RushLine { att: number; yds: number; td: number; long: number; }
export interface RecvLine { rec: number; yds: number; td: number; long: number; }
export interface DefLine { tackles: number; sacks: number; ints: number; }

export interface PlayerStats {
  defId: string;
  name: string;
  number: number;
  pos: string;
  teamId: TeamId;
  pass?: PassLine;
  rush?: RushLine;
  recv?: RecvLine;
  def?: DefLine;
}

export interface TeamTotals {
  plays: number;
  totalYards: number;
  passYards: number;
  rushYards: number;
  firstDowns: number;
  turnovers: number;
  sacks: number; // sacks made by this team's defense
  points: number;
  topSeconds: number; // time of possession (seconds)
  penalties: number;
  penaltyYards: number;
}

export interface DriveSummary {
  team: TeamId;
  startBallOn: number;
  plays: number;
  yards: number;
  result: string;
  open: boolean;
}

const emptyTotals = (): TeamTotals => ({
  plays: 0, totalYards: 0, passYards: 0, rushYards: 0,
  firstDowns: 0, turnovers: 0, sacks: 0, points: 0, topSeconds: 0,
  penalties: 0, penaltyYards: 0,
});

export class StatsAggregator {
  private players = new Map<string, PlayerStats>();
  private defLookup = new Map<string, { def: PlayerDef; teamId: TeamId }>();
  totals: Record<TeamId, TeamTotals> = { home: emptyTotals(), away: emptyTotals() };
  drives: DriveSummary[] = [];

  constructor(teams: { home: Team; away: Team }) {
    // Key by the home/away slot, not team.id — season rosters carry library
    // ids (e.g. "kc"), so relying on team.id would misfile every player.
    for (const side of ["home", "away"] as const) {
      const team = teams[side];
      for (const p of [...team.offense, ...team.defense]) {
        this.defLookup.set(p.id, { def: p, teamId: side });
      }
    }
  }

  private line(defId: string): PlayerStats {
    let s = this.players.get(defId);
    if (!s) {
      const info = this.defLookup.get(defId)!;
      s = {
        defId,
        name: info.def.name,
        number: info.def.number,
        pos: info.def.pos,
        teamId: info.teamId,
      };
      this.players.set(defId, s);
    }
    return s;
  }

  private resolve(agents: ReadonlyArray<Agent>, agentId?: string): string | null {
    if (!agentId) return null;
    return agents.find((a) => a.id === agentId)?.defId ?? null;
  }

  recordScores(home: number, away: number): void {
    this.totals.home.points = home;
    this.totals.away.points = away;
  }

  recordTop(home: number, away: number): void {
    this.totals.home.topSeconds = home;
    this.totals.away.topSeconds = away;
  }

  recordPenalty(team: TeamId, yards: number): void {
    this.totals[team].penalties++;
    this.totals[team].penaltyYards += yards;
  }

  /** Record a completed scrimmage play. */
  recordScrimmage(
    offTeamId: TeamId,
    defTeamId: TeamId,
    agents: ReadonlyArray<Agent>,
    result: PlayResult,
    commit: CommitOutcome,
    startBallOn: number,
  ): void {
    const ot = this.totals[offTeamId];
    ot.plays++;

    const passer = this.resolve(agents, result.passerId);
    const carrier = this.resolve(agents, result.ballCarrierId);
    const tackler = this.resolve(agents, result.tacklerId);
    const interceptor = this.resolve(agents, result.interceptorId);
    const sacker = this.resolve(agents, result.sackerId);

    const yds = Math.round(result.yards);

    if (result.endReason === "sack") {
      this.totals[defTeamId].sacks++;
      if (passer) {
        const l = this.line(passer);
        l.pass ??= { att: 0, comp: 0, yds: 0, td: 0, int: 0 };
      }
      if (sacker) {
        const d = this.line(sacker);
        d.def ??= { tackles: 0, sacks: 0, ints: 0 };
        d.def.sacks++;
        d.def.tackles++;
      }
    } else if (result.isPass) {
      if (passer) {
        const l = this.line(passer);
        l.pass ??= { att: 0, comp: 0, yds: 0, td: 0, int: 0 };
        l.pass.att++;
        if (result.passResult === "complete" || (!result.passResult && yds !== 0 && carrier)) {
          l.pass.comp++;
          l.pass.yds += yds;
          ot.passYards += yds;
          if (result.touchdown) l.pass.td++;
        }
        if (result.passResult === "intercepted") l.pass.int++;
      }
      if (result.passResult === "complete" && carrier) {
        const r = this.line(carrier);
        r.recv ??= { rec: 0, yds: 0, td: 0, long: 0 };
        r.recv.rec++;
        r.recv.yds += yds;
        r.recv.long = Math.max(r.recv.long, yds);
        if (result.touchdown) r.recv.td++;
      }
      if (interceptor) {
        const d = this.line(interceptor);
        d.def ??= { tackles: 0, sacks: 0, ints: 0 };
        d.def.ints++;
      }
    } else {
      // Run.
      if (carrier) {
        const r = this.line(carrier);
        r.rush ??= { att: 0, yds: 0, td: 0, long: 0 };
        r.rush.att++;
        r.rush.yds += yds;
        r.rush.long = Math.max(r.rush.long, yds);
        ot.rushYards += yds;
        if (result.touchdown) r.rush.td++;
      }
    }

    ot.totalYards += yds;
    if (commit.firstDown) ot.firstDowns++;
    if (result.turnover) ot.turnovers++;

    if (tackler && result.endReason !== "sack") {
      const d = this.line(tackler);
      d.def ??= { tackles: 0, sacks: 0, ints: 0 };
      d.def.tackles++;
    }

    this.updateDrive(offTeamId, yds, commit, startBallOn);
  }

  /** Special-teams plays (punt/FG) close out a drive. */
  recordSpecialTeams(offTeamId: TeamId, label: string): void {
    const d = this.currentDrive(offTeamId, 0);
    d.result = label;
    d.open = false;
  }

  private currentDrive(team: TeamId, startBallOn: number): DriveSummary {
    const last = this.drives[this.drives.length - 1];
    if (last && last.open && last.team === team) return last;
    const fresh: DriveSummary = {
      team, startBallOn, plays: 0, yards: 0, result: "—", open: true,
    };
    this.drives.push(fresh);
    return fresh;
  }

  private updateDrive(team: TeamId, yds: number, commit: CommitOutcome, startBallOn: number): void {
    const d = this.currentDrive(team, startBallOn);
    d.plays++;
    d.yards += yds;
    if (commit.isScore) {
      d.result = commit.isScore.type === "TD" ? "Touchdown" : commit.isScore.type;
      d.open = false;
    } else if (commit.changedPossession) {
      d.result = commit.text.includes("INTERCEPT")
        ? "Interception"
        : commit.text.includes("downs")
          ? "Downs"
          : "Turnover";
      d.open = false;
    }
  }

  playerRows(teamId: TeamId): PlayerStats[] {
    return [...this.players.values()].filter((p) => p.teamId === teamId);
  }
}
