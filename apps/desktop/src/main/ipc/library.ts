import fs from "node:fs";
import path from "node:path";
import { BrowserWindow, dialog } from "electron";
import type { MainContext } from "../context.js";
import { handle } from "./handle.js";
import { fetchSteamGameMetadata } from "@launcher/core";
import { openExternal } from "../platform.js";
export function registerLibraryHandlers({
  store,
  achievementService,
  coversDirectory,
  savegameManager,
  settingsStore,
  scheduleAutoSync,
}: MainContext) {
  handle("library:list", () => store.read());
  handle("library:metadata", async (_event, gameId: string) => {
    const game = (await store.read()).games.find((item) => item.id === gameId);

    if (!game) {
      return null;
    }

    const appId = game.source === "steam" ? game.sourceId : game.steamAppId;

    if (!appId) {
      return null;
    }

    return fetchSteamGameMetadata(appId);
  });
  handle("library:achievements", async (_event, gameId: string) => {
    const game = (await store.read()).games.find((item) => item.id === gameId);

    if (!game) {
      return { total: 0, unlocked: 0, items: [] };
    }

    const result = await achievementService.discover(game);
    await achievementService.record(game, result);
    return result;
  });
  handle("dialog:select-executable", async () => {
    const result = await dialog.showOpenDialog({
      title: "Selecciona el ejecutable del juego",
      properties: ["openFile"],
      filters:
        process.platform === "win32"
          ? [{ name: "Ejecutables", extensions: ["exe", "bat", "cmd"] }]
          : [],
    });
    const executablePath = result.filePaths[0];

    if (result.canceled || !executablePath) {
      return null;
    }
    return {
      path: executablePath,
      suggestedTitle: path.basename(executablePath, path.extname(executablePath)),
    };
  });
  handle("dialog:select-artwork", async () => {
    const result = await dialog.showOpenDialog({
      title: "Selecciona una carátula",
      properties: ["openFile"],
      filters: [{ name: "Imágenes", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    const artworkPath = result.filePaths[0];

    if (result.canceled || !artworkPath) {
      return null;
    }

    const stats = await fs.promises.stat(artworkPath).catch(() => null);

    if (!stats?.isFile() || stats.size > 10 * 1024 * 1024) {
      throw new Error("La carátula debe pesar menos de 10 MB");
    }

    const extension = path.extname(artworkPath).toLowerCase();
    const mime =
      extension === ".png"
        ? "image/png"
        : extension === ".webp"
          ? "image/webp"
          : "image/jpeg";
    const bytes = await fs.promises.readFile(artworkPath);
    return {
      path: artworkPath,
      name: path.basename(artworkPath),
      previewUrl: `data:${mime};base64,${bytes.toString("base64")}`,
    };
  });
  handle(
    "library:add-local",
    async (
      _event,
      input: {
        title: string;
        executablePath: string;
        artworkPath?: string | null;
        coverUrl?: string | null;
        heroUrl?: string | null;
        steamAppId?: string | null;
        ludusaviGameName?: string | null;
      },
    ) => {
      const title = input.title.trim();
      const executablePath = input.executablePath
        ? path.resolve(input.executablePath)
        : "";
      const executable = executablePath
        ? await fs.promises.stat(executablePath).catch(() => null)
        : null;

      if (!title) {
        throw new Error("Escribe un nombre para el juego");
      }
      if (executablePath && !executable?.isFile()) {
        throw new Error("El ejecutable seleccionado no existe");
      }

      let snapshot = await store.addLocal({
        title,
        executablePath,
        coverUrl: input.coverUrl,
        heroUrl: input.heroUrl,
        steamAppId: input.steamAppId,
        ludusaviGameName: input.ludusaviGameName,
      });
      const game = [...snapshot.games]
        .reverse()
        .find(
          (item) =>
            item.source === "local" &&
            (executablePath
              ? item.installPath && path.resolve(item.installPath) === executablePath
              : item.title === title),
        );

      if (game && input.artworkPath) {
        const extension = path.extname(input.artworkPath).toLowerCase();

        if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
          throw new Error("Formato de carátula no compatible");
        }

        const info = await fs.promises.stat(input.artworkPath);

        if (!info.isFile() || info.size > 10 * 1024 * 1024) {
          throw new Error("La carátula debe pesar menos de 10 MB");
        }
        await fs.promises.mkdir(coversDirectory, { recursive: true });
        const fileName = `${game.id}${extension}`;
        await fs.promises.copyFile(
          input.artworkPath,
          path.join(coversDirectory, fileName),
        );
        snapshot = await store.setCover(game.id, fileName);
      }
      scheduleAutoSync();
      return snapshot;
    },
  );
  handle(
    "library:update-local",
    async (
      _event,
      gameId: string,
      input: {
        title: string;
        executablePath: string;
        playtimeMinutes: number;
        steamAppId?: string | null;
        ludusaviGameName?: string | null;
      },
    ) => {
      if (input.steamAppId && !/^\d+$/.test(input.steamAppId.trim())) {
        throw new Error("El Steam AppID debe contener solo números");
      }
      if (!input.title.trim()) {
        throw new Error("Escribe un nombre para el juego");
      }
      if (input.executablePath) {
        const executable = await fs.promises
          .stat(input.executablePath)
          .catch(() => null);

        if (!executable?.isFile()) {
          throw new Error("El ejecutable seleccionado no existe");
        }
      }

      const snapshot = await store.updateLocalGame(gameId, input);
      scheduleAutoSync();
      return snapshot;
    },
  );
  handle("library:set-cover", async (_event, gameId: string) => {
    const result = await dialog.showOpenDialog({
      title: "Selecciona una carátula",
      properties: ["openFile"],
      filters: [{ name: "Imágenes", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    const source = result.filePaths[0];

    if (result.canceled || !source) {
      return null;
    }
    await fs.promises.mkdir(coversDirectory, { recursive: true });
    const extension = path.extname(source).toLowerCase();
    const info = await fs.promises.stat(source);

    if (
      ![".png", ".jpg", ".jpeg", ".webp"].includes(extension) ||
      !info.isFile() ||
      info.size > 10 * 1024 * 1024
    ) {
      throw new Error("La carátula debe ser una imagen de menos de 10 MB");
    }

    const fileName = `${gameId}${extension}`;
    await fs.promises.copyFile(source, path.join(coversDirectory, fileName));
    const snapshot = await store.setCover(gameId, fileName);
    scheduleAutoSync();
    return snapshot;
  });
  handle("library:uninstall-or-hide", async (_event, gameId: string) => {
    const game = (await store.read()).games.find((item) => item.id === gameId);

    if (!game) {
      throw new Error("No se encontró el juego");
    }
    if (game.source === "steam" && game.installed) {
      await openExternal(`steam://uninstall/${game.sourceId}`);
    }

    const snapshot = await store.hideFromLibrary(gameId);
    scheduleAutoSync();
    return snapshot;
  });
  handle(
    "library:delete-forever",
    async (_event, gameId: string, confirmation: string) => {
      const game = (await store.read()).games.find((item) => item.id === gameId);

      if (!game) {
        throw new Error("No se encontró el juego");
      }
      if (
        confirmation.trim().toLocaleLowerCase() !==
        game.title.trim().toLocaleLowerCase()
      ) {
        throw new Error("El nombre de confirmación no coincide");
      }

      const settings = await settingsStore.read();
      await savegameManager.purgeGame(
        game.id,
        game.title,
        game.sourceId,
        settings.syncFolderPath,
      );
      await achievementService.purgeGame(game.sourceId);

      const coverFiles = await fs.promises.readdir(coversDirectory).catch(() => []);
      await Promise.all(
        coverFiles
          .filter((fileName) => fileName.startsWith(`${game.id}.`))
          .map((fileName) =>
            fs.promises.unlink(path.join(coversDirectory, fileName)).catch(() => null),
          ),
      );

      const snapshot = await store.deleteForever(gameId);
      scheduleAutoSync();
      return snapshot;
    },
  );
}
