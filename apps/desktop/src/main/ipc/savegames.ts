import { readSavegameState } from "../savegame-state.js";
import type { SavegameState } from "../../shared/savegames.js";
import fs from "node:fs";
import path from "node:path";
import { BrowserWindow, dialog } from "electron";
import type { MainContext } from "../context.js";
import { handle } from "./handle.js";
import { getRoamingAppData, toLinuxPath } from "../platform.js";
import { SavegameManager } from "../savegames.js";
export function registerSavegameHandlers({
  awaitStartupRecovery,
  store,
  savegameManager,
  settingsStore,
  ludusaviCatalog,
  reportSlowOperation,
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

      if (!game || game.source !== "local") {
        throw new Error("No se encontró el juego local");
      }

      const settings = await settingsStore.read();

      if (!settings.syncFolderPath) {
        return { syncState: "unconfigured" as const, conflict: null, versionId: null };
      }
      return savegameManager.verify(gameId, game.sourceId, settings.syncFolderPath);
    }),
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
  handle("savegames:backup", async (_event, gameId: string) =>
    reportSlowOperation("savegames:backup", async () => {
      const game = await store.getGame(gameId);
      const settings = await settingsStore.read();

      if (!game || game.source !== "local") {
        throw new Error("No se encontró el juego manual");
      }
      if (!settings.syncFolderPath) {
        throw new Error("Selecciona primero la carpeta de sincronización en Ajustes");
      }
      await savegameManager.backup(game.id, game.sourceId, settings.syncFolderPath);
      return savegameManager.listVersions(settings.syncFolderPath, game.sourceId);
    }),
  );
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
        game.sourceId,
        versionId,
        pinned,
      );
    },
  );
  handle("savegames:restore", async (event, gameId: string, versionId: string) => {
    await awaitStartupRecovery();
    const game = await store.getGame(gameId);
    const settings = await settingsStore.read();

    if (!game || !settings.syncFolderPath) {
      throw new Error("No se puede restaurar esta copia");
    }

    const version = (
      await savegameManager.listVersions(settings.syncFolderPath, game.sourceId)
    ).find((item) => item.id === versionId);

    if (!version) {
      throw new Error("No se encontró la copia seleccionada");
    }

    const policy = await savegameManager.getPolicy(gameId);
    const details = version
      ? `${version.fileCount} archivos · ${Math.round(version.sizeBytes / 1024)} KB · creada ${new Date(version.createdAt).toLocaleString("es-ES")}.`
      : "";
    const response = await dialog.showMessageBox(
      BrowserWindow.fromWebContents(event.sender)!,
      {
        type: "warning",
        buttons: ["Cancelar", "Restaurar"],
        defaultId: 0,
        cancelId: 0,
        title: "Restaurar partidas",
        message: `¿Restaurar esta versión de ${game.title}?`,
        detail: `${details}\nAntes se copiará el estado presente.${policy.exactRestore ? " La restauración exacta también eliminará archivos que no estén en esta versión." : " Los archivos adicionales se conservarán."}`,
      },
    );

    if (response.response !== 1) {
      return null;
    }
    await savegameManager.backup(
      game.id,
      game.sourceId,
      settings.syncFolderPath,
      versionId,
    );
    return savegameManager.restore(
      game.id,
      game.sourceId,
      settings.syncFolderPath,
      versionId,
    );
  });
}
