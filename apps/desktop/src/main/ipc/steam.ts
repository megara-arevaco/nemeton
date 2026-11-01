import { handle } from "./handle.js";
import {
  detectLocalSteamId,
  detectLocalSteamAccounts,
  resolveSteamAccountId,
} from "@launcher/core";
import type { MainContext } from "../context.js";

export const registerSteamHandlers = ({
  settingsStore,
  steamSyncService,
}: MainContext) => {
  handle("steam:settings", async () => {
    const settings = await settingsStore.read();
    const steamId = settings.steamId ?? (await detectLocalSteamId());
    return {
      steamId,
      hasApiKey: Boolean(await settingsStore.readApiKey()),
      persistentApiKey: Boolean(settings.encryptedSteamApiKey),
      accounts: await detectLocalSteamAccounts(),
      lastSyncedAt: settings.lastSteamSyncedAt ?? null,
    };
  });
  handle("steam:connect", async (_event, apiKey: string, requestedSteamId?: string) => {
    const steamId = requestedSteamId?.trim()
      ? await resolveSteamAccountId(apiKey, requestedSteamId)
      : await detectLocalSteamId();

    if (!steamId) {
      throw new Error("No se pudo detectar el SteamID64");
    }

    const result = await steamSyncService.refreshWithCredentials(apiKey, steamId);
    await settingsStore.writeSteamCredentials(steamId, apiKey.trim());
    return { settings: { steamId, hasApiKey: true }, ...result };
  });
  handle("steam:disconnect", async () => {
    await settingsStore.clearSteamCredentials();
    return { steamId: null, hasApiKey: false };
  });
  handle("steam:refresh-account", () => steamSyncService.refreshAccount());
  handle("library:scan-steam", () => steamSyncService.scanLocal());
};
