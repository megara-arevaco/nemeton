import fs from "node:fs";
import path from "node:path";
import { defaultSteamRoots } from "./discovery.js";
import type { SteamOwnedGame } from "../shared/types.js";
const STEAM_ID64_BASE = 76_561_197_960_265_728n;

export const accountIdToSteamId64 = (accountId: string): string | null => {
  if (!/^\d+$/.test(accountId)) {
    return null;
  }
  return (STEAM_ID64_BASE + BigInt(accountId)).toString();
};

export const detectLocalSteamId = async (): Promise<string | null> => {
  const steamRoot = defaultSteamRoots().find(fs.existsSync);

  if (!steamRoot) {
    return null;
  }

  const userdata = path.join(steamRoot, "userdata");
  const users = await fs.promises
    .readdir(userdata, { withFileTypes: true })
    .catch(() => []);
  const candidates = await Promise.all(
    users
      .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
      .map(async (entry) => ({
        accountId: entry.name,
        modifiedAt:
          (
            await fs.promises
              .stat(path.join(userdata, entry.name, "config/localconfig.vdf"))
              .catch(() => null)
          )?.mtimeMs ?? 0,
      })),
  );
  candidates.sort((left, right) => right.modifiedAt - left.modifiedAt);
  return candidates[0] ? accountIdToSteamId64(candidates[0].accountId) : null;
};

interface OwnedGamesResponse {
  response?: {
    games?: Array<{
      appid?: number;
      name?: string;
      playtime_forever?: number;
      rtime_last_played?: number;
    }>;
  };
}

export const fetchOwnedSteamGames = async (
  apiKey: string,
  steamId: string,
): Promise<SteamOwnedGame[]> => {
  if (!/^[A-F0-9]{32}$/i.test(apiKey.trim())) {
    throw new Error("La API key de Steam no es válida");
  }
  if (!/^7656119\d{10}$/.test(steamId)) {
    throw new Error("El SteamID64 no es válido");
  }

  const query = new URLSearchParams({
    steamid: steamId,
    include_appinfo: "true",
    include_played_free_games: "true",
    format: "json",
  });
  const response = await fetch(
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?${query}`,
    {
      headers: { "x-webapi-key": apiKey.trim() },
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Steam respondió con ${response.status}`);
  }

  const payload = (await response.json()) as OwnedGamesResponse;
  return (payload.response?.games ?? [])
    .filter((game) => Number.isSafeInteger(game.appid) && typeof game.name === "string")
    .map((game) => ({
      appId: String(game.appid),
      title: game.name!,
      playtimeMinutes: Math.max(0, game.playtime_forever ?? 0),
      lastPlayedAt: game.rtime_last_played
        ? new Date(game.rtime_last_played * 1_000).toISOString()
        : null,
    }));
};
