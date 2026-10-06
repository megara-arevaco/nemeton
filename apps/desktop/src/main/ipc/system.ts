import { recordOperation } from "../operation-metrics.js";
import { handle } from "./handle.js";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { app, BrowserWindow, dialog } from "electron";
import type { MainContext } from "../context.js";
const execFileAsync = promisify(execFile);

export const registerSystemHandlers = ({
  folderSyncService,
  settingsStore,
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
