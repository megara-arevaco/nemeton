import { handle } from "./handle.js";
import {
  detectLocalSteamId,
  discoverSteamGames,
  fetchOwnedSteamGames,
} from "@launcher/core";
import type { MainContext } from "../context.js";

export const registerSteamHandlers = ({ settingsStore, store }: MainContext) => {
  handle("steam:settings", async () => {
    const settings = await settingsStore.read();
    const steamId = settings.steamId ?? (await detectLocalSteamId());
    return { steamId, hasApiKey: Boolean(await settingsStore.readApiKey()) };
  });
  const importAccount = async (apiKey: string, steamId: string) => {
    const [ownedGames, installedGames] = await Promise.all([
      fetchOwnedSteamGames(apiKey, steamId),
      discoverSteamGames(),
    ]);
    await store.importSteamAccount(ownedGames);
    const snapshot = await store.importSteam(installedGames);
    return { snapshot, ownedCount: ownedGames.length };
  };
  handle("steam:connect", async (_event, apiKey: string, requestedSteamId?: string) => {
    const steamId = requestedSteamId?.trim() || (await detectLocalSteamId());

    if (!steamId) {
      throw new Error("No se pudo detectar el SteamID64");
    }
    await settingsStore.writeSteamCredentials(steamId, apiKey.trim());
    const result = await importAccount(apiKey, steamId);
    return { settings: { steamId, hasApiKey: true }, ...result };
  });
  handle("steam:refresh-account", async () => {
    const settings = await settingsStore.read();
    const apiKey = await settingsStore.readApiKey();

    if (!settings.steamId || !apiKey) {
      throw new Error("Configura primero tu cuenta de Steam");
    }
    return importAccount(apiKey, settings.steamId);
  });
  handle("library:scan-steam", async () =>
    store.importSteam(await discoverSteamGames()),
  );
};
