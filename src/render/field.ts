import type { RenderFrame } from "../controller";
import { FIELD } from "../sim/constants";

export interface DrawOpts {
  homeColor: string;
  awayColor: string;
  homeEndzone: string;
  awayEndzone: string;
  homeAbbr: string;
  awayAbbr: string;
}

/** Follow camera, in FIELD units. cx = downfield centre (0..120),
 *  cy = width centre (0..53.33), viewH = downfield yards visible (zoom). */
export interface Camera {
  cx: number;
  cy: number;
  viewH: number;
}

/**
 * Draws the field PORTRAIT (downfield runs vertically) and the current frame.
 * Pure consumer of sim state — reads the frame, never writes back.
 *
 * A follow camera pans/zooms so the action stays centred and large; anything
 * outside the field shows as dark out-of-bounds, so goal-line plays read clearly.
 * Downfield x (0..120) -> vertical screen axis (x=0 home goal at the BOTTOM);
 * width y (0..53.33) -> horizontal screen axis.
 */
export function drawField(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  frame: RenderFrame | null,
  opts: DrawOpts,
  cam: Camera,
  time = 0,
): void {
  // Out-of-bounds backdrop (visible past the sidelines / end lines).
  ctx.fillStyle = "#0a1a12";
  ctx.fillRect(0, 0, w, h);

  const scale = (h - 8) / cam.viewH;
  const fieldW = FIELD.WIDTH * scale;
  const fieldH = FIELD.TOTAL_LENGTH * scale;

  // width yard -> screen X; downfield yard -> screen Y (inverted, up = +downfield)
  const X = (yd: number): number => w / 2 + (yd - cam.cy) * scale;
  const Y = (down: number): number => h / 2 - (down - cam.cx) * scale;

  // Turf.
  ctx.fillStyle = "#1f7a3d";
  ctx.fillRect(X(0), Y(FIELD.TOTAL_LENGTH), fieldW, fieldH);

  // 10-yard mowing stripes (run across the field, stacked vertically).
  for (let yd = FIELD.END_ZONE; yd < FIELD.TOTAL_LENGTH - FIELD.END_ZONE; yd += 10) {
    ctx.fillStyle = (yd / 10) % 2 === 0 ? "#1c7038" : "#218040";
    ctx.fillRect(X(0), Y(yd + 10), fieldW, 10 * scale);
  }

  // Stadium lighting: a soft warm sheen sweeps the turf for depth, brightest
  // toward the top-centre (as if lit from the near stands).
  ctx.save();
  ctx.beginPath();
  ctx.rect(X(0), Y(FIELD.TOTAL_LENGTH), fieldW, fieldH);
  ctx.clip();
  const turfLight = ctx.createRadialGradient(
    w / 2, h * 0.34, 0, w / 2, h * 0.34, Math.max(w, h) * 0.75,
  );
  turfLight.addColorStop(0, "rgba(180,255,205,0.12)");
  turfLight.addColorStop(0.5, "rgba(120,220,160,0.04)");
  turfLight.addColorStop(1, "rgba(0,20,10,0.16)");
  ctx.fillStyle = turfLight;
  ctx.fillRect(X(0), Y(FIELD.TOTAL_LENGTH), fieldW, fieldH);
  ctx.restore();

  // End zones (home at the bottom, away at the top), with team names.
  const drawEndzone = (fill: string, topYd: number) => {
    ctx.fillStyle = fill;
    ctx.fillRect(X(0), Y(topYd), fieldW, FIELD.END_ZONE * scale);
    // Diagonal sheen for a painted-turf look.
    const sheen = ctx.createLinearGradient(X(0), Y(topYd), X(FIELD.WIDTH), Y(topYd - FIELD.END_ZONE));
    sheen.addColorStop(0, "rgba(255,255,255,0.10)");
    sheen.addColorStop(0.5, "rgba(255,255,255,0.02)");
    sheen.addColorStop(1, "rgba(0,0,0,0.14)");
    ctx.fillStyle = sheen;
    ctx.fillRect(X(0), Y(topYd), fieldW, FIELD.END_ZONE * scale);
  };
  drawEndzone(opts.homeEndzone, FIELD.END_ZONE);
  drawEndzone(opts.awayEndzone, FIELD.TOTAL_LENGTH);
  if (opts.homeAbbr || opts.awayAbbr) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = `900 ${Math.round(scale * 5)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = scale * 1.2;
    ctx.fillText(opts.homeAbbr, X(FIELD.WIDTH / 2), Y(FIELD.END_ZONE / 2));
    ctx.fillText(opts.awayAbbr, X(FIELD.WIDTH / 2), Y(FIELD.TOTAL_LENGTH - FIELD.END_ZONE / 2));
    ctx.restore();
  }

  // Goalposts on each end line (stylised top-down slingshot).
  drawGoalpost(ctx, X, Y, scale, 0, 1);
  drawGoalpost(ctx, X, Y, scale, FIELD.TOTAL_LENGTH, -1);

  // Midfield logo ring at the 50.
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = Math.max(1, scale * 0.4);
  ctx.beginPath();
  ctx.arc(X(FIELD.WIDTH / 2), Y(60), scale * 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Yard lines + numbers.
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = `${Math.round(scale * 4)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let yd = FIELD.END_ZONE; yd <= FIELD.TOTAL_LENGTH - FIELD.END_ZONE; yd += 5) {
    ctx.beginPath();
    ctx.moveTo(X(0), Y(yd));
    ctx.lineTo(X(FIELD.WIDTH), Y(yd));
    ctx.stroke();
    const fromGoal = yd - FIELD.END_ZONE;
    if (fromGoal % 10 === 0 && fromGoal > 0 && fromGoal < 100) {
      const num = fromGoal <= 50 ? fromGoal : 100 - fromGoal;
      ctx.fillText(String(num), X(8), Y(yd));
      ctx.fillText(String(num), X(FIELD.WIDTH - 8), Y(yd));
    }
  }

  // Hash marks (two columns running down the field).
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  for (let yd = FIELD.END_ZONE; yd <= FIELD.TOTAL_LENGTH - FIELD.END_ZONE; yd += 1) {
    for (const hx of [FIELD.HASH, FIELD.WIDTH - FIELD.HASH]) {
      ctx.beginPath();
      ctx.moveTo(X(hx) - scale * 0.5, Y(yd));
      ctx.lineTo(X(hx) + scale * 0.5, Y(yd));
      ctx.stroke();
    }
  }

  // Bold goal lines.
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = Math.max(1.5, scale * 0.5);
  for (const gl of [FIELD.END_ZONE, FIELD.TOTAL_LENGTH - FIELD.END_ZONE]) {
    ctx.beginPath();
    ctx.moveTo(X(0), Y(gl));
    ctx.lineTo(X(FIELD.WIDTH), Y(gl));
    ctx.stroke();
  }

  // Sideline border.
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(X(0), Y(FIELD.TOTAL_LENGTH), fieldW, fieldH);

  // Pylons at the four corners of the playing field.
  ctx.fillStyle = "#ff8a1e";
  const pyl = Math.max(2, scale * 0.7);
  for (const gx of [0, FIELD.WIDTH]) {
    for (const gy of [FIELD.END_ZONE, FIELD.TOTAL_LENGTH - FIELD.END_ZONE]) {
      ctx.fillRect(X(gx) - pyl / 2, Y(gy) - pyl / 2, pyl, pyl);
    }
  }

  if (!frame) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = `${Math.round(scale * 4)}px system-ui, sans-serif`;
    ctx.fillText("Pick a play to snap", X(FIELD.WIDTH / 2), Y(60));
    return;
  }

  // Line of scrimmage (glowing blue) & first-down marker (TV-style yellow).
  ctx.save();
  ctx.lineCap = "round";
  ctx.shadowBlur = scale * 1.2;
  ctx.lineWidth = Math.max(2, scale * 0.45);
  ctx.shadowColor = "rgba(30,107,255,0.9)";
  ctx.strokeStyle = "#3b82ff";
  ctx.beginPath();
  ctx.moveTo(X(0), Y(frame.losAbs));
  ctx.lineTo(X(FIELD.WIDTH), Y(frame.losAbs));
  ctx.stroke();

  const fd = frame.firstDownAbs;
  if (fd > FIELD.END_ZONE && fd < FIELD.TOTAL_LENGTH - FIELD.END_ZONE) {
    ctx.shadowColor = "rgba(255,210,30,0.9)";
    ctx.strokeStyle = "#ffd21e";
    ctx.beginPath();
    ctx.moveTo(X(0), Y(fd));
    ctx.lineTo(X(FIELD.WIDTH), Y(fd));
    ctx.stroke();
  }
  ctx.restore();

  const r = scale * 1.35;
  // map a field point (downfield, width) -> screen
  const sx = (p: { x: number; y: number }) => X(p.y);
  const sy = (p: { x: number; y: number }) => Y(p.x);

  // Route lines (pre-snap / early): dashed, beneath everything.
  if (frame.showRoutes) {
    ctx.save();
    ctx.setLineDash([scale * 1.4, scale * 1.2]);
    ctx.lineWidth = Math.max(1, scale * 0.45);
    for (const route of frame.routes) {
      if (route.points.length < 2) continue;
      ctx.strokeStyle = withAlpha(route.color, 0.55);
      ctx.beginPath();
      ctx.moveTo(sx(route.points[0]), sy(route.points[0]));
      for (let i = 1; i < route.points.length; i++) ctx.lineTo(sx(route.points[i]), sy(route.points[i]));
      ctx.stroke();
      const p1 = route.points[route.points.length - 2];
      const p2 = route.points[route.points.length - 1];
      drawArrowHead(ctx, sx(p1), sy(p1), sx(p2), sy(p2), scale * 1.3, withAlpha(route.color, 0.8));
    }
    ctx.restore();
  }

  // Motion trails.
  ctx.save();
  ctx.lineCap = "round";
  for (const trail of frame.trails) {
    const pts = trail.points;
    for (let i = 1; i < pts.length; i++) {
      const t = i / pts.length;
      ctx.strokeStyle = withAlpha(trail.color, t * 0.35);
      ctx.lineWidth = scale * 0.9 * t;
      ctx.beginPath();
      ctx.moveTo(sx(pts[i - 1]), sy(pts[i - 1]));
      ctx.lineTo(sx(pts[i]), sy(pts[i]));
      ctx.stroke();
    }
  }
  ctx.restore();

  // Player ground shadows first (so tokens sit above all shadows).
  for (const a of frame.agents) {
    ctx.beginPath();
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.ellipse(X(a.y) + scale * 0.4, Y(a.x) + scale * 0.7, r * 1.0, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Players.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const pulse = 0.5 + 0.5 * Math.sin(time * 7);
  for (const a of frame.agents) {
    const cx = X(a.y);
    const cy = Y(a.x);

    if (a.hasBall) {
      ctx.beginPath();
      ctx.fillStyle = `rgba(255,210,30,${(0.18 + pulse * 0.22).toFixed(3)})`;
      ctx.arc(cx, cy, r + scale * (1.3 + pulse * 0.9), 0, Math.PI * 2);
      ctx.fill();
    }

    const light = shade(a.color, 1.35);
    const dark = shade(a.color, 0.7);
    if (a.side === "off") {
      const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.1);
      g.addColorStop(0, light);
      g.addColorStop(1, dark);
      ctx.beginPath();
      ctx.fillStyle = g;
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1, scale * 0.28);
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.stroke();
      // A small facing tick so ball-handlers/blockers show their heading too.
      if (a.moving) {
        const hd = Math.atan2(-a.vx, a.vy);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(hd);
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.beginPath();
        ctx.moveTo(r * 1.02, 0);
        ctx.lineTo(r * 0.52, r * 0.34);
        ctx.lineTo(r * 0.52, -r * 0.34);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    } else {
      const screenHeading = a.moving ? Math.atan2(-a.vx, a.vy) : -Math.PI / 2;
      drawChevron(ctx, cx, cy, r * 1.28, screenHeading);
      const g = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
      g.addColorStop(0, light);
      g.addColorStop(1, dark);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = Math.max(1, scale * 0.28);
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.stroke();
    }

    // Glossy top rim-light so tokens read as 3D beads under the lights.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx - r * 0.28, cy - r * 0.34, r * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.round(scale * 1.55)}px system-ui, sans-serif`;
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = scale * 0.6;
    ctx.fillText(String(a.number), cx, cy);
    ctx.shadowBlur = 0;
  }

  // Ball in flight: football with laces + spin + lift shadow.
  if (frame.flight) {
    const f = frame.flight;
    const px = { x: f.fromX + (f.toX - f.fromX) * f.progress, y: f.fromY + (f.toY - f.fromY) * f.progress };
    const flightDist = Math.hypot(f.toX - f.fromX, f.toY - f.fromY);
    const lift = Math.sin(f.progress * Math.PI) * Math.min(scale * 10, flightDist * scale * 0.2);

    ctx.save();
    ctx.setLineDash([scale * 1.2, scale * 1.4]);
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X(f.fromY), Y(f.fromX));
    ctx.lineTo(X(f.toY), Y(f.toX));
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.ellipse(X(px.y), Y(px.x), r * 0.55 + lift * 0.05, r * 0.7 + lift * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
    drawFootball(ctx, X(px.y), Y(px.x) - lift, r * 0.95, time * 9);
  } else if (frame.ball.inAir) {
    drawFootball(ctx, X(frame.ball.y), Y(frame.ball.x), r * 0.95, 0);
  }

  for (const fx of frame.effects) drawEffect(ctx, X(fx.y), Y(fx.x), fx, scale, frame.dir);

  // Two soft stadium light pools sweeping the field for atmosphere.
  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  for (const [px, py, rad, str] of [
    [w * 0.3, h * 0.22, 0.5, 0.16],
    [w * 0.72, h * 0.6, 0.55, 0.12],
  ] as const) {
    const pool = ctx.createRadialGradient(px, py, 0, px, py, Math.max(w, h) * rad);
    pool.addColorStop(0, `rgba(255,255,240,${str})`);
    pool.addColorStop(1, "rgba(255,255,240,0)");
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();

  // Red-zone atmosphere: the sidelines glow warm when the offense threatens.
  if (frame?.redZone) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 3);
    const rz = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.34, w / 2, h / 2, Math.max(w, h) * 0.75);
    rz.addColorStop(0, "rgba(0,0,0,0)");
    rz.addColorStop(1, `rgba(220,40,30,${(0.14 + pulse * 0.08).toFixed(3)})`);
    ctx.fillStyle = rz;
    ctx.fillRect(0, 0, w, h);
  }

  // Subtle edge vignette for a broadcast look.
  const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.74);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(0.7, "rgba(0,0,0,0.14)");
  vig.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}

/** Stylised top-down goalpost on an end line. `into` = +1/-1 points the
 *  uprights toward the field of play. */
function drawGoalpost(
  ctx: CanvasRenderingContext2D,
  X: (yd: number) => number,
  Y: (down: number) => number,
  scale: number,
  endYd: number,
  into: 1 | -1,
): void {
  const cw = 3.08; // half goalpost width in yards (~6.16yd total)
  const cx = FIELD.WIDTH / 2;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#f5c518";
  ctx.shadowColor = "rgba(245,197,24,0.6)";
  ctx.shadowBlur = scale * 1.4;
  ctx.lineWidth = Math.max(1.5, scale * 0.5);
  // Support post (behind the end line) → crossbar centre.
  ctx.beginPath();
  ctx.moveTo(X(cx), Y(endYd - into * 2.4));
  ctx.lineTo(X(cx), Y(endYd));
  ctx.stroke();
  // Crossbar across the width.
  ctx.beginPath();
  ctx.moveTo(X(cx - cw), Y(endYd));
  ctx.lineTo(X(cx + cw), Y(endYd));
  ctx.stroke();
  // Two uprights reaching into the field.
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(X(cx + s * cw), Y(endYd));
    ctx.lineTo(X(cx + s * cw), Y(endYd + into * 3.2));
    ctx.stroke();
  }
  ctx.restore();
}

/** A small football (rotatable) with a highlight and laces. */
function drawFootball(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(spin) * 0.5);
  const g = ctx.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, "#9a5a23");
  g.addColorStop(1, "#6b3a14");
  ctx.beginPath();
  ctx.fillStyle = g;
  ctx.ellipse(0, 0, r * 0.62, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = Math.max(0.8, r * 0.12);
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.5);
  ctx.lineTo(0, r * 0.5);
  ctx.stroke();
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(-r * 0.16, i * r * 0.2);
    ctx.lineTo(r * 0.16, i * r * 0.2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawChevron(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, heading: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(heading);
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.7, size * 0.85);
  ctx.lineTo(-size * 0.3, 0);
  ctx.lineTo(-size * 0.7, -size * 0.85);
  ctx.closePath();
  ctx.restore();
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number,
  size: number, color: string,
): void {
  const ang = Math.atan2(toY - fromY, toX - fromX);
  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.translate(toX, toY);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, size * 0.55);
  ctx.lineTo(-size, -size * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

interface EffectLike {
  kind: "catch" | "tackle" | "sack" | "breakTackle" | "touchdown" | "incomplete";
  age: number;
}

const CONFETTI = ["#ffd21e", "#2e6fdb", "#eb5a46", "#5ad17f", "#ff8a3d", "#ffffff"];

function drawEffect(
  ctx: CanvasRenderingContext2D, x: number, y: number, fx: EffectLike, scale: number, dir = 1,
): void {
  const fade = 1 - fx.age;
  const grow = 1 + fx.age * 2.2;
  const palette: Record<EffectLike["kind"], { ring: string; label?: string; text?: string }> = {
    catch: { ring: "120,230,140" },
    tackle: { ring: "230,230,230" },
    breakTackle: { ring: "255,210,30" },
    sack: { ring: "235,90,70", label: "SACK", text: "#ffd9d2" },
    touchdown: { ring: "255,210,30", label: "TD", text: "#ffe98a" },
    incomplete: { ring: "180,190,200", label: "INC", text: "#c9d2da" },
  };
  const p = palette[fx.kind];
  ctx.save();
  ctx.beginPath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgba(${p.ring},${(fade * 0.9).toFixed(3)})`;
  ctx.arc(x, y, scale * 2 * grow, 0, Math.PI * 2);
  ctx.stroke();

  // Particle burst (deterministic from the spawn point so it's replayable).
  const n = fx.kind === "touchdown" ? 16 : fx.kind === "incomplete" ? 0 : 9;
  ctx.fillStyle = `rgba(${p.ring},${(fade).toFixed(3)})`;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + i;
    const dist = scale * (1.5 + fx.age * 7) * (0.7 + (i % 3) * 0.18);
    const px = x + Math.cos(ang) * dist;
    const py = y + Math.sin(ang) * dist - (fx.kind === "touchdown" ? fx.age * scale * 4 : 0);
    if (fx.kind === "touchdown") ctx.fillStyle = withAlpha2(CONFETTI[i % CONFETTI.length], fade);
    ctx.beginPath();
    ctx.arc(px, py, scale * 0.45 * fade, 0, Math.PI * 2);
    ctx.fill();
  }

  if (p.label) {
    ctx.fillStyle = withAlpha2(p.text ?? "#fff", fade);
    ctx.font = `bold ${Math.round(scale * (fx.kind === "touchdown" ? 5 : 3.4))}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.label, x, y - dir * scale * (3.5 + fx.age * 3));
  }
  ctx.restore();
}

/** Lighten (f>1) or darken (f<1) a #rrggbb colour. */
function shade(hex: string, f: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function withAlpha2(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
}

function withAlpha(hex: string, a: number): string {
  return withAlpha2(hex, a);
}
