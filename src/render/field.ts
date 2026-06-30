import type { RenderFrame } from "../controller";
import { FIELD } from "../sim/constants";

export interface DrawOpts {
  homeColor: string;
  awayColor: string;
  homeEndzone: string;
  awayEndzone: string;
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

  // End zones (home at the bottom, away at the top).
  ctx.fillStyle = opts.homeEndzone;
  ctx.fillRect(X(0), Y(FIELD.END_ZONE), fieldW, FIELD.END_ZONE * scale);
  ctx.fillStyle = opts.awayEndzone;
  ctx.fillRect(X(0), Y(FIELD.TOTAL_LENGTH), fieldW, FIELD.END_ZONE * scale);

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

  // Sideline border.
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(X(0), Y(FIELD.TOTAL_LENGTH), fieldW, fieldH);

  if (!frame) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = `${Math.round(scale * 4)}px system-ui, sans-serif`;
    ctx.fillText("Pick a play to snap", X(FIELD.WIDTH / 2), Y(60));
    return;
  }

  // Line of scrimmage & first-down marker (horizontal lines).
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#1e6bff";
  ctx.beginPath();
  ctx.moveTo(X(0), Y(frame.losAbs));
  ctx.lineTo(X(FIELD.WIDTH), Y(frame.losAbs));
  ctx.stroke();

  const fd = frame.firstDownAbs;
  if (fd > FIELD.END_ZONE && fd < FIELD.TOTAL_LENGTH - FIELD.END_ZONE) {
    ctx.strokeStyle = "#ffd21e";
    ctx.beginPath();
    ctx.moveTo(X(0), Y(fd));
    ctx.lineTo(X(FIELD.WIDTH), Y(fd));
    ctx.stroke();
  }

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

  // Players.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const a of frame.agents) {
    const cx = X(a.y);
    const cy = Y(a.x);

    if (a.hasBall) {
      ctx.beginPath();
      ctx.fillStyle = "rgba(255,210,30,0.30)";
      ctx.arc(cx, cy, r + scale * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.fillStyle = a.color;
    if (a.side === "off") {
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Screen velocity: width -> +X, downfield -> -Y (up).
      const screenHeading = a.moving ? Math.atan2(-a.vx, a.vy) : -Math.PI / 2;
      drawChevron(ctx, cx, cy, r * 1.25, screenHeading);
      ctx.fill();
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.stroke();

    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.round(scale * 1.6)}px system-ui, sans-serif`;
    ctx.fillText(String(a.number), cx, cy);
  }

  // Ball in flight.
  if (frame.flight) {
    const f = frame.flight;
    const px = { x: f.fromX + (f.toX - f.fromX) * f.progress, y: f.fromY + (f.toY - f.fromY) * f.progress };
    const flightDist = Math.hypot(f.toX - f.fromX, f.toY - f.fromY);
    const lift = Math.sin(f.progress * Math.PI) * Math.min(scale * 9, flightDist * scale * 0.18);

    ctx.save();
    ctx.setLineDash([scale * 1.2, scale * 1.4]);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X(f.fromY), Y(f.fromX));
    ctx.lineTo(X(f.toY), Y(f.toX));
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.ellipse(X(px.y), Y(px.x), r * 0.6, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = "#7a4318";
    ctx.ellipse(X(px.y), Y(px.x) - lift, r * 0.5, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.stroke();
  } else if (frame.ball.inAir) {
    ctx.beginPath();
    ctx.fillStyle = "#7a4318";
    ctx.ellipse(X(frame.ball.y), Y(frame.ball.x), r * 0.5, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const fx of frame.effects) drawEffect(ctx, X(fx.y), Y(fx.x), fx, scale);
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

function drawEffect(
  ctx: CanvasRenderingContext2D, x: number, y: number, fx: EffectLike, scale: number,
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
  if (p.label) {
    ctx.fillStyle = withAlpha2(p.text ?? "#fff", fade);
    ctx.font = `bold ${Math.round(scale * (fx.kind === "touchdown" ? 5 : 3.4))}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.label, x, y - scale * (3.5 + fx.age * 3));
  }
  ctx.restore();
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
