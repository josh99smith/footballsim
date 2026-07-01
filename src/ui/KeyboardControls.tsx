import { useEffect } from "react";
import { useGame } from "../store/gameStore";
import { useUI } from "../store/uiStore";
import { OFF_PLAYS, DEF_PLAYS } from "../sim/playbook";
import type { Speed } from "../controller";
import { sound } from "../audio/sound";

const SPEED_ORDER: Speed[] = ["pause", "0.5", "1", "2", "4", "instant"];

/**
 * Global keyboard shortcuts. Mounts once; reads fresh state on each keydown so
 * there are no stale closures. Ignores keys while typing in an input.
 */
export function KeyboardControls() {
  useEffect(() => {
    let lastNonPause: Speed = "1";

    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;

      const g = useGame.getState();
      const key = e.key;

      // Speed (any in-game phase).
      if (key === " ") {
        e.preventDefault();
        if (g.speed === "pause") g.setSpeed(lastNonPause);
        else { lastNonPause = g.speed; g.setSpeed("pause"); }
        return;
      }
      if (key === "ArrowRight" || key === "ArrowLeft") {
        const i = SPEED_ORDER.indexOf(g.speed);
        const ni = Math.max(0, Math.min(SPEED_ORDER.length - 1, i + (key === "ArrowRight" ? 1 : -1)));
        g.setSpeed(SPEED_ORDER[ni]);
        if (SPEED_ORDER[ni] !== "pause") lastNonPause = SPEED_ORDER[ni];
        return;
      }
      if (key === "i" || key === "I") { g.setSpeed("instant"); return; }
      if (key === "m" || key === "M") { sound.setMuted(!sound.muted); return; }

      // Conversion choice.
      if (g.awaitingConversion) {
        if (key === "x" || key === "X") g.convert("xp");
        else if (key === "2") g.convert("two");
        return;
      }

      // Play selection.
      if (g.phase === "preSnap" && g.callSide) {
        const list = g.callSide === "offense" ? OFF_PLAYS : DEF_PLAYS;
        const lowerKey = key.toLowerCase();
        // Flip the next offensive call.
        if (lowerKey === "f" && g.callSide === "offense") { useUI.getState().togglePlayFlip(); return; }
        const n = Number(key);
        if (Number.isInteger(n) && n >= 1 && n <= list.length) {
          const id = list[n - 1].id;
          if (g.callSide === "offense") {
            g.pickOffense(id, useUI.getState().playFlip);
            useUI.getState().setPlayFlip(false);
          } else g.pickDefense(id);
          return;
        }
        const lower = key.toLowerCase();
        if (g.callSide === "offense") {
          if (lower === "p") g.specialTeams("punt");
          else if (lower === "g") g.specialTeams("fieldGoal");
          else if (lower === "k") g.clockPlay("kneel");
          else if (lower === "s") g.clockPlay("spike");
        }
        if (lower === "t") g.timeout();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return null;
}
