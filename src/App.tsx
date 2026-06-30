import { FieldCanvas } from "./ui/FieldCanvas";
import { TopBar } from "./ui/TopBar";
import { BottomDock } from "./ui/BottomDock";
import { PlaySheet } from "./ui/PlaySheet";
import { Banner } from "./ui/Banner";
import { StatsOverlay } from "./ui/StatsOverlay";
import { GameOverOverlay } from "./ui/GameOverOverlay";
import { SetupScreen } from "./ui/SetupScreen";
import { KeyboardControls } from "./ui/KeyboardControls";
import { useGame } from "./store/gameStore";

export default function App() {
  const phase = useGame((s) => s.phase);

  if (phase === "setup") {
    return (
      <div className="app-setup">
        <SetupScreen />
      </div>
    );
  }

  return (
    <div className="stage">
      <KeyboardControls />
      <FieldCanvas />
      <TopBar />
      <Banner />
      <PlaySheet />
      <BottomDock />
      <StatsOverlay />
      <GameOverOverlay />
    </div>
  );
}
