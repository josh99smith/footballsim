import { create } from "zustand";

/** Ephemeral UI state (overlays) — not part of the game/sim state. */
interface UIStore {
  statsOpen: boolean;
  setStatsOpen: (b: boolean) => void;
  toggleStats: () => void;
}

export const useUI = create<UIStore>((set) => ({
  statsOpen: false,
  setStatsOpen: (b) => set({ statsOpen: b }),
  toggleStats: () => set((s) => ({ statsOpen: !s.statsOpen })),
}));
