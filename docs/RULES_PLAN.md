# Realism & League Rules Overhaul

Bring the sim closer to real football and let the coach pick **Pro** or
**College** rules and a team from a league library. All rules live in a `Rules`
config derived from the chosen league; the sim stays deterministic and every
choice is part of the saved/replayed setup.

Status: ⬜ planned · 🚧 in progress · ✅ done

## Phase A — League rules + team selection ✅
- `League = "pro" | "college"` → a `Rules` object.
- Rule differences wired into game flow:
  - **Clock stops on first down** (college) vs runs (pro).
  - **Extra point** distance/success by league (pro 33-yd ~94%, college 20-yd ~97%).
  - **Pass interference**: pro = spot foul (can be big); college = capped 15 yds.
  - **Ties**: pro regular-season can tie; college always plays overtime.
- Team library (`teams.ts`): a Pro league and a College league of selectable
  teams (city/school, abbr, colors). Setup screen: league selector + team
  pickers for both sides (custom still allowed).

## Phase B — Overtime ✅
- **College OT**: untimed, alternating possessions from the opponent's 25;
  compare after each team has had the ball; 2-point-only tries from the 3rd
  round. First team ahead after equal possessions wins.
- **Pro OT**: one shortened sudden-death period; opening TD wins, opening FG
  gives the other team a possession; otherwise next score wins; expiring tied
  is a tie (pro only).

## Phase C — Simulation realism pass ✅
- Clock/time model refinements (runoff by situation & league).
- Kick/punt return variance, touchback spots.
- Tuning + verification harness that both leagues produce believable box scores.
