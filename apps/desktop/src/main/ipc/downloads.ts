import { app, BrowserWindow, dialog, shell } from "electron";
import { DownloadManager } from "../downloads.js";
import { handle } from "./handle.js";

export async function registerDownloadHandlers() {
  const manager = new DownloadManager(app.getPath("userData"));
  await manager.initialize();
  let stopping = false;
  app.on("before-quit", (event) => {
    if (stopping) {
      return;
    }
    stopping = true;
    event.preventDefault();
    void manager.stop().finally(() => app.quit());
  });
  handle("downloads:status", () => manager.snapshot());
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
  handle("downloads:open", async (_event, id) => {
    const error = await shell.openPath(manager.directoryFor(id));

    if (error) {
      throw new Error(error);
    }
  });
}
