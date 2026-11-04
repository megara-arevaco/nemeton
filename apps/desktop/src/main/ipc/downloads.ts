import { app, BrowserWindow, clipboard, dialog, shell } from "electron";
import { DownloadManager } from "../downloads.js";
import { handle } from "./handle.js";
import fs from "node:fs/promises";
import path from "node:path";
import type { DiskSpace } from "../../shared/downloads.js";

export async function registerDownloadHandlers() {
  const manager = new DownloadManager(app.getPath("userData"));
  await manager.initialize();
  handle("downloads:status", () => manager.snapshot());
  handle("downloads:disk-space", async (): Promise<DiskSpace> => {
    let directory = manager.snapshot().directory ?? app.getPath("downloads");

    while (true) {
      try {
        const stats = await fs.statfs(directory);
        return {
          path: directory,
          free: stats.bavail * stats.bsize,
          total: stats.blocks * stats.bsize,
        };
      } catch (error) {
        const parent = path.dirname(directory);

        if (
          (error as NodeJS.ErrnoException).code !== "ENOENT" ||
          parent === directory
        ) {
          throw error;
        }
        directory = parent;
      }
    }
  });
  handle("downloads:paste-link", async () =>
    (await clipboard.readText()).slice(0, 409600),
  );
  handle("downloads:control-all", (_event, action) => manager.controlAll(action));
  handle("downloads:configure", (_event, options) => manager.configure(options));
  handle("downloads:priority", (_event, id, priority) =>
    manager.setPriority(id, priority),
  );
  handle("downloads:connect", (_event, token) => manager.connect(token));
  handle("downloads:disconnect", () => manager.disconnect());
  handle("downloads:directory", async (event) => {
    const result = await dialog.showOpenDialog(
      BrowserWindow.fromWebContents(event.sender)!,
      {
        properties: ["openDirectory", "createDirectory"],
      },
    );
    return result.canceled || !result.filePaths[0]
      ? manager.snapshot()
      : manager.setDirectory(result.filePaths[0]);
  });
  handle("downloads:choose-torrent", async (event) => {
    const result = await dialog.showOpenDialog(
      BrowserWindow.fromWebContents(event.sender)!,
      {
        properties: ["openFile"],
        filters: [{ name: "BitTorrent", extensions: ["torrent"] }],
      },
    );
    return result.canceled || !result.filePaths[0]
      ? null
      : manager.importTorrent(result.filePaths[0]);
  });
  handle("downloads:select", (_event, id, fileIds) => manager.select(id, fileIds));
  handle("downloads:file-control", (_event, id, fileId, action) =>
    manager.controlFile(id, fileId, action),
  );
  handle("downloads:start", (_event, input) => manager.start(input));
  handle("downloads:control", (_event, id, action) => manager.control(id, action));
  handle("downloads:choose-executable", async (event, id) => {
    const snapshot = manager.snapshot();
    const job = snapshot.jobs.find((item) => item.id === id);

    if (!job || job.status !== "completed") {
      throw new Error("download-not-completed");
    }

    const result = await dialog.showOpenDialog(
      BrowserWindow.fromWebContents(event.sender)!,
      {
        defaultPath: job.directory,
        properties: ["openFile"],
        filters:
          process.platform === "win32"
            ? [{ name: "Executable", extensions: ["exe"] }]
            : [],
      },
    );
    return result.canceled || !result.filePaths[0]
      ? null
      : { title: job.title, executablePath: result.filePaths[0] };
  });
  handle("downloads:open", async (_event, id) => {
    const error = await shell.openPath(manager.directoryFor(id));

    if (error) {
      throw new Error(error);
    }
  });
  return manager;
}
