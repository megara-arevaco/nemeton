import { handle } from "./handle.js";
import { detectLocalSteamId } from "@launcher/core";
import type { MainContext } from "../context.js";

export const registerSteamHandlers = ({
  settingsStore,
  steamSyncService,
}: MainContext) => {
  handle("steam:settings", async () => {
    const settings = await settingsStore.read();
    const steamId = settings.steamId ?? (await detectLocalSteamId());
    return { steamId, hasApiKey: Boolean(await settingsStore.readApiKey()) };
  });
  handle("steam:connect", async (_event, apiKey: string, requestedSteamId?: string) => {
    const steamId = requestedSteamId?.trim() || (await detectLocalSteamId());

    if (!steamId) {
      throw new Error("No se pudo detectar el SteamID64");
    }
    await settingsStore.writeSteamCredentials(steamId, apiKey.trim());
    const result = await steamSyncService.refreshWithCredentials(apiKey, steamId);
    return { settings: { steamId, hasApiKey: true }, ...result };
  });
  handle("steam:refresh-account", () => steamSyncService.refreshAccount());
  handle("library:scan-steam", () => steamSyncService.scanLocal());
};
