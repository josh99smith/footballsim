import { useState } from "react";
import { controller, useGame } from "../store/gameStore";
import type { Difficulty, GameSetup } from "../controller";
import { getRecents, loadGame } from "../store/persistence";

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
  const resume = useGame((s) => s.resume);
  const loadCode = useGame((s) => s.loadCode);
  const [setup, setSetup] = useState<GameSetup>(() => controller.currentSetup());
  const [saved] = useState(() => loadGame());
  const [recents] = useState(() => getRecents());
  const [code, setCode] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [codeError, setCodeError] = useState(false);

  const patch = (p: Partial<GameSetup>) => setSetup((s) => ({ ...s, ...p }));
  const patchTeam = (side: "home" | "away", p: Partial<GameSetup["home"]>) =>
    setSetup((s) => ({ ...s, [side]: { ...s[side], ...p } }));

  return (
    <div className="setup">
      <div className="setup-card panel">
        <h2>New Game</h2>
        <p className="setup-tagline">You coach the home team. Set the matchup and kick off.</p>

        {saved && saved.inputs.length > 0 && (
          <button className="resume-btn" onClick={resume}>
            ↩ Resume game in progress
            <span className="resume-sub">{saved.setup.home.abbr} vs {saved.setup.away.abbr} · {saved.inputs.length} plays in</span>
          </button>
        )}

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

        <div className="setup-extra">
          <button className="link-btn" onClick={() => setShowImport((v) => !v)}>
            {showImport ? "Hide" : "Load a shared game code"}
          </button>
          {showImport && (
            <div className="setup-field-row">
              <input
                className="setup-input"
                style={{ flex: 1 }}
                value={code}
                onChange={(e) => { setCode(e.target.value); setCodeError(false); }}
                placeholder="Paste game code…"
              />
              <button
                className="chip"
                onClick={() => { if (!loadCode(code)) setCodeError(true); }}
              >
                Load
              </button>
            </div>
          )}
          {codeError && <p className="setup-hint err">That code couldn't be read.</p>}
        </div>

        {recents.length > 0 && (
          <div className="recents">
            <h3>Recent results</h3>
            {recents.map((r, i) => (
              <div key={i} className="recent-row">
                <span>{r.awayAbbr} {r.awayScore} @ {r.homeAbbr} {r.homeScore}</span>
                <span className="recent-seed">seed {r.seed}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Color inputs require #rrggbb; fall back if a name slipped in. */
function normHex(c: string): string {
  return /^#[0-9a-f]{6}$/i.test(c) ? c : "#2e6fdb";
}
