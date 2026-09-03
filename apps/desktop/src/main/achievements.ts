import fs from "node:fs";
import {
  discoverGoldbergAchievements,
  findChangedGoldbergAchievementStateId,
  discoverLocalSteamAppId,
  discoverSteamAchievements,
  snapshotGoldbergAchievementState,
} from "@launcher/core";
import type {
  GameAchievements,
  GoldbergAchievementStateSnapshot,
  LibraryGame,
} from "@launcher/core";
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
  private roamingAppData: string | null = null;

  constructor(private readonly historyPath: string) {}

  async captureGoldbergState(): Promise<GoldbergAchievementStateSnapshot> {
    try {
      return snapshotGoldbergAchievementState(await this.getRoamingDirectory());
    } catch {
      return new Map();
    }
  }

  async findChangedGoldbergStateId(
    before: GoldbergAchievementStateSnapshot,
  ): Promise<string | null> {
    try {
      return findChangedGoldbergAchievementStateId(
        before,
        await this.getRoamingDirectory(),
      );
    } catch {
      return null;
    }
  }

  async discover(game: LibraryGame): Promise<GameAchievements> {
    if (game.source === "steam") {
      return discoverSteamAchievements(game.sourceId);
    }

    const appIds = [
      game.achievementStateId,
      game.steamAppId,
      await discoverLocalSteamAppId(game.installPath),
    ].filter((appId): appId is string => Boolean(appId));

    if (appIds.length === 0) {
      return {
        total: 0,
        unlocked: 0,
        items: [],
        source: null,
        statePath: null,
        status: "missing-app-id",
      };
    }

    const roamingDirectory = await this.getRoamingDirectory();

    for (const appId of new Set(appIds)) {
      const result = await discoverGoldbergAchievements(
        appId,
        game.installPath,
        roamingDirectory,
      );

      if (result.status !== "no-state") {
        return result;
      }
    }

    return {
      total: 0,
      unlocked: 0,
      items: [],
      source: null,
      statePath: null,
      status: "no-state",
    };
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

  async purgeGame(gameSourceId: string) {
    const history = await this.readHistory();
    const retained = history.filter((entry) => entry.gameSourceId !== gameSourceId);

    if (retained.length !== history.length) {
      await this.writeHistory(retained);
    }
  }

  private async getRoamingDirectory(): Promise<string> {
    if (!this.roamingAppData) {
      this.roamingAppData = await getRoamingAppData();
    }
    return this.roamingAppData;
  }
}
