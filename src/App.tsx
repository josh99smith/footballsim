import { FieldCanvas } from "./ui/FieldCanvas";
import { TopBar } from "./ui/TopBar";
import { BottomDock } from "./ui/BottomDock";
import { PlaySheet } from "./ui/PlaySheet";
import { Banner } from "./ui/Banner";
import { StatsOverlay } from "./ui/StatsOverlay";
import { RatingsOverlay } from "./ui/RatingsOverlay";
import { GameOverOverlay } from "./ui/GameOverOverlay";
import { HalftimeOverlay } from "./ui/HalftimeOverlay";
import { SetupScreen } from "./ui/SetupScreen";
import { KeyboardControls } from "./ui/KeyboardControls";
import { SeasonHub } from "./ui/season/SeasonHub";
import { OffseasonScreen } from "./ui/season/OffseasonScreen";
import { useGame } from "./store/gameStore";
import { useSeason } from "./store/seasonStore";

export default function App() {
  const phase = useGame((s) => s.phase);
  const seasonView = useSeason((s) => s.view);
  const seasonPlaying = useSeason((s) => s.playing);

  if (seasonView === "offseason") {
    return <div className="app-setup"><OffseasonScreen /></div>;
  }
  if (seasonView === "hub" && !seasonPlaying) {
    return (
      <div className="app-setup">
        <SeasonHub />
        <RatingsOverlay />
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <div className="app-setup">
        <SetupScreen />
        <RatingsOverlay />
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
      <RatingsOverlay />
      <HalftimeOverlay />
      <GameOverOverlay />
    </div>
  );
}
