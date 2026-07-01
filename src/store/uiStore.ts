import { create } from "zustand";
import type { RostersView } from "../sim/ratingsView";

/** Ephemeral UI state (overlays) — not part of the game/sim state. */
interface UIStore {
  statsOpen: boolean;
  setStatsOpen: (b: boolean) => void;
  toggleStats: () => void;
  ratingsOpen: boolean;
  setRatingsOpen: (b: boolean) => void;
  toggleRatings: () => void;
  /** Pre-game scouting preview (from the setup screen's live selection). Null
   *  in-game, where the live controller rosters are used instead. */
  previewRosters: RostersView | null;
  openRatingsPreview: (r: RostersView) => void;
  /** Whether the next offensive call is flipped to the opposite side. */
  playFlip: boolean;
  setPlayFlip: (b: boolean) => void;
  togglePlayFlip: () => void;
  /** Mid-game coaching-adjustment overlay. */
  adjustOpen: boolean;
  setAdjustOpen: (b: boolean) => void;
}

export const useUI = create<UIStore>((set) => ({
  statsOpen: false,
  setStatsOpen: (b) => set({ statsOpen: b }),
  toggleStats: () => set((s) => ({ statsOpen: !s.statsOpen })),
  ratingsOpen: false,
  setRatingsOpen: (b) => set({ ratingsOpen: b, previewRosters: null }),
  toggleRatings: () => set((s) => ({ ratingsOpen: !s.ratingsOpen, previewRosters: null })),
  previewRosters: null,
  openRatingsPreview: (r) => set({ ratingsOpen: true, previewRosters: r }),
  playFlip: false,
  setPlayFlip: (b) => set({ playFlip: b }),
  togglePlayFlip: () => set((s) => ({ playFlip: !s.playFlip })),
  adjustOpen: false,
  setAdjustOpen: (b) => set({ adjustOpen: b }),
}));
