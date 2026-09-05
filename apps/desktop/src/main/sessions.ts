import type { MainContext } from "./context.js";
import { handle } from "./ipc/handle.js";
import {
  delay,
  isInstalledGameRunning,
  openExternal,
  runBackground,
  spawnLocalGame,
} from "./platform.js";

export function createSteamSessionWatcher({
  store,
  broadcastLibrary,
  broadcastGameRunning,
}: Pick<MainContext, "store" | "broadcastLibrary" | "broadcastGameRunning">) {
  const watchedSteamGames = new Set<string>();
  const watchSteamSession = async (gameId: string, installPath: string) => {
    if (!installPath || watchedSteamGames.has(gameId)) {
      return;
    }
    watchedSteamGames.add(gameId);
    let reportedRunning = false;

    try {
      let running = false;

      for (let attempt = 0; attempt < 40; attempt += 1) {
        await delay(3_000);
        running = await isInstalledGameRunning(installPath);
        if (running) {
          break;
        }
      }
      if (!running) {
        return;
      }
      reportedRunning = true;
      broadcastGameRunning(gameId, true);
      const startedAt = Date.now();

      while (await isInstalledGameRunning(installPath)) {
        await delay(10_000);
      }

      const durationSeconds = Math.round((Date.now() - startedAt) / 1_000);

      if (durationSeconds >= 10) {
        await store.addPlaytime(gameId, durationSeconds);
        await broadcastLibrary();
      }
    } finally {
      if (reportedRunning) {
        broadcastGameRunning(gameId, false);
      }
      watchedSteamGames.delete(gameId);
    }
  };

  return watchSteamSession;
}

export function registerLaunchHandlers({
  store,
  settingsStore,
  savegameManager,
  achievementService,
  broadcastGameRunning,
  broadcastLibrary,
  scheduleAutoSync,
  autoSync,
  watchSteamSession,
}: MainContext) {
  handle("library:launch", async (_event, gameId: string) => {
    const game = (await store.read()).games.find((item) => item.id === gameId);

    if (!game) {
      throw new Error("Game not found");
    }
    if (game.source === "steam" && game.launchUri) {
      await openExternal(game.launchUri);
      if (game.installed) {
        runBackground(watchSteamSession(game.id, game.installPath), "[steam:session]");
      }
      return;
    }
    if (!game.installPath) {
      throw new Error("Este juego todavía no tiene ejecutable");
    }

    const savePolicy = await savegameManager.getPolicy(game.id);
    const launchSettings = await settingsStore.read();

    if (savePolicy.backupBeforeLaunch && launchSettings.syncFolderPath) {
      await savegameManager.backup(
        game.id,
        game.sourceId,
        launchSettings.syncFolderPath,
      );
    }

    const stateBeforeLaunch = await achievementService.captureGoldbergState();
    let achievementGame = game;
    const refreshAchievements = async () => {
      if (!achievementGame.achievementStateId) {
        const stateId =
          await achievementService.findChangedGoldbergStateId(stateBeforeLaunch);

        if (stateId) {
          const snapshot = await store.setAchievementStateId(game.id, stateId);
          const updatedGame = snapshot.games.find((item) => item.id === game.id);

          if (updatedGame) {
            achievementGame = updatedGame;
            await broadcastLibrary();
            scheduleAutoSync();
          }
        }
      }

      const result = await achievementService.discover(achievementGame);
      await achievementService.record(achievementGame, result);
    };

    const startedAt = Date.now();
    const child = spawnLocalGame(game.installPath);
    runBackground(refreshAchievements(), "[achievements:initial]");
    let pollingAchievements = false;
    const achievementTimer = setInterval(() => {
      if (pollingAchievements) {
        return;
      }
      pollingAchievements = true;
      runBackground(
        refreshAchievements().finally(() => {
          pollingAchievements = false;
        }),
        "[achievements:watch]",
      );
    }, 5_000);
    let reportedRunning = false;
    child.once("spawn", () => {
      reportedRunning = true;
      broadcastGameRunning(game.id, true);
    });
    child.once("error", (error) => {
      clearInterval(achievementTimer);
      if (reportedRunning) {
        broadcastGameRunning(game.id, false);
      }
      console.error("[launch:local]", error);
    });
    child.once("close", async () => {
      clearInterval(achievementTimer);
      await refreshAchievements().catch((error) =>
        console.error("[achievements:final]", error),
      );
      if (reportedRunning) {
        broadcastGameRunning(game.id, false);
      }

      const syncSettings = await settingsStore.read();

      if (savePolicy.autoBackup && syncSettings.syncFolderPath) {
        await savegameManager
          .backup(game.id, game.sourceId, syncSettings.syncFolderPath)
          .catch((error) => console.error("[savegames:auto]", error));
      }

      const durationSeconds = Math.round((Date.now() - startedAt) / 1_000);

      if (durationSeconds < 5) {
        return;
      }
      await store.addPlaytime(game.id, durationSeconds);
      await broadcastLibrary();
      await autoSync().catch((error) => console.error("[sync:auto]", error));
    });
  });
}
