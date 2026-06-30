# Gridiron Coach — Polish Roadmap

Phased plan to take the MVP from "working" to "polished." Each phase is
independently shippable and preserves the core **sim / render split**: the sim
stays a pure, deterministic, headless engine; every visual or quality-of-life
addition reads sim state, it never writes into it.

Status legend: ⬜ planned · 🚧 in progress · ✅ done

---

## Phase 1 — Field comes alive ✅ done
Highest visual payoff; the sim already produces the data, this draws it richer.
- Route lines drawn pre-snap for the called play (informed coaching); fading
  ghost-trails behind players during the live play.
- Ball flight: parabolic arc + shadow + hang time on passes; pass lead line.
- Players oriented to motion — offense circles, defense chevrons, ball-carrier glow.
- Event pops: catch / tackle / sack / break-tackle / touchdown flashes.
- Down-marker chain + first-down line + possession indicator polish.
- *(Optional / later)* follow-ball camera + zoom, especially on mobile.

## Phase 2 — Broadcast feel ✅ done
- Scoring banners (TD / FG / turnover) and an animated play-by-play ticker with icons.
- Sound: whistle, crowd swell, hit / catch — behind a mute toggle, no autoplay traps.
- Snap cadence + a brief, skippable result card (yards, tackler) between plays.

## Phase 3 — Sim depth & realism ✅ done
- More playbook: Draw, HB Screen, Mesh (offense); Cover 4 Quarters, Cover 0
  Blitz, Goal Line (defense). *(RPOs/designed-QB-run left for later.)*
- QB scrambles (from Phase 1) retained; penalties: false start, offside,
  offensive holding, defensive pass interference — with goal-line-aware enforcement.
- Momentum streaks feeding the AI coordinator. *(Physical stamina/fatigue: future.)*
- Passer rating + time of possession + penalties in the box score.
- Situational AI playcalling: two-minute hurry-up, clock-kill when leading late,
  red-zone / goal-line tendencies, momentum nudge.
- Balance tuning pass + committed harness (`npm run balance`): completions
  ~64-79%, runs ~5-7 vs a base front, realistic final scores.

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
