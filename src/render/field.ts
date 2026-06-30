import type { RenderFrame } from "../controller";
import { FIELD } from "../sim/constants";

export interface DrawOpts {
  homeColor: string;
  awayColor: string;
  homeEndzone: string;
  awayEndzone: string;
}

/**
 * Draws the field and the current frame. Pure consumer of sim state — it reads
 * the frame and never writes back into the sim.
 *
 * Coordinate mapping: field downfield x (0..120) -> horizontal screen axis;
 * field width y (0..53.33) -> vertical screen axis.
 */
export function drawField(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  frame: RenderFrame | null,
  opts: DrawOpts,
): void {
  ctx.clearRect(0, 0, w, h);

  // Fit the 120x53.33 field into the canvas with a small margin, preserving aspect.
  const margin = 5;
  const availW = w - margin * 2;
  const availH = h - margin * 2;
  const scale = Math.min(availW / FIELD.TOTAL_LENGTH, availH / FIELD.WIDTH);
  const fieldW = FIELD.TOTAL_LENGTH * scale;
  const fieldH = FIELD.WIDTH * scale;
  const ox = (w - fieldW) / 2;
  const oy = (h - fieldH) / 2;

  const X = (yd: number): number => ox + yd * scale;
  const Y = (yd: number): number => oy + yd * scale;

  // Turf.
  ctx.fillStyle = "#1f7a3d";
  ctx.fillRect(X(0), Y(0), fieldW, fieldH);

  // Alternating 10-yard mowing stripes.
  ctx.fillStyle = "#23854391";
  for (let yd = FIELD.END_ZONE; yd < FIELD.TOTAL_LENGTH - FIELD.END_ZONE; yd += 20) {
    ctx.fillStyle = ((yd / 10) % 2 === 0) ? "#1c7038" : "#218040";
    ctx.fillRect(X(yd), Y(0), 10 * scale, fieldH);
  }

  // End zones.
  ctx.fillStyle = opts.homeEndzone;
  ctx.fillRect(X(0), Y(0), FIELD.END_ZONE * scale, fieldH);
  ctx.fillStyle = opts.awayEndzone;
  ctx.fillRect(X(FIELD.TOTAL_LENGTH - FIELD.END_ZONE), Y(0), FIELD.END_ZONE * scale, fieldH);

  // Yard lines & numbers.
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `${Math.round(scale * 4)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let yd = FIELD.END_ZONE; yd <= FIELD.TOTAL_LENGTH - FIELD.END_ZONE; yd += 5) {
    ctx.beginPath();
    ctx.moveTo(X(yd), Y(0));
    ctx.lineTo(X(yd), Y(FIELD.WIDTH));
    ctx.stroke();
    const fromGoal = yd - FIELD.END_ZONE;
    if (fromGoal % 10 === 0 && fromGoal > 0 && fromGoal < 100) {
      const num = fromGoal <= 50 ? fromGoal : 100 - fromGoal;
      if (num > 0) {
        ctx.fillText(String(num), X(yd), Y(7));
        ctx.fillText(String(num), X(yd), Y(FIELD.WIDTH - 7));
      }
    }
  }

  // Hash marks.
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  for (let yd = FIELD.END_ZONE; yd <= FIELD.TOTAL_LENGTH - FIELD.END_ZONE; yd += 1) {
    for (const hy of [FIELD.HASH, FIELD.WIDTH - FIELD.HASH]) {
      ctx.beginPath();
      ctx.moveTo(X(yd), Y(hy) - scale * 0.5);
      ctx.lineTo(X(yd), Y(hy) + scale * 0.5);
      ctx.stroke();
    }
  }

  // Sidelines border.
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(X(0), Y(0), fieldW, fieldH);

  if (!frame) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = `${Math.round(scale * 5)}px system-ui, sans-serif`;
    ctx.fillText("Select a play to snap the ball", X(60), Y(FIELD.WIDTH / 2));
    return;
  }

  // Line of scrimmage & first-down marker.
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#1e6bff";
  ctx.beginPath();
  ctx.moveTo(X(frame.losAbs), Y(0));
  ctx.lineTo(X(frame.losAbs), Y(FIELD.WIDTH));
  ctx.stroke();

  const fd = frame.firstDownAbs;
  if (fd > FIELD.END_ZONE && fd < FIELD.TOTAL_LENGTH - FIELD.END_ZONE) {
    ctx.strokeStyle = "#ffd21e";
    ctx.beginPath();
    ctx.moveTo(X(fd), Y(0));
    ctx.lineTo(X(fd), Y(FIELD.WIDTH));
    ctx.stroke();
  }

  const r = scale * 1.3;

  // Route lines (pre-snap / early): dashed, drawn beneath everything.
  if (frame.showRoutes) {
    ctx.save();
    ctx.setLineDash([scale * 1.4, scale * 1.2]);
    ctx.lineWidth = Math.max(1, scale * 0.45);
    for (const route of frame.routes) {
      if (route.points.length < 2) continue;
      ctx.strokeStyle = withAlpha(route.color, 0.55);
      ctx.beginPath();
      ctx.moveTo(X(route.points[0].x), Y(route.points[0].y));
      for (let i = 1; i < route.points.length; i++) {
        ctx.lineTo(X(route.points[i].x), Y(route.points[i].y));
      }
      ctx.stroke();
      // Arrowhead at the end of the route.
      const p1 = route.points[route.points.length - 2];
      const p2 = route.points[route.points.length - 1];
      drawArrowHead(ctx, X(p1.x), Y(p1.y), X(p2.x), Y(p2.y), scale * 1.3, withAlpha(route.color, 0.8));
    }
    ctx.restore();
  }

  // Motion trails: fade from tail to head.
  ctx.save();
  ctx.lineCap = "round";
  for (const trail of frame.trails) {
    const pts = trail.points;
    for (let i = 1; i < pts.length; i++) {
      const t = i / pts.length;
      ctx.strokeStyle = withAlpha(trail.color, t * 0.35);
      ctx.lineWidth = scale * 0.9 * t;
      ctx.beginPath();
      ctx.moveTo(X(pts[i - 1].x), Y(pts[i - 1].y));
      ctx.lineTo(X(pts[i].x), Y(pts[i].y));
      ctx.stroke();
    }
  }
  ctx.restore();

  // Players.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const a of frame.agents) {
    const cx = X(a.x);
    const cy = Y(a.y);

    if (a.hasBall) {
      // Glow ring behind the ball carrier.
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
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.stroke();
    } else {
      // Defenders are chevrons that point the way they're moving.
      drawChevron(ctx, cx, cy, r * 1.25, a.moving ? a.heading : 0);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.stroke();
    }

    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.round(scale * 1.6)}px system-ui, sans-serif`;
    ctx.fillText(String(a.number), cx, cy);
  }

  // Ball in flight: arc with a ground shadow + a faint lead line.
  if (frame.flight) {
    const f = frame.flight;
    const px = f.fromX + (f.toX - f.fromX) * f.progress;
    const py = f.fromY + (f.toY - f.fromY) * f.progress;
    const flightDist = Math.hypot(f.toX - f.fromX, f.toY - f.fromY);
    const lift = Math.sin(f.progress * Math.PI) * Math.min(scale * 9, flightDist * scale * 0.18);

    ctx.save();
    ctx.setLineDash([scale * 1.2, scale * 1.4]);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X(f.fromX), Y(f.fromY));
    ctx.lineTo(X(f.toX), Y(f.toY));
    ctx.stroke();
    ctx.restore();

    // Shadow.
    ctx.beginPath();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.ellipse(X(px), Y(py), r * 0.7, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    // Ball.
    ctx.beginPath();
    ctx.fillStyle = "#7a4318";
    ctx.ellipse(X(px), Y(py) - lift, r * 0.8, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.stroke();
  } else if (frame.ball.inAir) {
    ctx.beginPath();
    ctx.fillStyle = "#7a4318";
    ctx.ellipse(X(frame.ball.x), Y(frame.ball.y), r * 0.8, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Event pops on top of everything.
  for (const fx of frame.effects) drawEffect(ctx, X(fx.x), Y(fx.y), fx, scale);
}

function drawChevron(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  heading: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(heading);
  ctx.beginPath();
  // A blunt arrowhead pointing toward +x (then rotated to the heading).
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.7, size * 0.85);
  ctx.lineTo(-size * 0.3, 0);
  ctx.lineTo(-size * 0.7, -size * 0.85);
  ctx.closePath();
  ctx.restore();
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  size: number,
  color: string,
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
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  fx: EffectLike,
  scale: number,
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
