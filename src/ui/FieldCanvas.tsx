import { useEffect, useRef } from "react";
import { controller, useGame } from "../store/gameStore";
import { drawField, type Camera } from "../render/field";
import type { RenderFrame } from "../controller";
import { FIELD } from "../sim/constants";
import { sound } from "../audio/sound";

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Auto-framing follow camera: frame the bounding box of the players + ball so
 *  zoom adapts to the spread of the action and it always stays centred. */
function cameraTarget(frame: RenderFrame | null, w: number, h: number): Camera {
  if (!frame || frame.agents.length === 0) {
    return { cx: 60, cy: FIELD.WIDTH / 2, viewH: 118 };
  }
  let minD = Infinity, maxD = -Infinity, minW = Infinity, maxW = -Infinity;
  const note = (dx: number, wy: number) => {
    minD = Math.min(minD, dx); maxD = Math.max(maxD, dx);
    minW = Math.min(minW, wy); maxW = Math.max(maxW, wy);
  };
  for (const a of frame.agents) note(a.x, a.y);
  note(frame.ball.x, frame.ball.y);
  // Always keep the line of scrimmage and first-down marker in view.
  note(frame.losAbs, FIELD.WIDTH / 2);
  note(frame.firstDownAbs, FIELD.WIDTH / 2);

  const padD = 9, padW = 6;
  const boxD = maxD - minD + padD * 2;
  const boxW = maxW - minW + padW * 2;
  const aspect = (h - 8) / w; // screen yards-per-px ratio helper
  // viewH must fit the downfield box AND the lateral box given the screen shape.
  let viewH = Math.max(boxD, boxW * aspect);
  viewH = clamp(viewH, 42, 118);

  const scale = (h - 8) / viewH;
  const visW = w / scale; // visible width in yards
  let cy = (minW + maxW) / 2;
  cy = visW >= FIELD.WIDTH ? FIELD.WIDTH / 2 : clamp(cy, visW / 2, FIELD.WIDTH - visW / 2);
  // Keep the action centred even at the goal lines, allowing a little OOB.
  const cx = clamp((minD + maxD) / 2, viewH / 2 - 12, 120 - viewH / 2 + 12);
  return { cx, cy, viewH };
}

/**
 * Owns the requestAnimationFrame loop. Reads sim state straight from the
 * controller each frame — never through React state — so per-frame motion
 * never triggers a re-render.
 */
export function FieldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let last = performance.now();

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = wrap.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    // Redraw is needed on resize and whenever discrete state changes; between
    // plays the scene is static, so we idle instead of repainting at 60fps.
    let dirty = true;
    const markDirty = () => { dirty = true; };
    resize();
    markDirty();
    const ro = new ResizeObserver(() => { resize(); markDirty(); });
    ro.observe(wrap);
    const unsub = useGame.subscribe(markDirty);

    const cam: Camera = { cx: 60, cy: FIELD.WIDTH / 2, viewH: 118 };
    let camReady = false;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let shake = 0; // px
    let punch = 1; // viewH multiplier (zoom punch on scores)

    // Ease the camera toward its target; returns true while still moving.
    const stepCamera = (frame: RenderFrame | null, w: number, h: number): boolean => {
      const t = cameraTarget(frame, w, h);
      if (!camReady) { cam.cx = t.cx; cam.cy = t.cy; cam.viewH = t.viewH; camReady = true; return false; }
      // Snap on big jumps (new spot / possession change) to avoid long pans.
      if (Math.abs(t.cx - cam.cx) > 45 || Math.abs(t.viewH - cam.viewH) > 45) {
        cam.cx = t.cx; cam.cy = t.cy; cam.viewH = t.viewH; return false;
      }
      const k = 0.14;
      cam.cx += (t.cx - cam.cx) * k;
      cam.cy += (t.cy - cam.cy) * k;
      cam.viewH += (t.viewH - cam.viewH) * k;
      return Math.abs(t.cx - cam.cx) + Math.abs(t.cy - cam.cy) + Math.abs(t.viewH - cam.viewH) > 0.15;
    };

    const draw = (time: number) => {
      const frame = controller.renderFrame();
      const rect = wrap.getBoundingClientRect();
      const moving = stepCamera(frame, rect.width, rect.height);
      const drawn: Camera = { cx: cam.cx, cy: cam.cy, viewH: cam.viewH * punch };
      const ms = time * 1000;
      const ox = shake > 0.2 ? shake * Math.sin(ms * 0.05) : 0;
      const oy = shake > 0.2 ? shake * Math.cos(ms * 0.043) : 0;
      ctx.save();
      ctx.translate(ox, oy);
      drawField(ctx, rect.width, rect.height, frame, {
        homeColor: frame?.homeColor ?? "#2e6fdb",
        awayColor: frame?.awayColor ?? "#d94a3d",
        homeEndzone: withAlpha(frame?.homeColor ?? "#2e6fdb", 0.5),
        awayEndzone: withAlpha(frame?.awayColor ?? "#d94a3d", 0.5),
        homeAbbr: frame?.homeAbbr ?? "",
        awayAbbr: frame?.awayAbbr ?? "",
      }, drawn, time);
      ctx.restore();
      // decay
      shake *= 0.84;
      punch += (1 - punch) * 0.12;
      const animating = shake > 0.2 || Math.abs(punch - 1) > 0.01;
      return moving || animating;
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      controller.advance(dt);
      for (const cue of controller.takeSoundCues()) {
        sound.play(cue);
        if (!reduceMotion) {
          if (cue === "hit") shake = Math.max(shake, 4);
          else if (cue === "turnover") shake = Math.max(shake, 6);
          else if (cue === "cheer") { shake = Math.max(shake, 9); punch = 0.82; }
        }
      }
      if (controller.needsContinuousRender() || dirty) {
        const more = draw(now / 1000);
        dirty = more; // keep painting until camera/shake/punch settle
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      unsub();
    };
  }, []);

  return (
    <div
      className="field-layer"
      ref={wrapRef}
      role="img"
      aria-label="2D football field showing the current play"
    >
      <canvas ref={canvasRef} />
    </div>
  );
}

function withAlpha(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}
