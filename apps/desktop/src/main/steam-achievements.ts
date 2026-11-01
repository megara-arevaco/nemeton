import path from "node:path";
import {
  readTextIfExists,
  writeJsonAtomically,
  type GameAchievements,
} from "@launcher/core";
import type { SettingsStore } from "./settings.js";

export class SteamAccountAchievements {
  private pending = new Map<string, Promise<GameAchievements | null>>();
  constructor(
    private readonly directory: string,
    private readonly settings: SettingsStore,
  ) {}
  async get(appId: string): Promise<GameAchievements | null> {
    const settings = await this.settings.read();
    const key = await this.settings.readApiKey();

    if (!settings.steamId || !key) {
      return null;
    }

    const identity = `${settings.steamId}-${appId}`;
    const existing = this.pending.get(identity);

    if (existing) {
      return existing;
    }

    const operation = this.load(identity, settings.steamId, appId, key).finally(() =>
      this.pending.delete(identity),
    );
    this.pending.set(identity, operation);
    return operation;
  }
  private async load(
    identity: string,
    steamId: string,
    appId: string,
    key: string,
  ): Promise<GameAchievements | null> {
    const file = path.join(this.directory, `${identity}.json`);
    let cached: { fetchedAt: number; value: GameAchievements } | null = null;

    try {
      const raw = await readTextIfExists(file);

      if (raw) {
        cached = JSON.parse(raw);
      }
    } catch {
      /* Retry a damaged cache from Steam. */
    }
    if (cached && Date.now() - cached.fetchedAt < 5 * 60_000) {
      return cached.value;
    }
    try {
      const response = await fetch(
        `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?${new URLSearchParams({ steamid: steamId, appid: appId, l: "english" })}`,
        {
          headers: { "x-webapi-key": key },
          signal: AbortSignal.timeout(15_000),
        },
      );

      if (!response.ok) {
        return cached?.value ?? null;
      }

      const payload = (await response.json()) as {
        playerstats?: {
          success?: boolean;
          achievements?: Array<{
            apiname?: string;
            name?: string;
            description?: string;
            achieved?: number;
            unlocktime?: number;
          }>;
        };
      };

      if (
        !payload.playerstats?.success ||
        !Array.isArray(payload.playerstats.achievements)
      ) {
        return cached?.value ?? null;
      }

      const items = payload.playerstats.achievements
        .filter((item) => typeof item.apiname === "string")
        .map((item) => ({
          id: item.apiname!,
          name: item.name ?? item.apiname!,
          description: item.description ?? "",
          imageUrl: null,
          achieved: item.achieved === 1,
          unlockedAt:
            item.unlocktime && item.unlocktime > 0
              ? new Date(item.unlocktime * 1000).toISOString()
              : null,
          globalPercentage: null,
          hidden: false,
        }));
      const value: GameAchievements = {
        totalKnown: true,
        total: items.length,
        unlocked: items.filter((item) => item.achieved).length,
        items,
        source: "Steam account",
        status: "detected",
      };
      await writeJsonAtomically(file, { fetchedAt: Date.now(), value });
      return value;
    } catch {
      return cached?.value ?? null;
    }
  }
}
