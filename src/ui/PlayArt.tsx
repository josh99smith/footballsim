import type { OffPlay, DefPlay } from "../sim/playbook";
import type { Assignment } from "../sim/types";

const SX = 2.2; // lateral yards → svg units
const SY = 1.5; // downfield yards → svg units
const LOS = 80; // svg y of the line of scrimmage
const CX = 50; // svg x of the ball

/** Small schematic diagram of a play: alignment + routes / assignments. */
export function PlayArt({
  play, side, flip = false, color = "#8fb4ff",
}: {
  play: OffPlay | DefPlay;
  side: "offense" | "defense";
  flip?: boolean;
  color?: string;
}) {
  const m = flip ? -1 : 1;
  const px = (dy: number) => CX + m * dy * SX;
  const py = (dx: number) => LOS - dx * SY;

  const routes: JSX.Element[] = [];
  const marks: JSX.Element[] = [];

  play.roles.forEach((r, i) => {
    const x = px(r.dy);
    const y = py(r.dx);
    const a = r.assign as Assignment;

    if (side === "offense") {
      if (a.kind === "runRoute") {
        // Build the route polyline from the snap spot through the waypoints.
        let d = `M ${x} ${y}`;
        for (const w of a.waypoints) d += ` L ${px(r.dy + w.y)} ${py(r.dx + w.x)}`;
        routes.push(
          <path key={`r${i}`} d={d} fill="none" stroke={color}
            strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray={a.isCheckdown ? "3 2.5" : undefined}
            markerEnd="url(#pa-arrow)" opacity={0.95} />,
        );
      } else if (a.kind === "carry") {
        // Run aim: a bold arrow toward the target gap, upfield.
        const tx = px(a.aimGap * 0.7);
        routes.push(
          <path key={`c${i}`} d={`M ${x} ${y} L ${tx} ${py(r.dx + 8)}`}
            fill="none" stroke="#ffd21e" strokeWidth={2.4} strokeLinecap="round"
            markerEnd="url(#pa-arrow-y)" />,
        );
      } else if (a.kind === "block") {
        // Block nub: a short bar just in front of the blocker.
        marks.push(
          <line key={`b${i}`} x1={x} y1={py(r.dx + 1.4)} x2={x} y2={py(r.dx + 2.6)}
            stroke={color} strokeWidth={2} strokeLinecap="round" opacity={0.55} />,
        );
      }
    } else {
      if (a.kind === "rush") {
        // Rusher: arrow attacking the backfield.
        routes.push(
          <path key={`ru${i}`} d={`M ${x} ${y} L ${px(a.lane)} ${py(-3)}`}
            fill="none" stroke={color} strokeWidth={2} strokeLinecap="round"
            markerEnd="url(#pa-arrow-r)" />,
        );
      } else if (a.kind === "coverZone") {
        marks.push(
          <circle key={`z${i}`} cx={x} cy={y} r={Math.min(11, a.radius * SY * 0.9)}
            fill="none" stroke={color} strokeWidth={1.1} strokeDasharray="2.5 2.5" opacity={0.7} />,
        );
      } else if (a.kind === "coverMan") {
        // Man: a little downward hook toward the receiver they'll follow.
        marks.push(
          <path key={`man${i}`} d={`M ${x} ${y} q 0 4 ${m * 3} 5`} fill="none"
            stroke={color} strokeWidth={1.3} strokeLinecap="round" opacity={0.75} />,
        );
      } else if (a.kind === "spy") {
        marks.push(
          <circle key={`sp${i}`} cx={x} cy={y + 3.5} r={1.4} fill="none"
            stroke={color} strokeWidth={1} opacity={0.7} />,
        );
      }
    }

    // The player marker itself (drawn on top of its route origin).
    const isBall = side === "offense" && (r.want === "OL");
    if (isBall) {
      marks.push(
        <rect key={`m${i}`} x={x - 2} y={y - 1.6} width={4} height={3.2} rx={0.8}
          fill={color} opacity={0.9} />,
      );
    } else {
      marks.push(
        <circle key={`m${i}`} cx={x} cy={y} r={side === "offense" ? 2.4 : 2.2}
          fill={color} stroke="rgba(0,0,0,0.5)" strokeWidth={0.5} />,
      );
    }
  });

  return (
    <svg className="play-art" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <defs>
        {arrowMarker("pa-arrow", color)}
        {arrowMarker("pa-arrow-y", "#ffd21e")}
        {arrowMarker("pa-arrow-r", color)}
      </defs>
      {/* turf + line of scrimmage */}
      <rect x={0} y={0} width={100} height={100} fill="#12331f" rx={3} />
      <line x1={4} y1={LOS} x2={96} y2={LOS} stroke="rgba(255,255,255,0.55)" strokeWidth={0.8} strokeDasharray="4 3" />
      <line x1={CX} y1={6} x2={CX} y2={94} stroke="rgba(255,255,255,0.08)" strokeWidth={0.6} />
      {routes}
      {marks}
    </svg>
  );
}

function arrowMarker(id: string, color: string): JSX.Element {
  return (
    <marker id={id} markerWidth={5} markerHeight={5} refX={2.4} refY={2.5}
      orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L5,2.5 L0,5 Z" fill={color} />
    </marker>
  );
}
