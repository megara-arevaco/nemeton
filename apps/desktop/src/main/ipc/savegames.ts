import fs from "node:fs";
import path from "node:path";
import { BrowserWindow, dialog } from "electron";
import type { MainContext } from "../context.js";
import { handle } from "./handle.js";
import { getRoamingAppData, toLinuxPath } from "../platform.js";
import { SavegameManager } from "../savegames.js";
const resolveSavegameSyncState = ({
  syncConfigured,
  hasMissingPaths,
  hasPaths,
  hasVersions,
  synchronized,
  hasConflict,
}: {
  syncConfigured: boolean;
  hasMissingPaths: boolean;
  hasPaths: boolean;
  hasVersions: boolean;
  synchronized: boolean;
  hasConflict: boolean;
}) => {
  if (!syncConfigured) {
    return "unconfigured";
  }
  if (hasMissingPaths) {
    return "path-missing";
  }
  if (!hasPaths) {
    return "not-detected";
  }
  if (!hasVersions) {
    return "waiting-backup";
  }
  if (synchronized) {
    return "synced";
  }
  return hasConflict ? "conflict" : "pending";
};

export function registerSavegameHandlers({
  store,
  savegameManager,
  settingsStore,
  ludusaviCatalog,
  reportSlowOperation,
}: MainContext) {
  handle("savegames:get", async (_event, gameId: string) =>
    reportSlowOperation("savegames:get", async () => {
      const game = (await store.read()).games.find(
        (item) => item.id === gameId && item.source === "local",
      );

      if (!game) {
        throw new Error(
          "Las partidas sincronizadas solo están disponibles para juegos manuales",
        );
      }

      const settings = await settingsStore.read();
      let paths = await savegameManager.removeInstallRoot(gameId, game.installPath);
      const ludusavi = game.ludusaviGameName
        ? await ludusaviCatalog.find(game.ludusaviGameName)
        : null;
      const policy = await savegameManager.getPolicy(gameId);
      const suggestions = await savegameManager.suggestPaths(
        game.title,
        await getRoamingAppData(),
        game.installPath,
        game.steamAppId,
        ludusavi,
        policy.includeConfig,
        false,
      );

      for (const suggestion of suggestions.filter(
        (item) => item.confidence === "high" && !paths.includes(item.path),
      )) {
        paths = await savegameManager.addPath(gameId, suggestion.path);
      }

      const versions = settings.syncFolderPath
        ? await savegameManager.listVersions(settings.syncFolderPath, game.sourceId)
        : [];
      const missingPaths = (
        await Promise.all(
          paths.map(async (folderPath) => ({
            folderPath,
            exists: Boolean(
              (await fs.promises.stat(folderPath).catch(() => null))?.isDirectory(),
            ),
          })),
        )
      )
        .filter((item) => !item.exists)
        .map((item) => item.folderPath);
      const latestVersion = versions[0];
      const synchronized =
        settings.syncFolderPath &&
        paths.length &&
        !missingPaths.length &&
        versions.length
          ? await savegameManager.currentMatchesLatest(gameId, latestVersion)
          : false;
      const conflict =
        settings.syncFolderPath && paths.length && !missingPaths.length && !synchronized
          ? await savegameManager.detectExternalConflict(
              gameId,
              game.sourceId,
              settings.syncFolderPath,
              latestVersion,
              synchronized,
            )
          : null;
      const syncState = resolveSavegameSyncState({
        syncConfigured: Boolean(settings.syncFolderPath),
        hasMissingPaths: missingPaths.length > 0,
        hasPaths: paths.length > 0,
        hasVersions: versions.length > 0,
        synchronized,
        hasConflict: Boolean(conflict),
      });
      return {
        paths,
        suggestions: suggestions.filter((item) => !paths.includes(item.path)),
        versions,
        policy,
        syncConfigured: Boolean(settings.syncFolderPath),
        syncState,
        missingPaths,
        conflict: conflict?.remoteVersion ?? null,
      };
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
      const game = (await store.read()).games.find(
        (item) => item.id === gameId && item.source === "local",
      );
      const settings = await settingsStore.read();

      if (!game) {
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
      const game = (await store.read()).games.find(
        (item) => item.id === gameId && item.source === "local",
      );
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
    const game = (await store.read()).games.find(
      (item) => item.id === gameId && item.source === "local",
    );
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
