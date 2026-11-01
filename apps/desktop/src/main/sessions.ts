import { savegameStorageKey } from "../shared/game-identity.js";
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
  scheduleSteamRefresh,
  savegameManager,
  settingsStore,
  broadcastSavegameChanged,
}: Pick<
  MainContext,
  | "store"
  | "broadcastLibrary"
  | "broadcastGameRunning"
  | "scheduleSteamRefresh"
  | "savegameManager"
  | "settingsStore"
  | "broadcastSavegameChanged"
>) {
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
        await broadcastLibrary(await store.addPlaytime(gameId, durationSeconds));
      }

      const [game, policy, settings] = await Promise.all([
        store.getGame(gameId),
        savegameManager.getPolicy(gameId),
        settingsStore.read(),
      ]);

      if (game && policy.autoBackup && settings.syncFolderPath) {
        await savegameManager
          .backupWithOutcome(gameId, savegameStorageKey(game), settings.syncFolderPath)
          .catch(() => undefined);
        broadcastSavegameChanged(gameId);
      }
    } finally {
      if (reportedRunning) {
        broadcastGameRunning(gameId, false);
        scheduleSteamRefresh();
      }
      watchedSteamGames.delete(gameId);
    }
  };

  return watchSteamSession;
}

export function registerLaunchHandlers({
  steamSyncService,
  providerService,
  store,
  settingsStore,
  savegameManager,
  achievementService,
  broadcastGameRunning,
  broadcastSavegameChanged,
  broadcastLibrary,
  scheduleAutoSync,
  autoSync,
  watchSteamSession,
}: MainContext) {
  handle("library:launch", async (_event, gameId: string) => {
    const game = await store.getGame(gameId);

    if (!game) {
      throw new Error("Game not found");
    }

    const savePolicy = await savegameManager.getPolicy(game.id);
    const launchSettings = await settingsStore.read();

    if (savePolicy.backupBeforeLaunch && launchSettings.syncFolderPath) {
      try {
        await savegameManager.backupWithOutcome(
          game.id,
          savegameStorageKey(game),
          launchSettings.syncFolderPath,
        );
      } finally {
        broadcastSavegameChanged(game.id);
      }
    }

    if (game.source === "epic" || game.source === "gog") {
      await providerService.launch(game);
      runBackground(watchSteamSession(game.id, game.installPath), "[provider:session]");
      return;
    }
    if (game.source === "steam" && game.launchUri) {
      await openExternal(
        game.installed ? game.launchUri : `steam://install/${game.sourceId}`,
      );
      if (!game.installed) {
        steamSyncService.watchInstallation(game.sourceId);
      }
      if (game.installed) {
        runBackground(watchSteamSession(game.id, game.installPath), "[steam:session]");
      }
      return;
    }
    if (!game.installPath) {
      throw new Error("Este juego todavía no tiene ejecutable");
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
            await broadcastLibrary(snapshot);
            scheduleAutoSync();
          }
        }
      }

      const result = await achievementService.discover(achievementGame);
      await achievementService.record(achievementGame, result);
      return JSON.stringify(result);
    };

    const startedAt = Date.now();
    const child = spawnLocalGame(game.installPath);
    let stopped = false;
    let pollDelay = 5_000;
    let lastState: string | null = null;
    let achievementTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingAchievements: Promise<void> | null = null;
    const pollAchievements = () => {
      pendingAchievements = refreshAchievements()
        .then((state) => {
          pollDelay = state === lastState ? Math.min(30_000, pollDelay * 2) : 5_000;
          lastState = state;
        })
        .finally(() => {
          pendingAchievements = null;
          if (!stopped) {
            achievementTimer = setTimeout(pollAchievements, pollDelay);
          }
        });
      runBackground(pendingAchievements, "[achievements:watch]");
    };
    pollAchievements();
    const stopPolling = () => {
      stopped = true;
      if (achievementTimer) {
        clearTimeout(achievementTimer);
      }
    };
    let reportedRunning = false;
    child.once("spawn", () => {
      reportedRunning = true;
      broadcastGameRunning(game.id, true);
    });
    child.once("error", (error) => {
      stopPolling();
      if (reportedRunning) {
        broadcastGameRunning(game.id, false);
      }
      console.error("[launch:local]", error);
    });
    child.once("close", async () => {
      const endedAt = Date.now();
      stopPolling();
      await pendingAchievements?.catch(() => undefined);
      await refreshAchievements().catch((error) =>
        console.error("[achievements:final]", error),
      );
      if (reportedRunning) {
        broadcastGameRunning(game.id, false);
      }

      const syncSettings = await settingsStore.read();

      if (savePolicy.autoBackup && syncSettings.syncFolderPath) {
        await savegameManager
          .backupWithOutcome(
            game.id,
            savegameStorageKey(game),
            syncSettings.syncFolderPath,
          )
          .catch((error) => console.error("[savegames:auto]", error))
          .finally(() => broadcastSavegameChanged(game.id));
      }

      const durationSeconds = Math.round((endedAt - startedAt) / 1_000);

      if (durationSeconds < 5) {
        return;
      }
      await broadcastLibrary(await store.addPlaytime(game.id, durationSeconds));
      await autoSync().catch((error) => console.error("[sync:auto]", error));
    });
  });
}
