# Visual Polish Plan

Make the 2D presentation look great while keeping the sim pure and the
render path fast. All work is in the renderer / overlays — never the sim.

Status: ⬜ planned · 🚧 in progress · ✅ done

## V1 — Players & ball ✅
- Ground shadows under every token for depth.
- Offense tokens: radial-gradient fill, team-color rim, crisp number with shadow.
- Defense chevrons: gradient fill + outline, oriented to motion.
- Ball carrier: animated pulsing glow.
- Ball: football shape with laces + spin in flight; shadow scales with hang.
- Time-driven animation passed to the renderer (render-only; sim untouched).

## V2 — Field & turf ✅
- End-zone team names, corner pylons, bolder goal lines & sidelines.
- TV-style glowing first-down line + line of scrimmage.
- Midfield logo, mowed-stripe shading, edge vignette.
- Out-of-bounds rendered as dim stands.

## V3 — Juice ✅
- Particle bursts on catch / tackle / sack / touchdown; confetti on TD.
- Screen shake on big hits & scores; zoom-punch on scores.

## V4 — Overlay polish ✅
- Banner gradients & team accents; scoreboard possession pulse.
- Drive progress + smoother transitions.

Guiding rules: 60fps on mobile, no per-frame allocations in hot loops where
avoidable, everything degrades gracefully under `prefers-reduced-motion`.
