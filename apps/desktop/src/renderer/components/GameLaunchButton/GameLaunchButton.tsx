import type { LibraryGame } from "@launcher/core";
import { Play } from "@phosphor-icons/react/Play";
import styles from "./GameLaunchButton.module.scss";
import { useGameLaunchButton } from "./GameLaunchButton.hook";

export interface GameLaunchButtonProps {
  game: LibraryGame;
  isRunning: boolean;
  onLaunch: () => void;
}

export function GameLaunchButton({
  game,
  isRunning,
  onLaunch,
}: Readonly<GameLaunchButtonProps>) {
  const { disabled, label, status } = useGameLaunchButton({
    game,
    isRunning,
  });

  return (
    <button
      className={`${styles.button} ${status === "running" ? styles.running : ""}`}
      disabled={disabled}
      onClick={onLaunch}
      type="button"
    >
      <Play weight="fill" />
      {label}
    </button>
  );
}
