import { startPerformanceLog } from "./performance.js";
import { registerLibraryHandlers } from "./ipc/library.js";
import { registerSavegameHandlers } from "./ipc/savegames.js";
import { registerLaunchHandlers, createSteamSessionWatcher } from "./sessions.js";
import { trustWindow } from "./ipc/handle.js";
import { fetchLimitedText } from "./network.js";
import fs from "node:fs";
import { app, BrowserWindow, dialog, net, protocol, session } from "electron";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LibraryStore } from "@launcher/core";
import { AchievementCatalogue } from "./achievement-catalogue.js";
import { AchievementService } from "./achievements.js";
import { FolderSyncService } from "./folder-sync.js";
import { SavegameManager } from "./savegames.js";
import { LudusaviCatalog } from "./ludusavi.js";
import { runBackground } from "./platform.js";
import { SettingsStore } from "./settings.js";
import type { MainContext } from "./context.js";
import { registerArtworkHandlers } from "./ipc/artwork.js";
import { registerSteamHandlers } from "./ipc/steam.js";
import { registerSystemHandlers } from "./ipc/system.js";
const directory = path.dirname(fileURLToPath(import.meta.url));
let store: LibraryStore;
let coversDirectory: string;
let savegameManager: SavegameManager;
let ludusaviCatalog: LudusaviCatalog;
let settingsStore: SettingsStore;
let achievementService: AchievementService;
let folderSyncService: FolderSyncService;
let observeWindow: ReturnType<typeof startPerformanceLog>;
let autoSyncTimer: ReturnType<typeof setTimeout> | null = null;

if (process.platform === "win32") {
  app.setAppUserModelId("io.nemeton.desktop");
}

protocol.registerSchemesAsPrivileged([
  { scheme: "launcher-cover", privileges: { secure: true, supportFetchAPI: true } },
]);
if (!app.requestSingleInstanceLock()) {
  app.quit();
}
app.on("second-instance", () => {
  const existingWindow = BrowserWindow.getAllWindows()[0];

  if (!existingWindow) {
    return;
  }
  if (existingWindow.isMinimized()) {
    existingWindow.restore();
  }
  existingWindow.show();
  existingWindow.focus();
});

const broadcastLibrary = async () => {
  const snapshot = await store.read();

  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("library:changed", snapshot);
  }
};

const broadcastGameRunning = (gameId: string, running: boolean) => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("game:running-changed", { gameId, running });
  }
};

const autoSync = async () => {
  const settings = await settingsStore.read();

  if (!settings.syncFolderPath) {
    return;
  }
  await folderSyncService.sync(settings.syncFolderPath);
  await broadcastLibrary();
};

const reportSlowOperation = async <T>(name: string, operation: () => Promise<T>) => {
  const startedAt = performance.now();

  try {
    return await operation();
  } finally {
    const elapsedMs = performance.now() - startedAt;

    if (elapsedMs >= 200) {
      console.warn("[performance:slow-operation]", {
        name,
        elapsedMs: Math.round(elapsedMs),
      });
    }
  }
};

const scheduleAutoSync = () => {
  if (autoSyncTimer) {
    clearTimeout(autoSyncTimer);
  }
  autoSyncTimer = setTimeout(() => {
    autoSyncTimer = null;
    runBackground(autoSync(), "[sync:auto]");
  }, 15_000);
};

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#090a0f",
    icon: path.join(
      app.isPackaged
        ? path.join(process.resourcesPath, "resources")
        : path.join(directory, "../../resources"),
      process.platform === "win32" ? "icon.ico" : "icon.png",
    ),
    frame: false,
    webPreferences: {
      preload: path.join(directory, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  observeWindow(window);
  const documentUrl =
    !app.isPackaged && process.env.ELECTRON_RENDERER_URL
      ? process.env.ELECTRON_RENDERER_URL
      : pathToFileURL(path.join(directory, "../renderer/index.html")).href;
  trustWindow(window, documentUrl);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error("[renderer:load]", { code, description, url });
  });
  window.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error("[preload:error]", { preloadPath, error });
  });
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    runBackground(window.loadURL(process.env.ELECTRON_RENDERER_URL), "[renderer:load]");
  } else {
    runBackground(
      window.loadFile(path.join(directory, "../renderer/index.html")),
      "[renderer:load]",
    );
  }
};

app
  .whenReady()
  .then(async () => {
    observeWindow = startPerformanceLog();
    session.defaultSession.setPermissionRequestHandler(
      (_webContents, _permission, callback) => callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    store = new LibraryStore(path.join(app.getPath("userData"), "library.json"));
    coversDirectory = path.join(app.getPath("userData"), "covers");
    settingsStore = new SettingsStore(
      path.join(app.getPath("userData"), "settings.json"),
    );
    savegameManager = new SavegameManager(
      path.join(app.getPath("userData"), "savegames.json"),
    );
    ludusaviCatalog = new LudusaviCatalog(
      path.join(app.getPath("userData"), "ludusavi-catalog.json"),
      async (url) => {
        return fetchLimitedText(url, net.fetch);
      },
    );
    achievementService = new AchievementService(
      path.join(app.getPath("userData"), "achievements-history.json"),
      new AchievementCatalogue(
        path.join(app.getPath("userData"), "achievement-catalogue"),
        () => settingsStore.readApiKey(),
      ),
    );
    folderSyncService = new FolderSyncService(store, settingsStore, achievementService);
    protocol.handle("launcher-cover", async (request) => {
      const fileName = path.basename(decodeURIComponent(new URL(request.url).pathname));

      if (!/^[a-zA-Z0-9_-]+\.(png|jpe?g|webp)$/i.test(fileName)) {
        return new Response(null, { status: 400 });
      }
      return net.fetch(pathToFileURL(path.join(coversDirectory, fileName)).href);
    });
    const context: MainContext = {
      achievementService,
      autoSync,
      broadcastGameRunning,
      broadcastLibrary,
      coversDirectory,
      folderSyncService,
      ludusaviCatalog,
      reportSlowOperation,
      savegameManager,
      scheduleAutoSync,
      settingsStore,
      store,
      watchSteamSession: createSteamSessionWatcher({
        store,
        broadcastLibrary,
        broadcastGameRunning,
      }),
    };
    registerArtworkHandlers(context);
    registerSteamHandlers(context);
    registerSystemHandlers(context);

    registerLibraryHandlers(context);
    registerSavegameHandlers(context);
    registerLaunchHandlers(context);

    await savegameManager.recoverRestore();
    createWindow();
    setTimeout(scheduleAutoSync, 10_000);

    setInterval(() => {
      scheduleAutoSync();
    }, 5 * 60_000);
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  })
  .catch((error) => {
    console.error("[startup:error]", error);
    dialog.showErrorBox(
      "No se pudo iniciar Nemeton",
      error instanceof Error ? error.message : String(error),
    );
    app.quit();
  });
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
