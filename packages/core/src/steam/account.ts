import fs from "node:fs";
import path from "node:path";
import { defaultSteamRoots, parseVdf } from "./discovery.js";
import type { SteamOwnedGame } from "../shared/types.js";
const STEAM_ID64_BASE = 76_561_197_960_265_728n;

export const accountIdToSteamId64 = (accountId: string): string | null => {
  if (!/^\d+$/.test(accountId)) {
    return null;
  }
  return (STEAM_ID64_BASE + BigInt(accountId)).toString();
};

export const detectLocalSteamId = async (): Promise<string | null> => {
  const steamRoot = defaultSteamRoots().find((root) =>
    fs.existsSync(path.join(root, "userdata")),
  );

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
    game_count?: number;
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

  if (!Array.isArray(payload.response?.games) && payload.response?.game_count !== 0) {
    throw new Error(
      "Steam no permite consultar la biblioteca. Revisa la privacidad de los detalles de juegos del perfil.",
    );
  }
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

export async function detectLocalSteamAccounts(): Promise<
  Array<{ steamId: string; name: string }>
> {
  const accounts = new Map<string, string>();

  for (const root of defaultSteamRoots()) {
    try {
      const parsed = parseVdf(
        await fs.promises.readFile(path.join(root, "config/loginusers.vdf"), "utf8"),
      );
      const users = parsed.users;

      if (users && typeof users === "object") {
        for (const [steamId, value] of Object.entries(users)) {
          if (!/^7656119\d{10}$/.test(steamId) || typeof value !== "object") {
            continue;
          }
          accounts.set(
            steamId,
            typeof value.PersonaName === "string" ? value.PersonaName : steamId,
          );
        }
      }
    } catch {
      /* A client can be absent or updating its configuration. */
    }
  }
  return [...accounts].map(([steamId, name]) => ({ steamId, name }));
}

export async function resolveSteamAccountId(
  apiKey: string,
  input: string,
): Promise<string> {
  const value = input.trim();

  if (/^7656119\d{10}$/.test(value)) {
    return value;
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Introduce un SteamID64 o una URL de perfil de Steam");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "steamcommunity.com" ||
    url.username ||
    url.password
  ) {
    throw new Error("URL de perfil de Steam no válida");
  }

  const match = /^\/(profiles|id)\/([a-zA-Z0-9_-]+)\/?$/.exec(url.pathname);

  if (!match) {
    throw new Error("URL de perfil de Steam no válida");
  }
  if (match[1] === "profiles" && /^7656119\d{10}$/.test(match[2]!)) {
    return match[2]!;
  }
  if (match[1] !== "id") {
    throw new Error("SteamID64 no válido");
  }

  const response = await fetch(
    `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?${new URLSearchParams({ vanityurl: match[2]! })}`,
    { headers: { "x-webapi-key": apiKey }, signal: AbortSignal.timeout(15_000) },
  );

  if (!response.ok) {
    throw new Error("No se pudo resolver el perfil de Steam");
  }

  const data = (await response.json()) as {
    response?: { success?: number; steamid?: string };
  };

  if (
    data.response?.success !== 1 ||
    !/^7656119\d{10}$/.test(data.response.steamid ?? "")
  ) {
    throw new Error("No se encontró ese perfil de Steam");
  }
  return data.response.steamid!;
}
