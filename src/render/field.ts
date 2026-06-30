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

  // Fit the 120x53.33 field into the canvas with a margin, preserving aspect.
  const margin = 12;
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

  // Players.
  const r = scale * 1.3;
  for (const a of frame.agents) {
    ctx.beginPath();
    ctx.fillStyle = a.color;
    if (a.side === "off") {
      ctx.arc(X(a.x), Y(a.y), r, 0, Math.PI * 2);
    } else {
      // Defenders as squares to read O vs D at a glance.
      ctx.rect(X(a.x) - r, Y(a.y) - r, r * 2, r * 2);
    }
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.stroke();

    if (a.hasBall) {
      ctx.beginPath();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.arc(X(a.x), Y(a.y), r + 2.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.round(scale * 1.7)}px system-ui, sans-serif`;
    ctx.fillText(String(a.number), X(a.x), Y(a.y));
  }

  // Ball (when in the air / loose).
  if (frame.ball.inAir) {
    ctx.beginPath();
    ctx.fillStyle = "#6b3b14";
    ctx.ellipse(X(frame.ball.x), Y(frame.ball.y), r * 0.8, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
