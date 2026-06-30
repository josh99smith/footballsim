import { create } from "zustand";
import { GameController, type GameSetup, type Speed, type UIState } from "../controller";
import type { Philosophy } from "../sim/coordinator";
import { DEFAULT_CONFIG } from "../sim/game";

const INITIAL_SEED = 0x5eed1234;

/** The controller lives outside React. The store only mirrors discrete state. */
export const controller = new GameController(INITIAL_SEED, DEFAULT_CONFIG);

interface StoreState extends UIState {
  // actions
  pickOffense: (id: string) => void;
  pickDefense: (id: string) => void;
  specialTeams: (kind: "punt" | "fieldGoal") => void;
  clockPlay: (kind: "kneel" | "spike") => void;
  timeout: () => void;
  convert: (kind: "xp" | "two") => void;
  setSpeed: (s: Speed) => void;
  setPhilosophy: (p: Partial<Philosophy>) => void;
  startGame: (setup: GameSetup) => void;
  newGame: () => void;
}

function initial(): UIState {
  // Seeded snapshot before the controller wires its callback.
  return {
    phase: "setup",
    info: {
      quarter: 1, clock: DEFAULT_CONFIG.quarterSeconds, possession: "home",
      down: 1, distance: 10, ballOn: 25, score: { home: 0, away: 0 }, gameOver: false,
      timeouts: { home: 3, away: 3 }, pendingConversion: null,
    },
    banner: null,
    homeName: "", awayName: "", homeAbbr: "", awayAbbr: "",
    homeColor: "#2e6fdb", awayColor: "#d94a3d",
    userTeam: "home", callSide: "offense", isFourthDown: false,
    aiCallName: null, lastPlayText: "", speed: "1",
    philosophy: { aggression: 0.5, passLean: 0.5, blitzFreq: 0.4, tempo: 0.5, risk: 0.5 },
    pbp: [], winner: null,
    seed: 0x5eed1234, difficulty: "normal", quarterSeconds: DEFAULT_CONFIG.quarterSeconds,
    awaitingConversion: false,
  };
}

export const useGame = create<StoreState>(() => ({
  ...initial(),
  pickOffense: (id) => controller.userPickOffense(id),
  pickDefense: (id) => controller.userPickDefense(id),
  specialTeams: (kind) => controller.userSpecialTeams(kind),
  clockPlay: (kind) => controller.userClockPlay(kind),
  timeout: () => controller.userTimeout(),
  convert: (kind) => controller.userConvert(kind),
  setSpeed: (s) => controller.setSpeed(s),
  setPhilosophy: (p) => controller.setPhilosophy(p),
  startGame: (setup) => controller.startGame(setup),
  newGame: () => controller.reset(),
}));

// Wire controller -> store. Discrete updates only (not per-frame motion).
controller.onChange((s: UIState) => {
  useGame.setState(s);
});
