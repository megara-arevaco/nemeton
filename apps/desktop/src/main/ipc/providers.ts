import { BrowserWindow, dialog, shell } from "electron";
import type { MainContext } from "../context.js";
import { handle } from "./handle.js";

export function registerProviderHandlers({
  providerService,
  store,
  broadcastLibrary,
}: MainContext) {
  handle("providers:playtime", async (_event, id) => {
    const game = await store.getGame(id);
    return game ? providerService.refreshPlaytime(game) : null;
  });
  handle("providers:cancel", (_event, provider) => providerService.cancel(provider));
  handle("providers:status", () => providerService.states());
  handle("providers:helper", async (event, provider) => {
    const result = await dialog.showOpenDialog(
      BrowserWindow.fromWebContents(event.sender)!,
      { properties: ["openFile"] },
    );
    return result.canceled || !result.filePaths[0]
      ? providerService.states()
      : providerService.configure(provider, result.filePaths[0]);
  });
  handle("providers:login", async (_event, provider) => {
    const url =
      provider === "epic"
        ? "https://legendary.gl/epiclogin"
        : "https://auth.gog.com/auth?client_id=46899977096215655&redirect_uri=https%3A%2F%2Fembed.gog.com%2Fon_login_success%3Forigin%3Dclient&response_type=code&layout=client2";
    await shell.openExternal(url);
  });
  handle("providers:helper-site", async (_event, provider) => {
    await shell.openExternal(
      provider === "epic"
        ? "https://github.com/derrod/legendary/releases/latest"
        : "https://github.com/Heroic-Games-Launcher/heroic-gogdl/releases/latest",
    );
  });
  handle("providers:connect", (_event, provider, code) =>
    providerService.connect(provider, code),
  );
  handle("providers:disconnect", (_event, provider) =>
    providerService.disconnect(provider),
  );
  handle("providers:refresh", (_event, provider) => providerService.refresh(provider));
  handle("providers:operate", async (event, gameId, action) => {
    const game = await store.getGame(gameId);

    if (!game) {
      throw new Error("Game not found");
    }

    let directory: string | null = null;

    if (action === "install") {
      const result = await dialog.showOpenDialog(
        BrowserWindow.fromWebContents(event.sender)!,
        { properties: ["openDirectory", "createDirectory"] },
      );

      if (result.canceled || !result.filePaths[0]) {
        return providerService.states();
      }
      directory = result.filePaths[0];
    }
    return providerService.operate(game, action, directory);
  });
  handle("providers:import-installed", async (event, gameId) => {
    const game = await store.getGame(gameId);

    if (!game || !["epic", "gog"].includes(game.source)) {
      throw new Error("invalid-provider");
    }

    const result = await dialog.showOpenDialog(
      BrowserWindow.fromWebContents(event.sender)!,
      { properties: ["openDirectory"] },
    );

    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    const snapshot = await providerService.importInstalled(game, result.filePaths[0]);
    await broadcastLibrary(snapshot);
    return snapshot;
  });
}
