import { FieldCanvas } from "./ui/FieldCanvas";
import { Scoreboard } from "./ui/Scoreboard";
import { SpeedControls } from "./ui/SpeedControls";
import { PlaySelectPanel } from "./ui/PlaySelectPanel";
import { StatsPanel } from "./ui/StatsPanel";
import { GameLog } from "./ui/GameLog";
import { Banner } from "./ui/Banner";
import { SetupScreen } from "./ui/SetupScreen";
import { useGame } from "./store/gameStore";

export default function App() {
  const homeName = useGame((s) => s.homeName);
  const awayName = useGame((s) => s.awayName);
  const phase = useGame((s) => s.phase);

  if (phase === "setup") {
    return (
      <div className="app">
        <header className="app-header">
          <h1>Gridiron Coach</h1>
          <span className="matchup">2D football, you call the plays</span>
        </header>
        <SetupScreen />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Gridiron Coach</h1>
        <span className="matchup">{awayName} @ {homeName}</span>
      </header>

      <Scoreboard />

      <div className="main-grid">
        <aside className="left-col">
          <PlaySelectPanel />
        </aside>

        <section className="center-col">
          <div className="field-stage">
            <FieldCanvas />
            <Banner />
          </div>
          <GameLog />
          <SpeedControls />
        </section>

        <aside className="right-col">
          <StatsPanel />
        </aside>
      </div>
    </div>
  );
}
