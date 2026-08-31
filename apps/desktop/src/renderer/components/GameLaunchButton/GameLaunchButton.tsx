import type { LibraryGame } from "@launcher/core";
import { FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { Play } from "@phosphor-icons/react/Play";
import { Button } from "../Button";
import { useGameLaunchButton } from "./GameLaunchButton.hook";
export interface GameLaunchButtonProps {
  game: LibraryGame;
  isRunning: boolean;
  onLaunch: () => void;
  onConfigureExecutable: () => void;
}

export function GameLaunchButton({
  game,
  isRunning,
  onLaunch,
  onConfigureExecutable,
}: Readonly<GameLaunchButtonProps>) {
  const { disabled, label, status } = useGameLaunchButton({
    game,
    isRunning,
  });

  return (
    <Button
      disabled={disabled}
      onClick={status === "unavailable" ? onConfigureExecutable : onLaunch}
      size="large"
      variant={status === "unavailable" || status === "running" ? "setup" : "primary"}
    >
      {status === "unavailable" ? <FolderOpen weight="bold" /> : <Play weight="fill" />}
      {label}
    </Button>
  );
}
