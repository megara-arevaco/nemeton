import { readTextIfExists, withFileLock, writeJsonAtomically } from "@launcher/core";
import fs from "node:fs";
import {
  mergeAchievementCatalogue,
  type AchievementCatalogue,
} from "./achievement-catalogue.js";
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

  constructor(
    private readonly historyPath: string,
    private readonly catalogue?: AchievementCatalogue,
  ) {}

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
    const appId = game.source === "steam" ? game.sourceId : game.steamAppId;
    const [local, catalogue] = await Promise.all([
      this.discoverLocal(game),
      appId ? this.catalogue?.get(appId) : null,
    ]);
    return catalogue ? mergeAchievementCatalogue(local, catalogue) : local;
  }

  private async discoverLocal(game: LibraryGame): Promise<GameAchievements> {
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
    return withFileLock(this.historyPath, async () => {
      const history = await this.readHistory();
      const known = new Set(
        history
          .filter((entry) => entry.gameSourceId === game.sourceId)
          .map((entry) => entry.achievementId),
      );
      const newlyDetected = result.items.filter(
        (item) => item.achieved && !known.has(item.id),
      );

      let renamed = false;
      const names = new Map(
        result.items
          .filter((item) => item.name !== item.id)
          .map((item) => [item.id.toLowerCase(), item.name]),
      );

      for (const entry of history) {
        const name =
          entry.gameSourceId === game.sourceId
            ? names.get(entry.achievementId.toLowerCase())
            : null;

        if (name && name !== entry.name) {
          entry.name = name;
          renamed = true;
        }
      }
      if (newlyDetected.length === 0 && !renamed) {
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
    });
  }

  async readHistory() {
    const raw = await readTextIfExists(this.historyPath);

    if (!raw) {
      return [] as AchievementHistoryEntry[];
    }

    try {
      return JSON.parse(raw) as AchievementHistoryEntry[];
    } catch {
      throw new Error("El historial de logros está dañado");
    }
  }

  async writeHistory(entries: AchievementHistoryEntry[]) {
    await writeJsonAtomically(this.historyPath, entries);
  }

  async mergeHistory(remote: AchievementHistoryEntry[], excluded: Set<string>) {
    return withFileLock(this.historyPath, async () => {
      const merged = new Map<string, AchievementHistoryEntry>();

      for (const entry of [...(await this.readHistory()), ...remote]) {
        if (excluded.has(entry.gameSourceId)) {
          continue;
        }

        const key = `${entry.gameSourceId}:${entry.achievementId}`;
        const previous = merged.get(key);

        if (!previous || entry.detectedAt < previous.detectedAt) {
          merged.set(key, entry);
        }
      }

      const entries = [...merged.values()];
      await this.writeHistory(entries);
      return entries;
    });
  }

  async purgeGame(gameSourceId: string) {
    return withFileLock(this.historyPath, async () => {
      const history = await this.readHistory();
      const retained = history.filter((entry) => entry.gameSourceId !== gameSourceId);

      if (retained.length !== history.length) {
        await this.writeHistory(retained);
      }
    });
  }

  private async getRoamingDirectory(): Promise<string> {
    if (!this.roamingAppData) {
      const { getRoamingAppData } = await import("./platform.js");
      this.roamingAppData = await getRoamingAppData();
    }
    return this.roamingAppData;
  }
}
