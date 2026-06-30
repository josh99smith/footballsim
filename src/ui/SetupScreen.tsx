import { useState } from "react";
import { controller, useGame } from "../store/gameStore";
import type { Difficulty, GameSetup } from "../controller";

const QUARTERS: { label: string; sec: number }[] = [
  { label: "3 min", sec: 180 },
  { label: "5 min", sec: 300 },
  { label: "8 min", sec: 480 },
  { label: "15 min", sec: 900 },
];
const DIFFICULTIES: { id: Difficulty; label: string; note: string }[] = [
  { id: "easy", label: "Easy", note: "Opponent rated down" },
  { id: "normal", label: "Normal", note: "Even teams" },
  { id: "hard", label: "Hard", note: "Opponent rated up" },
];

export function SetupScreen() {
  const startGame = useGame((s) => s.startGame);
  const [setup, setSetup] = useState<GameSetup>(() => controller.currentSetup());

  const patch = (p: Partial<GameSetup>) => setSetup((s) => ({ ...s, ...p }));
  const patchTeam = (side: "home" | "away", p: Partial<GameSetup["home"]>) =>
    setSetup((s) => ({ ...s, [side]: { ...s[side], ...p } }));

  return (
    <div className="setup">
      <div className="setup-card panel">
        <h2>New Game</h2>
        <p className="setup-tagline">You coach the home team. Set the matchup and kick off.</p>

        <div className="setup-section">
          <label className="setup-label">Quarter length</label>
          <div className="chip-row">
            {QUARTERS.map((q) => (
              <button
                key={q.sec}
                className={`chip ${setup.quarterSeconds === q.sec ? "active" : ""}`}
                onClick={() => patch({ quarterSeconds: q.sec })}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        <div className="setup-section">
          <label className="setup-label">Difficulty</label>
          <div className="chip-row">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                className={`chip ${setup.difficulty === d.id ? "active" : ""}`}
                onClick={() => patch({ difficulty: d.id })}
                title={d.note}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="setup-teams">
          {(["home", "away"] as const).map((side) => (
            <div key={side} className="setup-team">
              <h3>{side === "home" ? "Home (You)" : "Away (AI)"}</h3>
              <div className="setup-field-row">
                <input
                  className="setup-input name"
                  value={setup[side].name}
                  maxLength={28}
                  onChange={(e) => patchTeam(side, { name: e.target.value })}
                  placeholder="Team name"
                />
                <input
                  className="setup-input abbr"
                  value={setup[side].abbr}
                  maxLength={4}
                  onChange={(e) => patchTeam(side, { abbr: e.target.value })}
                  placeholder="ABBR"
                />
                <input
                  type="color"
                  className="setup-color"
                  value={normHex(setup[side].color)}
                  onChange={(e) => patchTeam(side, { color: e.target.value })}
                  aria-label={`${side} color`}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="setup-section">
          <label className="setup-label">Seed (shareable)</label>
          <div className="setup-field-row">
            <input
              className="setup-input seed"
              type="number"
              value={setup.seed}
              onChange={(e) => patch({ seed: Math.abs(Math.floor(Number(e.target.value) || 0)) })}
            />
            <button className="chip" onClick={() => patch({ seed: Math.floor(Math.random() * 1_000_000_000) })}>
              🎲 Random
            </button>
          </div>
          <p className="setup-hint">Same seed + same play calls reproduces the exact game.</p>
        </div>

        <button className="primary big" onClick={() => startGame(setup)}>
          Kickoff →
        </button>
      </div>
    </div>
  );
}

/** Color inputs require #rrggbb; fall back if a name slipped in. */
function normHex(c: string): string {
  return /^#[0-9a-f]{6}$/i.test(c) ? c : "#2e6fdb";
}
