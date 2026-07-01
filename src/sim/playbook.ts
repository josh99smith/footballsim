import type { Assignment, Position } from "./types";

/** A player's role within a play: where they line up (relative to the ball)
 *  and what they're asked to do. Alignment is in LOCAL frame deltas:
 *  dx = yards downfield from LOS (negative = in the backfield),
 *  dy = yards laterally from the ball's spot (negative = left). */
export interface PlayerRole {
  /** Which roster slot (by position) this role wants. Resolved at setup. */
  want: Position;
  dx: number;
  dy: number;
  /** Assignment template. targetId on block/coverMan is resolved at setup. */
  assign: Assignment;
}

export interface OffPlay {
  id: string;
  name: string;
  type: "run" | "pass";
  formation: string;
  blurb: string;
  roles: PlayerRole[]; // exactly 11
  /** Tick at which a run play hands off (default 8). Larger = delayed (draw). */
  handoffTick?: number;
}

export interface DefPlay {
  id: string;
  name: string;
  type: "base" | "blitz" | "coverage";
  formation: string;
  blurb: string;
  roles: PlayerRole[]; // exactly 11
}

// ---- Offensive line + QB/RB shared alignments -------------------------------

const OL_ALIGN: Array<{ dy: number }> = [
  { dy: 0 }, // C
  { dy: -1.6 }, // LG
  { dy: 1.6 }, // RG
  { dy: -3.2 }, // LT
  { dy: 3.2 }, // RT
];

function offensiveLine(): PlayerRole[] {
  return OL_ALIGN.map(({ dy }) => ({
    want: "OL" as Position,
    dx: -0.5,
    dy,
    assign: { kind: "block" } as Assignment,
  }));
}

// ---- Offensive plays --------------------------------------------------------

export const OFF_PLAYS: OffPlay[] = [
  {
    id: "inside-zone",
    name: "Inside Zone",
    type: "run",
    formation: "Singleback",
    blurb: "Hand it off between the tackles. Grind out the tough yards.",
    roles: [
      { want: "QB", dx: -1.5, dy: 0, assign: { kind: "qb", dropDepth: 0 } },
      { want: "RB", dx: -5, dy: 0, assign: { kind: "carry", aimGap: -1.2 } },
      { want: "WR", dx: -0.3, dy: -17, assign: { kind: "block" } },
      { want: "WR", dx: -0.3, dy: 17, assign: { kind: "block" } },
      { want: "WR", dx: -0.3, dy: 9, assign: { kind: "block" } },
      { want: "TE", dx: -0.5, dy: 4.8, assign: { kind: "block" } },
      ...offensiveLine(),
    ],
  },
  {
    id: "power-sweep",
    name: "Power Sweep",
    type: "run",
    formation: "I-Form",
    blurb: "Bounce it outside behind pulling blockers. Hit the edge with speed.",
    roles: [
      { want: "QB", dx: -1.5, dy: 0, assign: { kind: "qb", dropDepth: 0 } },
      { want: "RB", dx: -5.5, dy: 0, assign: { kind: "carry", aimGap: 5 } },
      { want: "WR", dx: -0.3, dy: -17, assign: { kind: "block" } },
      { want: "WR", dx: -0.3, dy: 17, assign: { kind: "block" } },
      { want: "WR", dx: -4, dy: 5, assign: { kind: "block" } }, // motion/lead back
      { want: "TE", dx: -0.5, dy: 4.8, assign: { kind: "block" } },
      ...offensiveLine(),
    ],
  },
  {
    id: "quick-slants",
    name: "Quick Slants",
    type: "pass",
    formation: "Shotgun",
    blurb: "Fast three-step drop, hot reads on slants. Beat the blitz.",
    roles: [
      { want: "QB", dx: -5, dy: 0, assign: { kind: "qb", dropDepth: 1.5 } },
      {
        want: "RB",
        dx: -5,
        dy: 2.5,
        assign: {
          kind: "runRoute",
          isCheckdown: true,
          waypoints: [
            { x: 0, y: 4 },
            { x: 4, y: 7 },
          ],
        },
      },
      {
        want: "WR",
        dx: -0.3,
        dy: -17,
        assign: { kind: "runRoute", waypoints: [{ x: 1.5, y: 0 }, { x: 9, y: 7 }] },
      },
      {
        want: "WR",
        dx: -0.3,
        dy: 17,
        assign: { kind: "runRoute", waypoints: [{ x: 1.5, y: 0 }, { x: 9, y: -7 }] },
      },
      {
        want: "WR",
        dx: -0.3,
        dy: 9,
        assign: { kind: "runRoute", waypoints: [{ x: 2, y: 0 }, { x: 11, y: -8 }] },
      },
      {
        want: "TE",
        dx: -0.5,
        dy: 4.8,
        assign: { kind: "runRoute", waypoints: [{ x: 6, y: 0 }, { x: 12, y: 4 }] },
      },
      ...offensiveLine(),
    ],
  },
  {
    id: "four-verticals",
    name: "Four Verticals",
    type: "pass",
    formation: "Shotgun",
    blurb: "Send everyone deep. Take the top off the defense.",
    roles: [
      { want: "QB", dx: -5, dy: 0, assign: { kind: "qb", dropDepth: 4 } },
      {
        want: "RB",
        dx: -5,
        dy: -2.5,
        assign: { kind: "runRoute", isCheckdown: true, waypoints: [{ x: 1, y: -5 }] },
      },
      {
        want: "WR",
        dx: -0.3,
        dy: -17,
        // Outside go, stemming to the boundary — a back-shoulder sideline shot.
        assign: { kind: "runRoute", waypoints: [{ x: 20, y: -5 }, { x: 38, y: -8 }] },
      },
      {
        want: "WR",
        dx: -0.3,
        dy: 17,
        assign: { kind: "runRoute", waypoints: [{ x: 20, y: 5 }, { x: 38, y: 8 }] },
      },
      {
        want: "WR",
        dx: -0.3,
        dy: 9,
        assign: { kind: "runRoute", waypoints: [{ x: 20, y: -3 }, { x: 36, y: -4 }] },
      },
      {
        want: "TE",
        dx: -0.5,
        dy: 4.8,
        assign: { kind: "runRoute", waypoints: [{ x: 18, y: 3 }, { x: 34, y: 4 }] },
      },
      ...offensiveLine(),
    ],
  },
  {
    id: "play-action-deep",
    name: "Play Action Deep",
    type: "pass",
    formation: "Singleback",
    blurb: "Sell the run, then take a shot over the top. High risk, high reward.",
    roles: [
      { want: "QB", dx: -2.5, dy: 0, assign: { kind: "qb", dropDepth: 5 } },
      {
        want: "RB",
        dx: -5,
        dy: 1.5,
        assign: { kind: "block" }, // stays in to protect after the fake
      },
      {
        want: "WR",
        dx: -0.3,
        dy: -17,
        // Deep go stemming to the left boundary — the primary shot.
        assign: { kind: "runRoute", waypoints: [{ x: 16, y: -4 }, { x: 32, y: -7 }, { x: 46, y: -8 }] },
      },
      {
        want: "WR",
        dx: -0.3,
        dy: 17,
        // Deep comeback to the right sideline.
        assign: { kind: "runRoute", waypoints: [{ x: 16, y: 0 }, { x: 20, y: 7 }] },
      },
      {
        want: "WR",
        dx: -0.3,
        dy: 9,
        assign: { kind: "runRoute", waypoints: [{ x: 10, y: 0 }, { x: 16, y: 8 }] }, // post
      },
      {
        want: "TE",
        dx: -0.5,
        dy: 4.8,
        assign: { kind: "runRoute", waypoints: [{ x: 8, y: 2 }] }, // drag/flat
      },
      ...offensiveLine(),
    ],
  },
  {
    id: "draw",
    name: "Draw",
    type: "run",
    formation: "Shotgun",
    blurb: "Show pass, then hand it up the middle as the rush flies upfield.",
    handoffTick: 18,
    roles: [
      { want: "QB", dx: -5, dy: 0, assign: { kind: "qb", dropDepth: 1 } },
      { want: "RB", dx: -5, dy: 1.6, assign: { kind: "carry", aimGap: -0.5 } },
      { want: "WR", dx: -0.3, dy: -17, assign: { kind: "block" } },
      { want: "WR", dx: -0.3, dy: 17, assign: { kind: "block" } },
      { want: "WR", dx: -0.3, dy: 9, assign: { kind: "block" } },
      { want: "TE", dx: -0.5, dy: 4.8, assign: { kind: "block" } },
      ...offensiveLine(),
    ],
  },
  {
    id: "hb-screen",
    name: "HB Screen",
    type: "pass",
    formation: "Shotgun",
    blurb: "Let the rush come, then dump it to the back behind a wall of blockers.",
    roles: [
      { want: "QB", dx: -5, dy: 0, assign: { kind: "qb", dropDepth: 2 } },
      {
        want: "RB",
        dx: -4.5,
        dy: 3,
        assign: { kind: "runRoute", isCheckdown: true, waypoints: [{ x: -1.5, y: 5 }, { x: 2, y: 9 }] },
      },
      { want: "WR", dx: -0.3, dy: -17, assign: { kind: "runRoute", waypoints: [{ x: 6, y: 0 }, { x: 14, y: -2 }] } },
      { want: "WR", dx: -0.3, dy: 17, assign: { kind: "block" } }, // screen blocker
      { want: "WR", dx: -0.3, dy: 9, assign: { kind: "block" } }, // screen blocker
      { want: "TE", dx: -0.5, dy: 4.8, assign: { kind: "block" } },
      ...offensiveLine(),
    ],
  },
  {
    id: "mesh",
    name: "Mesh",
    type: "pass",
    formation: "Shotgun",
    blurb: "Crossing routes underneath rub off defenders. A man-coverage killer.",
    roles: [
      { want: "QB", dx: -5, dy: 0, assign: { kind: "qb", dropDepth: 2.5 } },
      {
        want: "RB",
        dx: -5,
        dy: -2.5,
        assign: { kind: "runRoute", isCheckdown: true, waypoints: [{ x: 2, y: -6 }] },
      },
      {
        want: "WR",
        dx: -0.3,
        dy: -17,
        assign: { kind: "runRoute", waypoints: [{ x: 4, y: 0 }, { x: 7, y: 22 }] }, // shallow cross L->R
      },
      {
        want: "WR",
        dx: -0.3,
        dy: 17,
        assign: { kind: "runRoute", waypoints: [{ x: 4, y: 0 }, { x: 7, y: -22 }] }, // shallow cross R->L
      },
      {
        want: "WR",
        dx: -0.3,
        dy: 9,
        assign: { kind: "runRoute", waypoints: [{ x: 14, y: 0 }, { x: 26, y: -2 }] }, // deep dig clearout
      },
      {
        want: "TE",
        dx: -0.5,
        dy: 4.8,
        assign: { kind: "runRoute", waypoints: [{ x: 10, y: 1 }] }, // sit-down
      },
      ...offensiveLine(),
    ],
  },
];

// ---- Defensive plays --------------------------------------------------------

/** Standard 4-man front + back-seven alignments reused across calls. */
function fourManFront(): PlayerRole[] {
  return [
    { want: "DL", dx: 1, dy: -2.4, assign: { kind: "rush", lane: -2.4 } },
    { want: "DL", dx: 1, dy: -0.8, assign: { kind: "rush", lane: -0.8 } },
    { want: "DL", dx: 1, dy: 0.8, assign: { kind: "rush", lane: 0.8 } },
    { want: "DL", dx: 1, dy: 2.4, assign: { kind: "rush", lane: 2.4 } },
  ];
}

export const DEF_PLAYS: DefPlay[] = [
  {
    id: "cover3-base",
    name: "4-3 Cover 3",
    type: "base",
    formation: "4-3",
    blurb: "Balanced front, three deep zones. Sound against everything.",
    roles: [
      ...fourManFront(),
      { want: "LB", dx: 4.5, dy: -5, assign: { kind: "coverZone", center: { x: 7, y: -9 }, radius: 7 } },
      { want: "LB", dx: 4.5, dy: 0, assign: { kind: "coverZone", center: { x: 6, y: 0 }, radius: 7 } },
      { want: "LB", dx: 4.5, dy: 5, assign: { kind: "coverZone", center: { x: 7, y: 9 }, radius: 7 } },
      { want: "CB", dx: 6, dy: -16, assign: { kind: "coverZone", center: { x: 18, y: -15 }, radius: 10 } },
      { want: "CB", dx: 6, dy: 16, assign: { kind: "coverZone", center: { x: 18, y: 15 }, radius: 10 } },
      { want: "S", dx: 13, dy: 0, assign: { kind: "coverZone", center: { x: 22, y: 0 }, radius: 11 } },
      { want: "S", dx: 9, dy: 7, assign: { kind: "coverZone", center: { x: 12, y: 6 }, radius: 8 } },
    ],
  },
  {
    id: "cover2-man",
    name: "Cover 2 Man",
    type: "coverage",
    formation: "4-3",
    blurb: "Press man underneath, two safeties over the top. Sticky coverage.",
    roles: [
      ...fourManFront(),
      { want: "LB", dx: 4.5, dy: -4, assign: { kind: "coverMan" } as Assignment },
      { want: "LB", dx: 5, dy: 0, assign: { kind: "spy" } as Assignment },
      { want: "LB", dx: 4.5, dy: 4, assign: { kind: "coverMan" } as Assignment },
      { want: "CB", dx: 2, dy: -16, assign: { kind: "coverMan" } as Assignment },
      { want: "CB", dx: 2, dy: 16, assign: { kind: "coverMan" } as Assignment },
      { want: "S", dx: 14, dy: -12, assign: { kind: "coverZone", center: { x: 24, y: -13 }, radius: 13 } },
      { want: "S", dx: 14, dy: 12, assign: { kind: "coverZone", center: { x: 24, y: 13 }, radius: 13 } },
    ],
  },
  {
    id: "zone-blitz",
    name: "Zone Blitz",
    type: "blitz",
    formation: "4-3",
    blurb: "Send a linebacker, drop an end. Confuse the protection.",
    roles: [
      { want: "DL", dx: 1, dy: -2.4, assign: { kind: "rush", lane: -2.4 } },
      { want: "DL", dx: 1, dy: -0.8, assign: { kind: "rush", lane: -0.8 } },
      { want: "DL", dx: 1, dy: 0.8, assign: { kind: "rush", lane: 0.8 } },
      { want: "DL", dx: 1.5, dy: 3.2, assign: { kind: "coverZone", center: { x: 8, y: 9 }, radius: 7 } }, // dropping end
      { want: "LB", dx: 4, dy: -3, assign: { kind: "rush", lane: -4 } }, // blitzer
      { want: "LB", dx: 4.5, dy: 0, assign: { kind: "coverZone", center: { x: 7, y: 0 }, radius: 8 } },
      { want: "LB", dx: 4.5, dy: 5, assign: { kind: "coverZone", center: { x: 8, y: -8 }, radius: 8 } },
      { want: "CB", dx: 6, dy: -16, assign: { kind: "coverZone", center: { x: 16, y: -15 }, radius: 10 } },
      { want: "CB", dx: 6, dy: 16, assign: { kind: "coverZone", center: { x: 16, y: 15 }, radius: 10 } },
      { want: "S", dx: 13, dy: -4, assign: { kind: "coverZone", center: { x: 24, y: -6 }, radius: 13 } },
      { want: "S", dx: 13, dy: 4, assign: { kind: "coverZone", center: { x: 24, y: 6 }, radius: 13 } },
    ],
  },
  {
    id: "nickel-man",
    name: "Nickel Man Blitz",
    type: "blitz",
    formation: "Nickel",
    blurb: "Extra DB, bring pressure, man across the board. Win or lose now.",
    roles: [
      ...fourManFront(),
      { want: "LB", dx: 4, dy: -2, assign: { kind: "rush", lane: -3.5 } }, // blitzer
      { want: "LB", dx: 4.5, dy: 3, assign: { kind: "coverMan" } as Assignment },
      { want: "CB", dx: 3, dy: -16, assign: { kind: "coverMan" } as Assignment },
      { want: "CB", dx: 3, dy: 16, assign: { kind: "coverMan" } as Assignment },
      { want: "CB", dx: 3, dy: 8, assign: { kind: "coverMan" } as Assignment }, // nickel
      { want: "S", dx: 5, dy: -6, assign: { kind: "coverMan" } as Assignment },
      { want: "S", dx: 14, dy: 0, assign: { kind: "coverZone", center: { x: 26, y: 0 }, radius: 15 } },
    ],
  },
  {
    id: "cover4-quarters",
    name: "Cover 4 Quarters",
    type: "coverage",
    formation: "4-3",
    blurb: "Four deep, keep everything in front. Bend but don't break.",
    roles: [
      ...fourManFront(),
      { want: "LB", dx: 4.5, dy: -5, assign: { kind: "coverZone", center: { x: 6, y: -8 }, radius: 7 } },
      { want: "LB", dx: 4.5, dy: 0, assign: { kind: "coverZone", center: { x: 6, y: 0 }, radius: 7 } },
      { want: "LB", dx: 4.5, dy: 5, assign: { kind: "coverZone", center: { x: 6, y: 8 }, radius: 7 } },
      { want: "CB", dx: 8, dy: -16, assign: { kind: "coverZone", center: { x: 24, y: -17 }, radius: 11 } },
      { want: "CB", dx: 8, dy: 16, assign: { kind: "coverZone", center: { x: 24, y: 17 }, radius: 11 } },
      { want: "S", dx: 12, dy: -7, assign: { kind: "coverZone", center: { x: 24, y: -6 }, radius: 11 } },
      { want: "S", dx: 12, dy: 7, assign: { kind: "coverZone", center: { x: 24, y: 6 }, radius: 11 } },
    ],
  },
  {
    id: "cover0-blitz",
    name: "Cover 0 Blitz",
    type: "blitz",
    formation: "Bear",
    blurb: "Everyone comes. Man across, no safety help. Boom or bust.",
    roles: [
      ...fourManFront(),
      { want: "LB", dx: 3.5, dy: -3, assign: { kind: "rush", lane: -4 } }, // blitz
      { want: "LB", dx: 3.5, dy: 3, assign: { kind: "rush", lane: 4 } }, // blitz
      { want: "LB", dx: 4.5, dy: 0, assign: { kind: "coverMan" } as Assignment },
      { want: "CB", dx: 2, dy: -16, assign: { kind: "coverMan" } as Assignment },
      { want: "CB", dx: 2, dy: 16, assign: { kind: "coverMan" } as Assignment },
      { want: "S", dx: 4, dy: 8, assign: { kind: "coverMan" } as Assignment },
      { want: "S", dx: 4, dy: -6, assign: { kind: "coverMan" } as Assignment },
    ],
  },
  {
    id: "goal-line",
    name: "Goal Line",
    type: "base",
    formation: "Goal Line",
    blurb: "Stack the box, sell out to stop the run at the line.",
    roles: [
      { want: "DL", dx: 1, dy: -3, assign: { kind: "rush", lane: -3 } },
      { want: "DL", dx: 1, dy: -1, assign: { kind: "rush", lane: -1 } },
      { want: "DL", dx: 1, dy: 1, assign: { kind: "rush", lane: 1 } },
      { want: "DL", dx: 1, dy: 3, assign: { kind: "rush", lane: 3 } },
      { want: "LB", dx: 2.5, dy: -1.5, assign: { kind: "rush", lane: -2 } },
      { want: "LB", dx: 2.5, dy: 1.5, assign: { kind: "rush", lane: 2 } },
      { want: "LB", dx: 3.5, dy: 5, assign: { kind: "coverMan" } as Assignment },
      { want: "CB", dx: 4, dy: -14, assign: { kind: "coverMan" } as Assignment },
      { want: "CB", dx: 4, dy: 14, assign: { kind: "coverMan" } as Assignment },
      { want: "S", dx: 4, dy: -5, assign: { kind: "coverMan" } as Assignment },
      { want: "S", dx: 6, dy: 0, assign: { kind: "spy" } as Assignment },
    ],
  },
];

export const getOffPlay = (id: string): OffPlay =>
  OFF_PLAYS.find((p) => p.id === id) ?? OFF_PLAYS[0];
export const getDefPlay = (id: string): DefPlay =>
  DEF_PLAYS.find((p) => p.id === id) ?? DEF_PLAYS[0];
