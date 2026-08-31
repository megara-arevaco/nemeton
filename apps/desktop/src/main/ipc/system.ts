import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { BrowserWindow, dialog, ipcMain } from "electron";
import type { MainContext } from "../context.js";
const execFileAsync = promisify(execFile);

export const registerSystemHandlers = ({
  folderSyncService,
  settingsStore,
}: MainContext) => {
  ipcMain.handle("workspace:status", async () => {
    try {
      const { stdout } = await execFileAsync("git", ["branch", "--show-current"], {
        cwd: process.cwd(),
      });
      return { branch: stdout.trim() || "HEAD" };
    } catch {
      return { branch: null };
    }
  });
  ipcMain.handle("window:minimize", (event) =>
    BrowserWindow.fromWebContents(event.sender)?.minimize(),
  );
  ipcMain.handle("window:toggle-maximize", (event) => {
    const target = BrowserWindow.fromWebContents(event.sender);

    if (target?.isMaximized()) {
      target.unmaximize();
    } else {
      target?.maximize();
    }
  });
  ipcMain.handle("window:close", (event) =>
    BrowserWindow.fromWebContents(event.sender)?.close(),
  );
  ipcMain.handle("sync:settings", async () => {
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
  ipcMain.handle("sync:select-folder", async () => {
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
  ipcMain.handle("sync:now", async () => {
    const settings = await settingsStore.read();

    if (!settings.syncFolderPath) {
      throw new Error("Selecciona primero una carpeta de sincronización");
    }
    return folderSyncService.sync(settings.syncFolderPath);
  });
};
