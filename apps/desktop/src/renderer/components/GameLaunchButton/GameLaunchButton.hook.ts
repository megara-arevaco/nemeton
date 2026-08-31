import type { LibraryGame } from "@launcher/core";
export interface UseGameLaunchButtonOptions {
  game: LibraryGame;
  isRunning: boolean;
}

export function useGameLaunchButton({ game, isRunning }: UseGameLaunchButtonOptions) {
  if (isRunning) {
    return {
      disabled: true,
      label: "Jugando",
      status: "running" as const,
    };
  }

  if (game.source === "local" && !game.installPath) {
    return {
      disabled: false,
      label: "Añadir ejecutable",
      status: "unavailable" as const,
    };
  }

  return {
    disabled: false,
    label: game.installed ? "Jugar" : "Instalar",
    status: "ready" as const,
  };
}
