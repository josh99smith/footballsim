# Gridiron Coach — Browser Football Simulator

You coach, you don't play. Pick the play and the philosophy, watch 22 agents run
it out on a 2D field, and read the box score. No player control — a single
exhibition game where every snap is resolved by a deterministic positional
simulation.

## The one rule: sim / render split

The simulation is a **headless, deterministic, fixed-timestep engine** that knows
nothing about pixels. The renderer is a **dumb consumer** of sim state. This
boundary is enforced from the ground up:

- **Speed control** (`pause / 0.5× / 1× / 2× / 4× / instant`) just changes how
  fast sim ticks are consumed. "Instant" runs the play headless and posts the
  result.
- **Determinism** — same seed + same play calls reproduce the exact game. Every
  random draw routes through a seeded PRNG (`mulberry32`); there is no
  `Math.random()` anywhere in the sim.
- **Testability** — the sim is pure functions over state, unit-tested with no DOM.

If anything in `src/sim/**` touched `requestAnimationFrame`, the canvas, or
`Math.random()`, the split would be broken.

## Architecture

```
UI shell (React)        playbook, sliders, scoreboard, stats   src/ui, src/App.tsx
Render layer (Canvas)   reads RenderFrame, draws the field     src/render/field.ts
Stats aggregator        reads play results -> box score        src/stats/aggregator.ts
Controller              drives the rAF loop, owns interpolation src/controller.ts
Game flow state machine downs, clock, scoring, special teams   src/sim/game.ts
Sim core (pure TS)      22-agent resolver + seeded PRNG         src/sim/engine.ts
```

Data flows **up** as state + typed events. Control flows **down** as play calls.
The render layer and stats never write into the sim. The sim instance lives
outside React (in `controller.ts`); per-frame motion never triggers a re-render —
the canvas reads sim state directly each frame, and React only updates on
discrete events (play results, scores).

## The positional agent sim

Each of the 22 agents has position, velocity, ratings (speed, strength, agility,
awareness, catch, tackle, block) and a per-snap assignment (carry, block, run a
route, cover man/zone, rush, spy, QB). Behaviour is plain kinematics + steering;
contests (block sheds, tackle vs break, catch vs contest, interception) resolve
as rating-weighted probability rolls through the seeded RNG. A light "outcome
guidance" layer (a linebacker run-read delay, block lock-on windows, accuracy
error scaled by depth) keeps the box score in believable ranges — the engine is
the easy 70%, realistic stats are the hard 30%.

## Features

- 5 offensive plays (Inside Zone, Power Sweep, Quick Slants, Four Verticals,
  Play Action Deep) and 4 defensive calls (4-3 Cover 3, Cover 2 Man, Zone Blitz,
  Nickel Man Blitz).
- Coaching **philosophy sliders** (run/pass lean, aggression, risk, blitz
  frequency) that drive the AI coordinator on the side you aren't calling.
- Full game flow: downs, distance, clock, quarters, first downs, turnovers on
  downs, touchdowns + XP, field goals, punts, safeties, kickoffs.
- Live box score, drive chart, and play-by-play log — all fed by the same typed
  event stream.

## Develop

```bash
npm install
npm run dev        # Vite dev server
npm test           # Vitest (deterministic sim tests)
npm run typecheck
npm run build      # production build to dist/
```

## Deployment

Pushing to the build branch (or `main`) triggers
`.github/workflows/deploy.yml`, which builds the app and publishes `dist/` to
GitHub Pages. The Vite `base` is relative (`./`) so it works under a project
Pages path.

## Tech stack

Vite + React + TypeScript · Canvas 2D · Zustand (discrete UI state) ·
mulberry32 seeded RNG · Vitest. Fully client-side, no backend.
