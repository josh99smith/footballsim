import type { OffPlay, DefPlay } from "../sim/playbook";
import type { Assignment, Position } from "../sim/types";

// Landscape-ish card so route trees have room to spread.
const VB_W = 124;
const VB_H = 96;
const CX = VB_W / 2;
const LOS = 62; // svg y of the line of scrimmage
const SX = 2.55; // lateral yards → svg units (spreads the formation wide)
const SY = 1.2; // downfield yards → svg units

// Distinct route colours, assigned per skill man (Madden-style tree).
const ROUTE_COLORS = ["#ffd21e", "#38bdf8", "#fb7185", "#4ade80", "#c084fc", "#fb923c"];
const RUN_COLOR = "#ffd21e";

/** Schematic diagram of a play: formation + routes / assignments. */
export function PlayArt({
  play, side, flip = false,
}: {
  play: OffPlay | DefPlay;
  side: "offense" | "defense";
  flip?: boolean;
}) {
  const m = flip ? -1 : 1;
  const px = (dy: number) => CX + m * dy * SX;
  const py = (dx: number) => LOS - dx * SY;

  const routes: JSX.Element[] = [];
  const glyphs: JSX.Element[] = [];
  let routeN = 0;

  play.roles.forEach((r, i) => {
    const x = px(r.dy);
    const y = py(r.dx);
    const a = r.assign as Assignment;

    if (side === "offense") {
      if (a.kind === "runRoute") {
        const col = ROUTE_COLORS[routeN++ % ROUTE_COLORS.length];
        let d = `M ${x} ${y}`;
        for (const w of a.waypoints) d += ` L ${px(r.dy + w.y).toFixed(1)} ${py(r.dx + w.x).toFixed(1)}`;
        routes.push(
          <path key={`r${i}`} d={d} fill="none" stroke={col}
            strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray={a.isCheckdown ? "3.5 2.5" : undefined}
            markerEnd={`url(#pa-${col.slice(1)})`} />,
        );
        glyphs.push(skillDot(i, x, y, col));
      } else if (a.kind === "carry") {
        const tx = px(a.aimGap * 0.85);
        routes.push(
          <path key={`c${i}`} d={`M ${x} ${y} L ${tx.toFixed(1)} ${py(r.dx + 9).toFixed(1)}`}
            fill="none" stroke={RUN_COLOR} strokeWidth={3} strokeLinecap="round"
            markerEnd="url(#pa-run)" />,
        );
        glyphs.push(skillDot(i, x, y, "#eaeef6"));
      } else if (r.want === "QB") {
        glyphs.push(qbGlyph(i, x, y));
      } else if (r.want === "OL") {
        glyphs.push(olGlyph(i, x, y));
      } else {
        // Skill player blocking (e.g. WR crack block on a run).
        glyphs.push(skillDot(i, x, y, "#9fb2c9"));
      }
    } else {
      // ---- defense ----
      if (a.kind === "rush") {
        routes.push(
          <path key={`ru${i}`} d={`M ${x} ${y} L ${px(a.lane).toFixed(1)} ${py(-3.5).toFixed(1)}`}
            fill="none" stroke="#fb7185" strokeWidth={2.4} strokeLinecap="round"
            markerEnd="url(#pa-rush)" />,
        );
        glyphs.push(defGlyph(i, x, y, r.want, "#fb7185"));
      } else if (a.kind === "coverZone") {
        glyphs.push(
          <circle key={`z${i}`} cx={x} cy={y} r={Math.min(13, a.radius * SY)}
            fill="rgba(56,189,248,0.06)" stroke="#38bdf8" strokeWidth={1.1}
            strokeDasharray="3 3" />,
        );
        glyphs.push(defGlyph(i, x, y, r.want, "#8fd3ff"));
      } else if (a.kind === "coverMan") {
        routes.push(
          <path key={`man${i}`} d={`M ${x} ${y} q 0 5 ${(m * 3.5).toFixed(1)} 6`} fill="none"
            stroke="#c084fc" strokeWidth={1.5} strokeLinecap="round" />,
        );
        glyphs.push(defGlyph(i, x, y, r.want, "#c084fc"));
      } else {
        glyphs.push(defGlyph(i, x, y, r.want, "#cbd5e1"));
      }
    }
  });

  const markers = [...new Set(ROUTE_COLORS)];
  return (
    <svg className="play-art" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
      <defs>
        {markers.map((c) => arrowMarker(`pa-${c.slice(1)}`, c))}
        {arrowMarker("pa-run", RUN_COLOR)}
        {arrowMarker("pa-rush", "#fb7185")}
      </defs>
      <rect x={0} y={0} width={VB_W} height={VB_H} fill="#0f2c1b" />
      {/* faint yard reference lines */}
      {[LOS - 30, LOS - 15, LOS + 12].map((yy, k) => (
        <line key={k} x1={5} y1={yy} x2={VB_W - 5} y2={yy} stroke="rgba(255,255,255,0.06)" strokeWidth={0.7} />
      ))}
      {/* line of scrimmage */}
      <line x1={4} y1={LOS} x2={VB_W - 4} y2={LOS} stroke="rgba(255,255,255,0.6)" strokeWidth={1} strokeDasharray="5 3.5" />
      {routes}
      {glyphs}
    </svg>
  );
}

function skillDot(i: number, x: number, y: number, col: string): JSX.Element {
  return (
    <circle key={`g${i}`} cx={x} cy={y} r={2.9} fill={col}
      stroke="rgba(0,0,0,0.55)" strokeWidth={0.7} />
  );
}

function qbGlyph(i: number, x: number, y: number): JSX.Element {
  return (
    <g key={`g${i}`}>
      <circle cx={x} cy={y} r={3.1} fill="#eaeef6" stroke="rgba(0,0,0,0.5)" strokeWidth={0.7} />
      <circle cx={x} cy={y} r={1.3} fill="#0f2c1b" />
    </g>
  );
}

function olGlyph(i: number, x: number, y: number): JSX.Element {
  return (
    <rect key={`g${i}`} x={x - 2.4} y={y - 2} width={4.8} height={4} rx={1}
      fill="#c3cdda" stroke="rgba(0,0,0,0.4)" strokeWidth={0.5} />
  );
}

function defGlyph(i: number, x: number, y: number, want: Position, col: string): JSX.Element {
  // Linemen as a chevron/triangle, back seven as discs.
  if (want === "DL") {
    return (
      <path key={`g${i}`} d={`M ${x} ${y - 2.6} L ${x + 2.4} ${y + 2} L ${x - 2.4} ${y + 2} Z`}
        fill={col} stroke="rgba(0,0,0,0.5)" strokeWidth={0.6} />
    );
  }
  return (
    <circle key={`g${i}`} cx={x} cy={y} r={2.7} fill={col} stroke="rgba(0,0,0,0.5)" strokeWidth={0.6} />
  );
}

function arrowMarker(id: string, color: string): JSX.Element {
  return (
    <marker id={id} key={id} markerWidth={5.5} markerHeight={5.5} refX={2.6} refY={2.75}
      orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L5.5,2.75 L0,5.5 Z" fill={color} />
    </marker>
  );
}
