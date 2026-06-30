# Gridiron Coach — Polish Roadmap

Phased plan to take the MVP from "working" to "polished." Each phase is
independently shippable and preserves the core **sim / render split**: the sim
stays a pure, deterministic, headless engine; every visual or quality-of-life
addition reads sim state, it never writes into it.

Status legend: ⬜ planned · 🚧 in progress · ✅ done

---

## Phase 1 — Field comes alive ✅ (in progress)
Highest visual payoff; the sim already produces the data, this draws it richer.
- Route lines drawn pre-snap for the called play (informed coaching); fading
  ghost-trails behind players during the live play.
- Ball flight: parabolic arc + shadow + hang time on passes; pass lead line.
- Players oriented to motion — offense circles, defense chevrons, ball-carrier glow.
- Event pops: catch / tackle / sack / break-tackle / touchdown flashes.
- Down-marker chain + first-down line + possession indicator polish.
- *(Optional / later)* follow-ball camera + zoom, especially on mobile.

## Phase 2 — Broadcast feel ⬜
- Scoring banners (TD / FG / turnover) and an animated play-by-play ticker with icons.
- Sound: whistle, crowd swell, hit / catch — behind a mute toggle, no autoplay traps.
- Snap cadence + a brief, skippable result card (yards, tackler) between plays.

## Phase 3 — Sim depth & realism ⬜
- More playbook: screens, draws, RPOs, route-tree variety; defense Cover 4,
  man-free, goal-line.
- QB scrambles / designed runs; play-action keyed to run tendency.
- Penalties (false start, holding, PI, offside) with enforcement.
- Fatigue across drives + momentum streaks.
- Passer rating + time of possession in the box score.
- Situational AI playcalling (clock / score / field-zone aware; adapts to tendencies).
- Balance tuning pass (run yards, deep completions) driven by a sim-N-games harness.

## Phase 4 — Game management & options ⬜
- Settings: quarter length, difficulty, seed input (shareable games), team
  picker / custom names & colors.
- Timeouts, two-minute warning, kneel / spike, onside kick, go-for-two.
- Halftime summary; end-of-game stat leaders.

## Phase 5 — Persistence & replay ⬜
- localStorage save / resume; recent results.
- Replay a seed; export / share a game code (toward the franchise layer).

## Phase 6 — Quality, a11y & performance ⬜
- Keyboard controls, focus / ARIA, `prefers-reduced-motion`.
- Determinism regression tests (golden box scores per seed); more sim unit tests.
- Render performance (dirty-rect / lower-power mobile mode).

---

### Working agreement
Build one phase at a time, push, and check in before starting the next.
