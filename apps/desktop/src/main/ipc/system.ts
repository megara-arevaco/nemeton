import { recordOperation } from "../operation-metrics.js";
import { withFileLock } from "@launcher/core";
import { savegamePolicySchema } from "../../shared/ipc-contracts.js";
import { handle } from "./handle.js";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { app, BrowserWindow, dialog } from "electron";
import path from "node:path";
import {
  portableDataSchema,
  portablePackageSchema,
  type PortablePackage,
} from "../../shared/portable-data.js";
import { randomUUID } from "node:crypto";
import {
  hashFile,
  imageSha256,
  MAX_PORTABLE_ARTWORK_BYTES,
  MAX_PORTABLE_BACKUPS_BYTES,
  MAX_PORTABLE_BYTES,
  readBoundedRegularFile,
  readPortableImport,
  writePortableJson,
  writePortablePackage,
} from "../portable-transfer.js";
import type { MainContext } from "../context.js";
import { achievementHistorySchema, remoteLibrarySchema } from "../sync-validation.js";
import { z } from "zod";
const execFileAsync = promisify(execFile);
const portableSourceIdIsSafe = (value: string) => /^[a-zA-Z0-9_-]{1,240}$/.test(value);

const dataFileFor = (category: "library" | "savegames" | "achievements") =>
  path.join(
    app.getPath("userData"),
    category === "library"
      ? "library.json"
      : category === "savegames"
        ? "savegames.json"
        : "achievements-history.json",
  );

function withImportLocks<T>(operation: () => Promise<T>) {
  return withFileLock(dataFileFor("library"), () =>
    withFileLock(dataFileFor("savegames"), () =>
      withFileLock(dataFileFor("achievements"), operation),
    ),
  );
}

export const registerSystemHandlers = ({
  folderSyncService,
  settingsStore,
  store,
  savegameManager,
  coversDirectory,
  achievementService,
  broadcastLibrary,
}: MainContext) => {
  handle("performance:record", (_event, name, elapsedMs) => {
    recordOperation(`renderer:${name}`, elapsedMs);
  });
  handle("workspace:status", async () => {
    const version = app.getVersion();

    if (app.isPackaged) {
      return { branch: null, version };
    }
    try {
      const { stdout } = await execFileAsync("git", ["branch", "--show-current"], {
        cwd: process.cwd(),
        timeout: 2_000,
        windowsHide: true,
      });
      return { branch: stdout.trim() || "HEAD", version };
    } catch {
      return { branch: null, version };
    }
  });
  handle("window:minimize", (event) =>
    BrowserWindow.fromWebContents(event.sender)?.minimize(),
  );
  handle("window:toggle-maximize", (event) => {
    const target = BrowserWindow.fromWebContents(event.sender);

    if (target?.isMaximized()) {
      target.unmaximize();
    } else {
      target?.maximize();
    }
  });
  handle("window:close", (event) =>
    BrowserWindow.fromWebContents(event.sender)?.close(),
  );
  handle("runtime:data-location", () => ({
    portable: Boolean(process.env.PORTABLE_EXECUTABLE_DIR),
    dataDirectory: app.getPath("userData"),
  }));
  handle("data:export", async (event, options) => {
    const spanish = options.language === "es";
    const extension = options.format === "package" ? "zip" : "json";
    const result = await dialog.showSaveDialog(
      BrowserWindow.fromWebContents(event.sender)!,
      {
        title: spanish ? "Exportar datos de Nemeton" : "Export Nemeton data",
        defaultPath: path.join(app.getPath("documents"), `nemeton-data.${extension}`),
        filters: [
          {
            name:
              options.format === "package"
                ? "Nemeton portable package"
                : "Nemeton JSON data",
            extensions: [extension],
          },
        ],
      },
    );

    if (result.canceled || !result.filePath) {
      return null;
    }
    if (await fs.promises.lstat(result.filePath).catch(() => null)) {
      throw new Error(
        "This file already exists. Choose a new name to avoid overwriting it.",
      );
    }

    const snapshot = await store.read();

    if (
      snapshot.games.some(
        (game) => game.source === "local" && !portableSourceIdIsSafe(game.sourceId),
      )
    ) {
      throw new Error(
        "A local game identifier looks like a machine path; export was cancelled to avoid disclosing it.",
      );
    }

    const games = snapshot.games.map((game) => ({
      id: game.id,
      source: game.source,
      sourceId: game.sourceId,
      steamAppId: game.steamAppId ?? null,
      achievementStateId: game.achievementStateId ?? null,
      ludusaviGameName: game.ludusaviGameName ?? null,
      title: game.title,
      coverUrl: game.coverUrl,
      heroUrl: game.heroUrl,
      playtimeMinutes: game.playtimeMinutes,
      playtimeSecondsRemainder: game.playtimeSecondsRemainder ?? 0,
      platformPlaytimeMinutes: game.platformPlaytimeMinutes ?? null,
      trackedPlaytimeSeconds: game.trackedPlaytimeSeconds ?? 0,
      hiddenFromLibrary: game.hiddenFromLibrary ?? false,
      favorite: game.favorite ?? false,
      backlogStatus: game.backlogStatus ?? null,
      lastPlayedAt: game.lastPlayedAt,
      importedAt: game.importedAt,
      updatedAt: game.updatedAt ?? game.importedAt,
    }));
    const gameIds = new Set(games.map((game) => game.id));
    const savegamePolicies: Record<
      string,
      Awaited<ReturnType<typeof savegameManager.getPolicy>>
    > = {};

    for (const game of snapshot.games.filter((item) => item.source === "local")) {
      savegamePolicies[`local:${game.sourceId}`] = await savegameManager.getPolicy(
        game.id,
      );
    }

    const portable = portableDataSchema.parse({
      format: "nemeton-portable-data",
      version: 1,
      exportedAt: new Date().toISOString(),
      preferences: { language: options.language, accentTheme: options.accentTheme },
      achievementHistory: await achievementService.readHistory(),
      library: {
        version: 1,
        games,
        sessions: snapshot.sessions.filter((session) => gameIds.has(session.gameId)),
        excludedGameKeys: snapshot.excludedGameKeys ?? [],
      },
      savegamePolicies,
    });

    if (options.format === "json") {
      const serialized = JSON.stringify(portable, null, 2);

      if (Buffer.byteLength(serialized, "utf8") > MAX_PORTABLE_BYTES) {
        throw new Error("The export is larger than the 100 MB safety limit.");
      }
      await writePortableJson(result.filePath, serialized);
      return { gameCount: games.length, assetCount: 0, backupCount: 0 };
    }

    const staging = await fs.promises.mkdtemp(
      path.join(app.getPath("userData"), ".portable-export-"),
    );

    try {
      const sources = new Map<string, string>();
      const assets: PortablePackage["assets"] = [];
      let artworkBytes = 0;

      if (options.includeArtwork) {
        const coverRoot = path.resolve(coversDirectory);
        const coverRootReal = await fs.promises
          .realpath(coverRoot)
          .catch(() => coverRoot);

        for (const game of snapshot.games) {
          if (!game.coverPath) {
            continue;
          }

          const extension = path.extname(game.coverPath).toLowerCase();

          if (
            path.basename(game.coverPath) !== game.coverPath ||
            ![".png", ".jpg", ".jpeg", ".webp"].includes(extension)
          ) {
            throw new Error(
              "A local cover has an unsafe filename; export was cancelled.",
            );
          }

          const coverPath = path.join(coverRoot, game.coverPath);
          const info = await fs.promises.lstat(coverPath);
          const realPath = await fs.promises.realpath(coverPath);

          if (
            !info.isFile() ||
            info.isSymbolicLink() ||
            !realPath.startsWith(`${coverRootReal}${path.sep}`)
          ) {
            throw new Error(
              "A local cover is not a regular file inside Nemeton's artwork folder.",
            );
          }

          const hash = await imageSha256(realPath, 10 * 1024 * 1024);
          artworkBytes += hash.size;
          if (artworkBytes > MAX_PORTABLE_ARTWORK_BYTES) {
            throw new Error("Artwork exceeds the 50 MB package limit.");
          }

          const packagePath = `assets/covers/${game.id}${extension}`;
          assets.push({
            path: packagePath,
            source: game.source,
            sourceId: game.sourceId,
            extension: extension as ".png" | ".jpg" | ".jpeg" | ".webp",
            ...hash,
          });
          sources.set(packagePath, realPath);
        }
      }

      const backups: PortablePackage["backups"] = [];

      if (options.includeBackups) {
        const syncSettings = await settingsStore.read();

        if (
          !syncSettings.syncFolderPath ||
          !(
            await fs.promises.stat(syncSettings.syncFolderPath).catch(() => null)
          )?.isDirectory()
        ) {
          throw new Error(
            "Configure an available sync folder before including save backups.",
          );
        }

        let remaining = MAX_PORTABLE_BACKUPS_BYTES;
        let index = 0;

        for (const [gameIndex, game] of snapshot.games
          .filter((item) => item.source === "local")
          .entries()) {
          const gameStage = path.join(staging, `game-${gameIndex}`);
          await fs.promises.mkdir(gameStage);
          const files = await savegameManager.createPortableBackupFiles(
            syncSettings.syncFolderPath,
            game.sourceId,
            gameStage,
            remaining,
          );

          for (const backup of files) {
            remaining -= backup.size;
            const packagePath = `backups/backup-${index++}.zip`;
            backups.push({
              path: packagePath,
              gameKey: `local:${game.sourceId}`,
              versionId: backup.versionId,
              size: backup.size,
              sha256: backup.sha256,
            });
            sources.set(packagePath, backup.filePath);
          }
        }
      }

      const packageData = portablePackageSchema.parse({
        format: "nemeton-portable-package",
        version: 1,
        exportedAt: portable.exportedAt,
        data: portable,
        assets,
        backups,
      });
      await writePortablePackage(result.filePath, packageData, sources);
      return {
        gameCount: games.length,
        assetCount: assets.length,
        backupCount: backups.length,
      };
    } finally {
      await fs.promises.rm(staging, { recursive: true, force: true });
    }
  });
  handle("data:import", async (event, language) => {
    const spanish = language === "es";
    const selection = await dialog.showOpenDialog(
      BrowserWindow.fromWebContents(event.sender)!,
      {
        title: spanish ? "Importar datos de Nemeton" : "Import Nemeton data",
        properties: ["openFile"],
        filters: [
          { name: "Nemeton data and packages", extensions: ["json", "zip", "nemeton"] },
        ],
      },
    );
    const filePath = selection.filePaths[0];

    if (selection.canceled || !filePath) {
      return null;
    }

    const userData = app.getPath("userData");
    const staging = await fs.promises.mkdtemp(path.join(userData, ".portable-import-"));

    try {
      const prepared = await readPortableImport(filePath, staging, savegameManager);
      const parsed = prepared.data;

      if (
        parsed.library.games.some(
          (game) => game.source === "local" && !portableSourceIdIsSafe(game.sourceId),
        )
      ) {
        throw new Error(
          "The import contains a local game identifier that looks like a machine path.",
        );
      }

      const local = await store.read();
      const gameIds = new Set(local.games.map((game) => game.id));

      if (local.sessions.some((session) => !gameIds.has(session.gameId))) {
        throw new Error(
          "The local library contains orphan sessions. Review and repair them manually before importing; no records were changed.",
        );
      }

      const syncSettings = await settingsStore.read();

      if (
        prepared.backups.length &&
        (!syncSettings.syncFolderPath ||
          !(
            await fs.promises.stat(syncSettings.syncFolderPath).catch(() => null)
          )?.isDirectory())
      ) {
        throw new Error(
          "Configure an available sync folder before importing optional save backups.",
        );
      }

      const confirmation = await dialog.showMessageBox(
        BrowserWindow.fromWebContents(event.sender)!,
        {
          type: "warning",
          buttons: spanish ? ["Cancelar", "Combinar datos"] : ["Cancel", "Merge data"],
          defaultId: 0,
          cancelId: 0,
          title: spanish ? "Importar datos de Nemeton" : "Import Nemeton data",
          message: spanish
            ? `¿Combinar ${parsed.library.games.length} fichas con esta biblioteca?`
            : `Merge ${parsed.library.games.length} game records into this library?`,
          detail: spanish
            ? `Se conservan instalaciones y rutas locales. El archivo no contiene ejecutables, claves API ni rutas de máquina. Se crearán copias de seguridad antes del merge. Imágenes: ${prepared.assets.size}; copias de partidas: ${prepared.backups.length}.`
            : `Existing installations and local save-folder locations are preserved. Executables, API keys, and machine paths are excluded. Safety copies are created first. Artwork: ${prepared.assets.size}; save backups: ${prepared.backups.length}.`,
        },
      );

      if (confirmation.response !== 1) {
        return null;
      }

      return await withImportLocks(async () => {
        const transactionLocal = await store.read();
        const [libraryBackup, savegameBackup, achievementBackup] = await Promise.all([
          store.createSafetyBackup("before-import"),
          savegameManager.createSafetyBackup("before-import"),
          achievementService.createSafetyBackup("before-import"),
        ]);
        const createdAssets: Array<{ filePath: string; sha256: string }> = [];
        const importedBackupFiles: Array<{ filePath: string; sha256: string }> = [];
        let libraryTouched = false;
        let policiesTouched = false;
        let achievementsTouched = false;
        let committedSnapshot: Awaited<ReturnType<typeof store.read>> | null = null;

        try {
          await fs.promises.mkdir(coversDirectory, { recursive: true });
          const coversInfo = await fs.promises.lstat(coversDirectory);

          if (!coversInfo.isDirectory() || coversInfo.isSymbolicLink()) {
            throw new Error("Nemeton's artwork folder is not a safe directory.");
          }

          const resolvedAssets = new Map<string, string>();

          for (const [gameKey, staged] of prepared.assets) {
            const localGame = transactionLocal.games.find(
              (game) => `${game.source}:${game.sourceId}` === gameKey,
            );

            if (localGame?.coverPath) {
              continue;
            }

            const extension = path.extname(staged).toLowerCase();
            const fileName = `portable-${randomUUID()}${extension}`;
            const target = path.join(coversDirectory, fileName);
            const hash = await hashFile(staged, 10 * 1024 * 1024);
            await fs.promises.copyFile(staged, target, fs.constants.COPYFILE_EXCL);
            createdAssets.push({ filePath: target, sha256: hash.hash });
            resolvedAssets.set(gameKey, fileName);
          }

          for (const backup of prepared.backups) {
            const sourceId = backup.gameKey.slice("local:".length);
            const imported = await savegameManager.importPortableBackup(
              syncSettings.syncFolderPath!,
              sourceId!,
              backup.versionId,
              backup.filePath,
              backup.sha256,
            );

            if (imported.created) {
              importedBackupFiles.push({
                filePath: imported.path,
                sha256: backup.sha256,
              });
            }
          }

          const importedLibrary = {
            ...parsed.library,
            games: parsed.library.games.map((game) => ({
              ...game,
              coverPath: resolvedAssets.get(`${game.source}:${game.sourceId}`) ?? null,
            })),
          } as import("@launcher/core").LibrarySnapshot;
          libraryTouched = true;
          const snapshot = await store.importPortableSnapshot(importedLibrary);
          const gamesByKey = new Map(
            snapshot.games.map((game) => [`${game.source}:${game.sourceId}`, game]),
          );
          const policies: Record<
            string,
            import("../../shared/savegames.js").SavegamePolicy
          > = {};

          for (const [key, policy] of Object.entries(parsed.savegamePolicies)) {
            const game = gamesByKey.get(key);

            if (game) {
              policies[game.id] = policy;
            }
          }
          policiesTouched = true;
          await savegameManager.importPortablePolicies(policies);
          const excludedGameKeys = new Set(snapshot.excludedGameKeys ?? []);
          const excludedSourceIds = new Set(
            [...excludedGameKeys].map((key) => key.slice(key.indexOf(":") + 1)),
          );
          const preservedLocalSourceIds = new Set(
            snapshot.games
              .filter((game) => excludedGameKeys.has(`${game.source}:${game.sourceId}`))
              .map((game) => game.sourceId),
          );
          achievementsTouched = true;
          await achievementService.mergeHistory(
            parsed.achievementHistory,
            excludedSourceIds,
            preservedLocalSourceIds,
          );
          committedSnapshot = snapshot;
        } catch (error) {
          const rollbackErrors: unknown[] = [];

          for (const [touched, category, backup] of [
            [achievementsTouched, "achievements", achievementBackup],
            [policiesTouched, "savegames", savegameBackup],
            [libraryTouched, "library", libraryBackup],
          ] as const) {
            if (!touched) {
              continue;
            }
            try {
              await rollbackImportFile(dataFileFor(category), backup);
            } catch (rollbackError) {
              rollbackErrors.push(rollbackError);
            }
          }
          for (const item of importedBackupFiles) {
            try {
              const current = await hashFile(item.filePath, 40 * 1024 * 1024);

              if (current.hash === item.sha256) {
                await fs.promises.unlink(item.filePath);
              }
            } catch (cleanupError) {
              rollbackErrors.push(cleanupError);
            }
          }
          for (const item of createdAssets) {
            try {
              const current = await hashFile(item.filePath, 10 * 1024 * 1024);

              if (current.hash === item.sha256) {
                await fs.promises.unlink(item.filePath);
              }
            } catch (cleanupError) {
              rollbackErrors.push(cleanupError);
            }
          }
          if (rollbackErrors.length) {
            throw new AggregateError(
              [error, ...rollbackErrors],
              "Portable import failed; safety copies were preserved, but automatic rollback was incomplete.",
            );
          }
          throw error;
        }

        try {
          await broadcastLibrary(committedSnapshot!);
        } catch (error) {
          console.error("[portable:import:broadcast]", error);
        }
        return {
          gameCount: parsed.library.games.length,
          preferences: parsed.preferences,
          libraryBackup,
          savegameBackup,
          achievementBackup,
          assetCount: prepared.assets.size,
          backupCount: prepared.backups.length,
        };
      });
    } finally {
      await fs.promises.rm(staging, { recursive: true, force: true }).catch((error) => {
        console.error("[portable:import:staging-cleanup]", error);
      });
    }
  });
  handle("data:list-import-backups", async () =>
    listImportBackups(app.getPath("userData")),
  );
  handle("data:restore-import-backup", async (event, category, fileName, language) => {
    const spanish = language === "es";
    const backups = await listImportBackups(app.getPath("userData"));

    if (
      !backups.some((item) => item.category === category && item.fileName === fileName)
    ) {
      throw new Error("The selected recovery copy is no longer available.");
    }

    const source = path.join(app.getPath("userData"), fileName);
    await validateRecoveryCopy(category, source);
    const confirmation = await dialog.showMessageBox(
      BrowserWindow.fromWebContents(event.sender)!,
      {
        type: "warning",
        buttons: spanish ? ["Cancelar", "Restaurar copia"] : ["Cancel", "Restore copy"],
        defaultId: 0,
        cancelId: 0,
        title: spanish ? "Recuperar datos importados" : "Recover imported data",
        message: spanish
          ? "¿Restaurar esta copia previa a la importación?"
          : "Restore this pre-import safety copy?",
        detail: spanish
          ? "El estado actual se conservará como otra copia antes de restaurar. La reparación no se hará si esa copia previa no puede crearse."
          : "The current state will be preserved as another copy before restoration. Recovery will not proceed if that safety copy cannot be created.",
      },
    );

    if (confirmation.response !== 1) {
      return null;
    }

    const target = dataFileFor(category);
    const restored = await withFileLock(target, async () => {
      const currentBackups = await listImportBackups(app.getPath("userData"));

      if (
        !currentBackups.some(
          (item) => item.category === category && item.fileName === fileName,
        )
      ) {
        throw new Error("The selected recovery copy is no longer available.");
      }
      await validateRecoveryCopy(category, source);
      const targetInfo = await fs.promises
        .lstat(target)
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") {
            return null;
          }
          throw error;
        });

      if (targetInfo?.isSymbolicLink() || (targetInfo && !targetInfo.isFile())) {
        throw new Error("Recovery refused a non-regular current data file.");
      }

      const targetHash = targetInfo
        ? (await hashFile(target, MAX_PORTABLE_BYTES)).hash
        : null;
      const safetyCopy = await createCategoryBackup(
        category,
        "before-recovery",
        store,
        savegameManager,
        achievementService,
      );
      const currentInfo = await fs.promises
        .lstat(target)
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") {
            return null;
          }
          throw error;
        });
      const currentHash = currentInfo
        ? (await hashFile(target, MAX_PORTABLE_BYTES)).hash
        : null;

      if (currentHash !== targetHash) {
        throw new Error(
          "Current data changed during recovery. Nothing was replaced; both safety copies remain available.",
        );
      }
      await replaceFromRecoveryCopy(target, source);
      return {
        safetyCopy,
        snapshot: category === "library" ? await store.read() : null,
      };
    });

    if (restored.snapshot) {
      await broadcastLibrary(restored.snapshot).catch((error) => {
        console.error("[recovery:broadcast]", error);
      });
    }
    return { safetyCopy: restored.safetyCopy };
  });
  handle("data:session-diagnostics", async () => {
    const snapshot = await store.read();
    const ids = new Set(snapshot.games.map((game) => game.id));
    const sessions = snapshot.sessions.filter((session) => !ids.has(session.gameId));
    return {
      orphanCount: sessions.length,
      sessions: sessions.slice(0, 200).map((session) => ({
        id: session.id,
        gameId: session.gameId,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        durationSeconds: session.durationSeconds,
      })),
      games: snapshot.games.map(({ id, title }) => ({ id, title })),
    };
  });
  handle("data:repair-sessions", async (event, decisions, language) => {
    const snapshot = await store.read();
    const ids = new Set(snapshot.games.map((game) => game.id));
    const orphans = new Map(
      snapshot.sessions
        .filter((session) => !ids.has(session.gameId))
        .map((session) => [session.id, session]),
    );
    const repaired = decisions.filter((decision) => decision.gameId !== null).length;
    const discarded = decisions.length - repaired;

    if (
      decisions.some(
        (decision) =>
          !orphans.has(decision.sessionId) ||
          (decision.gameId !== null && !ids.has(decision.gameId)),
      )
    ) {
      throw new Error(
        "The selected sessions or games changed. Diagnose the library again before applying.",
      );
    }

    const spanish = language === "es";
    const confirmation = await dialog.showMessageBox(
      BrowserWindow.fromWebContents(event.sender)!,
      {
        type: "warning",
        buttons: spanish
          ? ["Cancelar", "Reparar sesiones"]
          : ["Cancel", "Repair sessions"],
        defaultId: 0,
        cancelId: 0,
        title: spanish ? "Reparación manual de historial" : "Manual session repair",
        message: spanish
          ? `¿Aplicar ${repaired} reasignaciones y descartar ${discarded} sesiones seleccionadas?`
          : `Apply ${repaired} reassignments and discard ${discarded} selected sessions?`,
        detail: spanish
          ? "No se asignará ni eliminará ninguna sesión sin esta confirmación. Se creará una copia de la biblioteca antes de aplicar las decisiones."
          : "No session will be reassigned or discarded without this confirmation. A library safety copy will be created before applying the decisions.",
      },
    );

    if (confirmation.response !== 1) {
      return { repairedCount: 0, discardedCount: 0, safetyCopy: null };
    }

    const result = await withFileLock(dataFileFor("library"), async () => {
      const safetyCopy = await store.createSafetyBackup("before-session-repair");
      const repairedSnapshot = await store.repairOrphanSessions(decisions);
      return { ...repairedSnapshot, safetyCopy };
    });

    await broadcastLibrary(result.snapshot).catch((error) => {
      console.error("[sessions:repair:broadcast]", error);
    });
    return {
      repairedCount: result.repairedCount,
      discardedCount: result.discardedCount,
      safetyCopy: result.safetyCopy,
    };
  });
  handle("sync:settings", async () => {
    const settings = await settingsStore.read();
    const exists = settings.syncFolderPath
      ? Boolean(
          (
            await fs.promises.stat(settings.syncFolderPath).catch(() => null)
          )?.isDirectory(),
        )
      : false;
    return {
      folderPath: settings.syncFolderPath ?? null,
      lastSyncedAt: settings.lastSyncedAt ?? null,
      status: !settings.syncFolderPath
        ? "unconfigured"
        : folderSyncService.isSyncing
          ? "syncing"
          : folderSyncService.syncError
            ? "error"
            : exists
              ? "ready"
              : "missing",
      error: folderSyncService.syncError,
    };
  });
  handle("sync:select-folder", async () => {
    const settings = await settingsStore.read();
    const result = await dialog.showOpenDialog({
      title: "Selecciona la carpeta de sincronización",
      defaultPath: settings.syncFolderPath ?? undefined,
      properties: ["openDirectory", "createDirectory"],
    });
    const folderPath = result.filePaths[0];

    if (result.canceled || !folderPath) {
      return null;
    }
    return folderSyncService.sync(folderPath);
  });
  handle("sync:now", async () => {
    const settings = await settingsStore.read();

    if (!settings.syncFolderPath) {
      throw new Error("Selecciona primero una carpeta de sincronización");
    }
    return folderSyncService.sync(settings.syncFolderPath);
  });
};

type BackupCategory = "library" | "savegames" | "achievements";

type BackupReason = "before-import" | "before-session-repair" | "before-recovery";

const recoverySavegamesSchema = z
  .object({
    deviceId: z.string().min(1).max(240),
    deviceName: z.string().max(240),
    games: z.record(
      z.string().min(1).max(240),
      z.array(z.string().max(4096)).max(1000),
    ),
    policies: z.record(z.string().max(240), savegamePolicySchema).optional(),
    learned: z
      .record(z.string().max(500), z.array(z.string().max(4096)).max(20))
      .optional(),
    backupFailures: z
      .record(
        z.string().max(240),
        z.object({
          failedAt: z
            .string()
            .max(64)
            .refine((value) => Number.isFinite(Date.parse(value))),
          message: z.string().max(2000),
        }),
      )
      .optional(),
  })
  .passthrough();

async function listImportBackups(userData: string) {
  const entries = await fs.promises.readdir(userData, { withFileTypes: true });
  const categoryByFile = new Map<string, BackupCategory>([
    ["library.json", "library"],
    ["savegames.json", "savegames"],
    ["achievements-history.json", "achievements"],
  ]);
  const result: Array<{
    category: BackupCategory;
    fileName: string;
    createdAt: string;
    reason: BackupReason;
  }> = [];
  const reasons: BackupReason[] = [
    "before-import",
    "before-session-repair",
    "before-recovery",
  ];

  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      continue;
    }
    for (const [base, category] of categoryByFile) {
      const reason = reasons.find((item) => entry.name.startsWith(`${base}.${item}-`));

      if (!reason) {
        continue;
      }

      const timestamp = entry.name.slice(`${base}.${reason}-`.length);

      if (!/^[0-9TZ-]+\.bak$/.test(timestamp)) {
        continue;
      }

      const fullPath = path.join(userData, entry.name);
      const info = await fs.promises.lstat(fullPath);

      if (!info.isFile() || info.isSymbolicLink()) {
        continue;
      }
      result.push({
        category,
        fileName: entry.name,
        createdAt: info.mtime.toISOString(),
        reason,
      });
    }
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function validateRecoveryCopy(category: BackupCategory, filePath: string) {
  const info = await fs.promises.lstat(filePath);

  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_PORTABLE_BYTES) {
    throw new Error("The recovery copy is not a regular supported file.");
  }

  let value: unknown;

  try {
    value = JSON.parse(
      (await readBoundedRegularFile(filePath, MAX_PORTABLE_BYTES)).toString("utf8"),
    );
  } catch {
    throw new Error(
      "The recovery copy is not valid JSON; current data was left untouched.",
    );
  }

  const valid =
    category === "library"
      ? isValidRecoveryLibrary(value)
      : category === "savegames"
        ? recoverySavegamesSchema.safeParse(value).success
        : achievementHistorySchema.safeParse(value).success;

  if (!valid) {
    throw new Error(`The ${category} recovery copy has an unsupported structure.`);
  }
}

function isValidRecoveryLibrary(value: unknown) {
  const parsed = remoteLibrarySchema.safeParse(value);

  if (!parsed.success) {
    return false;
  }

  const ids = new Set<string>();
  const gameKeys = new Set<string>();

  for (const game of parsed.data.games) {
    const key = `${game.source}:${game.sourceId}`;

    if (
      ids.has(game.id) ||
      gameKeys.has(key) ||
      (game.source === "steam" &&
        (!/^[1-9]\d{0,11}$/.test(game.sourceId) ||
          (game.steamAppId != null && game.steamAppId !== game.sourceId)))
    ) {
      return false;
    }
    ids.add(game.id);
    gameKeys.add(key);
  }

  const sessionIds = new Set<string>();

  return parsed.data.sessions.every((session) => {
    if (!ids.has(session.gameId) || sessionIds.has(session.id)) {
      return false;
    }
    sessionIds.add(session.id);
    return true;
  });
}

async function createCategoryBackup(
  category: BackupCategory,
  label: string,
  store: MainContext["store"],
  savegameManager: MainContext["savegameManager"],
  achievementService: MainContext["achievementService"],
) {
  if (category === "library") {
    return store.createSafetyBackup(label);
  }
  if (category === "savegames") {
    return savegameManager.createSafetyBackup(label);
  }
  return achievementService.createSafetyBackup(label);
}

async function replaceFromRecoveryCopy(target: string, source: string) {
  const targetParent = path.dirname(path.resolve(target));

  if (path.dirname(path.resolve(source)) !== targetParent) {
    throw new Error("Recovery copy is outside the Nemeton data directory.");
  }

  const sourceInfo = await fs.promises.lstat(source);
  const targetInfo = await fs.promises.lstat(target).catch(() => null);

  if (
    !sourceInfo.isFile() ||
    sourceInfo.isSymbolicLink() ||
    targetInfo?.isSymbolicLink()
  ) {
    throw new Error("Recovery cannot use a symbolic link.");
  }

  const temporary = `${target}.restore-${randomUUID()}`;
  await fs.promises.copyFile(source, temporary, fs.constants.COPYFILE_EXCL);
  try {
    await fs.promises.rename(temporary, target);
  } finally {
    await fs.promises.unlink(temporary).catch(() => undefined);
  }
}

async function rollbackImportFile(target: string, backup: string | null) {
  const targetInfo = await fs.promises.lstat(target).catch(() => null);

  if (targetInfo?.isSymbolicLink()) {
    throw new Error(`Rollback refused a symbolic link at ${target}`);
  }
  if (backup) {
    const backupInfo = await fs.promises.lstat(backup);

    if (
      !backupInfo.isFile() ||
      backupInfo.isSymbolicLink() ||
      path.dirname(path.resolve(backup)) !== path.dirname(path.resolve(target))
    ) {
      throw new Error(`Rollback safety copy is invalid: ${backup}`);
    }
  }
  if (targetInfo?.isFile()) {
    const failedPath = `${target}.import-failed-${randomUUID()}.bak`;
    await fs.promises.copyFile(target, failedPath, fs.constants.COPYFILE_EXCL);
  }
  if (!backup) {
    if (targetInfo?.isFile()) {
      await fs.promises.unlink(target);
    }
    return;
  }
  await replaceFromRecoveryCopy(target, backup);
}
