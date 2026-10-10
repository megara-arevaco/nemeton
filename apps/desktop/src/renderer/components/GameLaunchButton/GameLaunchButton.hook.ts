import type { LibraryGame } from "@launcher/core";
import { useTranslation } from "react-i18next";

export interface UseGameLaunchButtonOptions {
  game: LibraryGame;
  isRunning: boolean;
}

export function useGameLaunchButton({ game, isRunning }: UseGameLaunchButtonOptions) {
  const { t } = useTranslation();

  if (isRunning) {
    return {
      disabled: true,
      label: t("launch.playing"),
      status: "running" as const,
    };
  }

  if (game.source === "local" && !game.installPath) {
    return {
      disabled: false,
      label: t("launch.configure"),
      status: "unavailable" as const,
    };
  }

  return {
    disabled: false,
    label: game.installed ? t("launch.play") : t("launch.install"),
    status: "ready" as const,
  };
}
