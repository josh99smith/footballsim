import type { GameSave } from "../controller";

const SAVE_KEY = "gridiron.save.v1";
const RECENTS_KEY = "gridiron.recents.v1";

export interface RecentResult {
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number;
  awayScore: number;
  seed: number;
  when: number; // epoch ms
}

const hasStorage = (): boolean => {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
};

export function saveGame(save: GameSave | null): void {
  if (!hasStorage()) return;
  try {
    if (save) localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    else localStorage.removeItem(SAVE_KEY);
  } catch {
    /* quota / privacy mode — ignore */
  }
}

export function loadGame(): GameSave | null {
  if (!hasStorage()) return null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as GameSave) : null;
  } catch {
    return null;
  }
}

export function clearSavedGame(): void {
  if (!hasStorage()) return;
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export function addRecent(r: RecentResult): void {
  if (!hasStorage()) return;
  try {
    const list = getRecents();
    list.unshift(r);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, 8)));
  } catch {
    /* ignore */
  }
}

export function getRecents(): RecentResult[] {
  if (!hasStorage()) return [];
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as RecentResult[]) : [];
  } catch {
    return [];
  }
}

/** Encode a save as a portable, shareable game code (base64 JSON). */
export function encodeCode(save: GameSave): string {
  const json = JSON.stringify(save);
  return btoa(unescape(encodeURIComponent(json)));
}

export function decodeCode(code: string): GameSave | null {
  try {
    const json = decodeURIComponent(escape(atob(code.trim())));
    const save = JSON.parse(json) as GameSave;
    if (!save || !save.setup || !Array.isArray(save.inputs)) return null;
    return save;
  } catch {
    return null;
  }
}
