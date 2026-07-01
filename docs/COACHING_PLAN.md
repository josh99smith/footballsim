# Coaching Overhaul

Turn the two loose, overlapping coaching systems (rating-emphasis **gameplan**
sliders + a **philosophy** knob that confusingly made the user's sliders drive
the AI) into one coherent **head coach** identity that both teams have, that
shapes play, and that the user picks and sees.

Status: ⬜ planned · 🚧 in progress · ✅ done

## P1 — Coach model, archetypes & signature traits
- A **Coach** = an archetype identity bundling a default **gameplan** (rating
  emphasis), a **game-management philosophy** (aggression / pass-lean / blitz /
  tempo / risk), and a **signature trait**.
- A library of archetypes: **Air Raid, Smashmouth, Blitzburgh, Bend Don't
  Break, Riverboat, Field General** — each with a distinct plan, philosophy and
  trait.
- Both teams get a coach: the user picks theirs; the AI's is seed-derived. The
  AI opponent now plays to **its own coach's** philosophy (fixing the old
  backwards design), and its gameplan comes from that coach.
- **Traits make coaching matter**: situational rating bonuses applied in the
  sim — e.g. *Closer* (run blocking up in the 4th with a lead), *Gunslinger*
  (passing up when trailing), *Dial-Up Pressure* (rush up on obvious pass
  downs), *Red Zone Wall* (coverage up defending the goal), *Go For It* (4th
  down), *Two-Minute Drill* (hurry-up efficiency).

## P2 — Coaching UI & visibility
- **Coach picker** cards at setup (and for a season franchise): identity,
  emphasis summary, and the signature trait.
- Replace the buried philosophy sliders with a **coach card** in the play sheet
  showing your coach + a **live "trait active" badge** when your signature is
  firing; keep the gameplan controls at setup and halftime.
- Surface the opponent's coach so the matchup has a face.
