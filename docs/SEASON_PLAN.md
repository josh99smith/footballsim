# Season Mode + Player Progression

Play a full league season with your team, then watch players grow and decline
across an offseason. Built on top of the existing deterministic game engine —
season games ARE the real game (pre-game plan, halftime, the works).

Status: ⬜ planned · 🚧 in progress · ✅ done

## P1 — Season data model & engine
- A **league** of 8 teams drawn from the chosen library (pro or college), each
  with a persisted roster (real ratings) plus per-player **age** and
  **potential**.
- Round-robin **schedule** (7 weeks) + a **Championship** between the top two
  seeds. Standings from W-L and point differential.
- **Quick-sim** for the games you don't coach: deterministic score from team
  OVR + a per-matchup seed.
- Persisted under its own storage key; fully reload-safe (all randomness is
  seeded from year/week/identity, nothing ephemeral is stored).

## P2 — Player progression / regression
- An **offseason** development pass applied to every team:
  - Young players (< 27) climb toward their **potential**; primes plateau;
    veterans (30+) decline — physical ratings (speed/agility) fade first while
    awareness lingers.
  - **Performance** matters: players on winning teams develop faster.
  - Players who age out (35+) **retire** and are replaced by a rookie with
    upside.
- An **Offseason report**: biggest risers, fallers, retirements and rookies on
  your team, then **Start next season** (schedule regenerates, everyone ages).

## P3 — Season UI
- **Season Hub**: standings, a schedule strip, this week's matchup with your
  game plan, and buttons to scout rosters / play the game.
- Entry point from the setup screen (**Exhibition** vs **Season**), a
  **Continue season →** button on the game-over screen, and the offseason
  report screen.
