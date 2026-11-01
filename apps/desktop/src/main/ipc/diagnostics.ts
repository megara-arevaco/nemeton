import { app, BrowserWindow, dialog } from "electron";
import os from "node:os";
import { writeJsonAtomically } from "@launcher/core";
import type { MainContext } from "../context.js";
import { operationMetrics } from "../operation-metrics.js";
import { handle } from "./handle.js";

export function registerDiagnosticHandlers({
  store,
  providerService,
  settingsStore,
}: MainContext) {
  handle("diagnostics:export", async (event) => {
    const result = await dialog.showSaveDialog(
      BrowserWindow.fromWebContents(event.sender)!,
      {
        defaultPath: "Nemeton-diagnostics.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      },
    );

    if (result.canceled || !result.filePath) {
      return false;
    }

    const library = await store.read();
    const settings = await settingsStore.read();
    const report = {
      format: "nemeton-diagnostics",
      version: 1,
      generatedAt: new Date().toISOString(),
      app: {
        version: app.getVersion(),
        electron: process.versions.electron,
        node: process.versions.node,
        packaged: app.isPackaged,
      },
      system: { platform: process.platform, arch: process.arch, release: os.release() },
      library: {
        games: library.games.length,
        sessions: library.sessions.length,
        installed: library.games.filter((game) => game.installed).length,
        stores: Object.fromEntries(
          ["local", "steam", "epic", "gog"].map((source) => [
            source,
            library.games.filter((game) => game.source === source).length,
          ]),
        ),
      },
      connections: {
        steam: Boolean(settings.steamId && (await settingsStore.readApiKey())),
        syncFolderConfigured: Boolean(settings.syncFolderPath),
        stores: providerService.states().map((state) => ({
          provider: state.provider,
          connected: state.connected,
          helperConfigured: Boolean(state.helperPath),
          persistentCredentials: state.persistentCredentials,
          busy: Boolean(state.operation),
        })),
      },
      operations: operationMetrics(),
    };
    await writeJsonAtomically(result.filePath, report);
    return true;
  });
}
