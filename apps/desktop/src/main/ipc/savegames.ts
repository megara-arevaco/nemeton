import { restoreSavegameWithReview } from "../savegame-restore-flow.js";
import { savegameStorageKey } from "../../shared/game-identity.js";
import { readSavegameState } from "../savegame-state.js";
import type { SavegameState } from "../../shared/savegames.js";
import { dialog } from "electron";
import type { MainContext } from "../context.js";
import { handle } from "./handle.js";
import { getRoamingAppData, getSavegamePathContext, toLinuxPath } from "../platform.js";
import { SavegameManager } from "../savegames.js";
export function registerSavegameHandlers({
  awaitStartupRecovery,
  store,
  savegameManager,
  settingsStore,
  ludusaviCatalog,
  reportSlowOperation,
  broadcastSavegameChanged,
}: MainContext) {
  const loadState = (gameId: string, discover = false) =>
    readSavegameState(
      { store, settingsStore, savegameManager, ludusaviCatalog },
      gameId,
      discover,
      getRoamingAppData,
    );
  handle("savegames:get", (_event, gameId) =>
    reportSlowOperation("savegames:get", () => loadState(gameId)),
  );
  const discovering = new Map<string, Promise<SavegameState>>();
  handle("savegames:discover", (_event, gameId) => {
    const existing = discovering.get(gameId);

    if (existing) {
      return existing;
    }

    const request = reportSlowOperation("savegames:discover", () =>
      loadState(gameId, true),
    ).finally(() => discovering.delete(gameId));
    discovering.set(gameId, request);
    return request;
  });
  handle("savegames:verify", async (_event, gameId: string) =>
    reportSlowOperation("savegames:verify", async () => {
      await awaitStartupRecovery();
      const game = await store.getGame(gameId);

      if (!game) {
        throw new Error("No se encontró el juego local");
      }

      const settings = await settingsStore.read();

      if (!settings.syncFolderPath) {
        return {
          syncState: "unconfigured" as const,
          conflict: null,
          versionId: null,
          localSummary: null,
        };
      }
      return savegameManager.verify(
        gameId,
        savegameStorageKey(game),
        settings.syncFolderPath,
      );
    }),
  );
  handle(
    "savegames:verify-version",
    async (_event, gameId: string, versionId: string) => {
      const game = await store.getGame(gameId);
      const settings = await settingsStore.read();

      if (!game || !settings.syncFolderPath) {
        throw new Error("No se puede verificar esta copia");
      }
      return savegameManager.verifyVersion(
        settings.syncFolderPath,
        savegameStorageKey(game),
        versionId,
      );
    },
  );
  handle(
    "savegames:set-policy",
    (_event, gameId: string, policy: Parameters<SavegameManager["setPolicy"]>[1]) =>
      savegameManager.setPolicy(gameId, policy),
  );
  handle("savegames:add-folder", async (_event, gameId: string) => {
    const result = await dialog.showOpenDialog({
      title: "Selecciona la carpeta de partidas guardadas",
      properties: ["openDirectory", "createDirectory"],
    });
    const folderPath = result.filePaths[0];

    if (result.canceled || !folderPath) {
      return null;
    }
    return savegameManager.addPath(gameId, toLinuxPath(folderPath));
  });
  handle("savegames:add-suggested", (_event, gameId: string, folderPath: string) =>
    savegameManager.addPath(gameId, folderPath),
  );
  handle("savegames:remove-folder", (_event, gameId: string, folderPath: string) =>
    savegameManager.removePath(gameId, folderPath),
  );
  handle("savegames:backup", async (_event, gameId: string) => {
    try {
      return await reportSlowOperation("savegames:backup", async () => {
        const game = await store.getGame(gameId);
        const settings = await settingsStore.read();

        if (!game) {
          throw new Error("No se encontró el juego manual");
        }
        if (!settings.syncFolderPath) {
          throw new Error("Selecciona primero la carpeta de sincronización en Ajustes");
        }
        savegameManager.setPathContext(gameId, await getSavegamePathContext(game));
        await savegameManager.backupWithOutcome(
          game.id,
          savegameStorageKey(game),
          settings.syncFolderPath,
        );
        return savegameManager.listVersions(
          settings.syncFolderPath,
          savegameStorageKey(game),
        );
      });
    } finally {
      broadcastSavegameChanged(gameId);
    }
  });
  handle(
    "savegames:set-pinned",
    async (_event, gameId: string, versionId: string, pinned: boolean) => {
      const game = await store.getGame(gameId);
      const settings = await settingsStore.read();

      if (!game || !settings.syncFolderPath) {
        throw new Error("No se puede modificar esta copia");
      }
      return savegameManager.setPinned(
        settings.syncFolderPath,
        savegameStorageKey(game),
        versionId,
        pinned,
      );
    },
  );
  handle("savegames:restore", (event, gameId: string, versionId: string) =>
    restoreSavegameWithReview(
      {
        awaitStartupRecovery,
        store,
        settingsStore,
        savegameManager,
        broadcastSavegameChanged,
      },
      event.sender,
      gameId,
      versionId,
    ),
  );
}
