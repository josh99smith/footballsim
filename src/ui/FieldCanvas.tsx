import { useEffect, useRef } from "react";
import { controller } from "../store/gameStore";
import { drawField } from "../render/field";

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
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      controller.advance(dt);
      const frame = controller.renderFrame();
      const rect = wrap.getBoundingClientRect();
      drawField(ctx, rect.width, rect.height, frame, {
        homeColor: frame?.homeColor ?? "#2e6fdb",
        awayColor: frame?.awayColor ?? "#d94a3d",
        homeEndzone: withAlpha(frame?.homeColor ?? "#2e6fdb", 0.55),
        awayEndzone: withAlpha(frame?.awayColor ?? "#d94a3d", 0.55),
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="field-wrap" ref={wrapRef}>
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
