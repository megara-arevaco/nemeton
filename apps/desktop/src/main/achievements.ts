import fs from "node:fs";
import {
  discoverGoldbergAchievements,
  discoverLocalSteamAppId,
  discoverSteamAchievements,
} from "@launcher/core";
import type { GameAchievements, LibraryGame } from "@launcher/core";
import { getRoamingAppData } from "./platform.js";
export interface AchievementHistoryEntry {
  gameSourceId: string;
  achievementId: string;
  name: string;
  detectedAt: string;
  unlockedAt: string | null;
  source: string | null;
}

export class AchievementService {
  constructor(private readonly historyPath: string) {}

  async discover(game: LibraryGame): Promise<GameAchievements> {
    if (game.source === "steam") {
      return discoverSteamAchievements(game.sourceId);
    }

    const appId = game.steamAppId ?? (await discoverLocalSteamAppId(game.installPath));

    if (!appId) {
      return {
        total: 0,
        unlocked: 0,
        items: [],
        source: null,
        statePath: null,
        status: "missing-app-id",
      };
    }

    return discoverGoldbergAchievements(
      appId,
      game.installPath,
      await getRoamingAppData(),
    );
  }

  async record(game: LibraryGame, result: GameAchievements) {
    const history = await this.readHistory();
    const known = new Set(
      history
        .filter((entry) => entry.gameSourceId === game.sourceId)
        .map((entry) => entry.achievementId),
    );
    const newlyDetected = result.items.filter(
      (item) => item.achieved && !known.has(item.id),
    );

    if (newlyDetected.length === 0) {
      return;
    }

    const detectedAt = new Date().toISOString();

    history.push(
      ...newlyDetected.map((item) => ({
        gameSourceId: game.sourceId,
        achievementId: item.id,
        name: item.name,
        detectedAt,
        unlockedAt: item.unlockedAt,
        source: result.source ?? null,
      })),
    );

    await this.writeHistory(history);
  }

  async readHistory() {
    const raw = await fs.promises.readFile(this.historyPath, "utf8").catch(() => null);

    if (!raw) {
      return [] as AchievementHistoryEntry[];
    }

    try {
      return JSON.parse(raw) as AchievementHistoryEntry[];
    } catch {
      return [];
    }
  }

  async writeHistory(entries: AchievementHistoryEntry[]) {
    await fs.promises.writeFile(this.historyPath, JSON.stringify(entries, null, 2));
  }
}
