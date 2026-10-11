import { app, BrowserWindow, shell } from "electron";
import electronUpdater from "electron-updater";
import type { AppUpdateState } from "../shared/app-updates.js";
import { handle } from "./ipc/handle.js";

const releasesUrl = "https://github.com/megara-arevaco/nemeton/releases/latest";

export function registerAppUpdater() {
  const reason = !app.isPackaged
    ? "development"
    : process.env.PORTABLE_EXECUTABLE_DIR || process.env.PORTABLE_EXECUTABLE_FILE
      ? "portable"
      : process.platform !== "win32"
        ? "platform"
        : null;
  let state: AppUpdateState = {
    status: reason ? "unsupported" : "idle",
    currentVersion: app.getVersion(),
    availableVersion: null,
    progress: 0,
    error: null,
    reason,
  };
  const publish = (patch: Partial<AppUpdateState>) => {
    state = { ...state, ...patch };
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send("updates:changed", state);
      }
    }
  };
  const { autoUpdater } = electronUpdater;
  autoUpdater.autoDownload = false;
  // Installing must always be an explicit user action, not an incidental quit.
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  const failed = (error: unknown) => {
    console.error("[updates:error]", error);
    publish({ status: "error", error: "Update failed. Please try again." });
  };
  let checking = false;
  let downloading = false;
  const check = async () => {
    if (reason || checking || downloading || state.status === "downloaded") {
      return state;
    }
    checking = true;
    publish({ status: "checking", error: null, progress: 0, availableVersion: null });
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      failed(error);
    } finally {
      checking = false;
    }
    return state;
  };

  if (!reason) {
    autoUpdater.on("error", failed);
    autoUpdater.on("update-available", (info) =>
      publish({ status: "available", availableVersion: info.version, error: null }),
    );
    autoUpdater.on("update-not-available", () =>
      publish({ status: "up-to-date", availableVersion: null, error: null }),
    );
    autoUpdater.on("download-progress", (progress) =>
      publish({ status: "downloading", progress: Math.round(progress.percent) }),
    );
    autoUpdater.on("update-downloaded", (info) =>
      publish({
        status: "downloaded",
        availableVersion: info.version,
        progress: 100,
        error: null,
      }),
    );
    const startupTimer = setTimeout(() => void check(), 30_000);
    const periodicTimer = setInterval(() => void check(), 6 * 60 * 60_000);
    app.once("before-quit", () => {
      clearTimeout(startupTimer);
      clearInterval(periodicTimer);
    });
  }
  handle("updates:status", () => state);
  handle("updates:check", check);
  handle("updates:download", async () => {
    if (reason || checking || downloading || state.status !== "available") {
      return state;
    }
    downloading = true;
    publish({ status: "downloading", progress: 0, error: null });
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      failed(error);
    } finally {
      downloading = false;
    }
    return state;
  });
  handle("updates:install", () => {
    if (!reason && state.status === "downloaded" && !downloading) {
      setImmediate(() => autoUpdater.quitAndInstall(false, true));
    }
  });
  // No renderer-controlled URL reaches shell.openExternal.
  handle("updates:open-release", () => shell.openExternal(releasesUrl));
}
