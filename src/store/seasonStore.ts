import { create } from "zustand";
import { controller, useGame } from "./gameStore";
import { loadSeason, saveSeason } from "./persistence";
import type { GameSetup } from "../controller";
import type { Gameplan } from "../sim/gameplan";
import type { League } from "../sim/rules";
import type { SeasonState } from "../season/types";
import {
  applyOffseason, championshipSeeds, commitChampionship, commitWeek,
  createSeason, startNextSeason, userInChampionship, userMatchup,
} from "../season/engine";

type View = "none" | "hub" | "offseason";

interface SeasonStore {
  season: SeasonState | null;
  view: View;
  /** True while the user is actively coaching a season game. */
  playing: boolean;
  // orientation of the game currently being played (for score mapping)
  pendingUserIsHome: boolean;
  pendingChampionship: boolean;

  newSeason: (league: League, userTeamKey: string, seed: number) => void;
  openHub: () => void;
  leaveToMenu: () => void;
  abandon: () => void;
  setUserGameplan: (plan: Gameplan) => void;
  /** Kick off the user's game for the current week / championship. */
  playGame: () => void;
  /** Quick-sim the championship when the user didn't make it. */
  simChampionship: () => void;
  /** Called from the game-over screen: record the result and advance. */
  finishGame: () => void;
  /** From the offseason screen: age everyone and start the next year. */
  nextSeason: () => void;
}

function persist(s: SeasonState): SeasonState {
  saveSeason(s);
  return s;
}

/** Configure the controller with the season rosters and kick off. */
function launchGame(s: SeasonState, userIdx: number, oppIdx: number, seedSalt: number): void {
  const user = s.teams[userIdx];
  const opp = s.teams[oppIdx];
  const seed = (s.seed ^ (s.year * 131071) ^ (s.week * 8191) ^ seedSalt) >>> 0;
  const setup: GameSetup = {
    seed,
    quarterSeconds: 300,
    difficulty: "normal",
    league: s.league,
    home: { name: user.name, abbr: user.abbr, color: user.color, strength: user.strength },
    away: { name: opp.name, abbr: opp.abbr, color: opp.color, strength: opp.strength },
    gameplan: s.userGameplan,
  };
  // User always coaches the home side; opponent roster on away.
  controller.startGame(setup, { home: user.roster, away: opp.roster });
}

export const useSeason = create<SeasonStore>((set, get) => ({
  season: loadSeason(),
  view: "none",
  playing: false,
  pendingUserIsHome: true,
  pendingChampionship: false,

  newSeason: (league, userTeamKey, seed) => {
    const s = persist(createSeason(league, userTeamKey, seed));
    set({ season: s, view: "hub", playing: false });
  },

  openHub: () => {
    const s = get().season ?? loadSeason();
    if (s) set({ season: s, view: s.phase === "offseason" ? "offseason" : "hub" });
  },

  leaveToMenu: () => set({ view: "none" }),

  abandon: () => {
    saveSeason(null);
    set({ season: null, view: "none", playing: false });
  },

  setUserGameplan: (plan) => {
    const s = get().season;
    if (!s) return;
    set({ season: persist({ ...s, userGameplan: plan }) });
  },

  playGame: () => {
    const s = get().season;
    if (!s) return;
    if (s.phase === "regular") {
      const m = userMatchup(s, s.week);
      if (!m) return;
      const userIsHome = m.home === s.userTeam;
      const oppIdx = userIsHome ? m.away : m.home;
      launchGame(s, s.userTeam, oppIdx, 0);
      set({ playing: true, pendingUserIsHome: userIsHome, pendingChampionship: false });
    } else if (s.phase === "championship" && userInChampionship(s)) {
      const [top, second] = championshipSeeds(s);
      const userIsTop = top.idx === s.userTeam;
      const oppIdx = userIsTop ? second.idx : top.idx;
      launchGame(s, s.userTeam, oppIdx, 0xc4a);
      set({ playing: true, pendingUserIsHome: userIsTop, pendingChampionship: true });
    }
  },

  simChampionship: () => {
    const s = get().season;
    if (!s || s.phase !== "championship") return;
    const after = applyOffseason(commitChampionship(s));
    set({ season: persist(after), view: "offseason" });
  },

  finishGame: () => {
    const s = get().season;
    if (!s) return;
    const g = useGame.getState();
    const userScore = g.info.score.home; // user coaches home
    const oppScore = g.info.score.away;
    let next: SeasonState;
    if (get().pendingChampionship) {
      next = applyOffseason(commitChampionship(s, userScore, oppScore));
      controller.reset();
      set({ season: persist(next), view: "offseason", playing: false });
      return;
    }
    const userIsHome = get().pendingUserIsHome;
    const homeScore = userIsHome ? userScore : oppScore;
    const awayScore = userIsHome ? oppScore : userScore;
    next = commitWeek(s, homeScore, awayScore);
    controller.reset();
    set({ season: persist(next), view: "hub", playing: false });
  },

  nextSeason: () => {
    const s = get().season;
    if (!s) return;
    set({ season: persist(startNextSeason(s)), view: "hub" });
  },
}));
