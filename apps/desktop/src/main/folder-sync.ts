import fs from "node:fs";
import path from "node:path";
import { LibraryStore } from "@launcher/core";
import type { LibrarySnapshot } from "@launcher/core";
import { AchievementService, type AchievementHistoryEntry } from "./achievements.js";
import { toLinuxPath } from "./platform.js";
import { SettingsStore } from "./settings.js";
export interface FolderSyncResult {
  snapshot: LibrarySnapshot;
  settings: {
    folderPath: string;
    lastSyncedAt: string;
  };
}

export class FolderSyncService {
  private activeSync: Promise<FolderSyncResult> | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly store: LibraryStore,
    private readonly settingsStore: SettingsStore,
    private readonly achievementService: AchievementService,
  ) {}

  get isSyncing() {
    return this.activeSync !== null;
  }

  get syncError() {
    return this.lastError;
  }

  sync(folderPath: string) {
    if (this.activeSync) {
      return this.activeSync;
    }

    this.activeSync = this.perform(folderPath)
      .catch((error) => {
        this.lastError = error instanceof Error ? error.message : String(error);
        throw error;
      })
      .finally(() => {
        this.activeSync = null;
      });

    return this.activeSync;
  }

  private async perform(folderPath: string): Promise<FolderSyncResult> {
    const resolved = path.resolve(toLinuxPath(folderPath));
    const directoryInfo = await fs.promises.stat(resolved).catch(() => null);

    if (!directoryInfo?.isDirectory()) {
      throw new Error("La carpeta de sincronización no existe");
    }

    const historyPath = path.join(resolved, "launcher-next-history.json");
    const remoteHistory = await fs.promises
      .readFile(historyPath, "utf8")
      .catch(() => null);

    if (remoteHistory) {
      try {
        await this.store.mergeRemoteManual(
          JSON.parse(remoteHistory) as LibrarySnapshot,
        );
      } catch {
        throw new Error("El historial remoto no tiene un formato válido");
      }
    }

    await this.writeJsonAtomically(historyPath, await this.store.exportManualHistory());

    const snapshot = await this.store.read();
    const excludedSourceIds = new Set(
      (snapshot.excludedGameKeys ?? []).map((key) => key.slice(key.indexOf(":") + 1)),
    );
    await this.synchronizeAchievementHistory(resolved, excludedSourceIds);

    const lastSyncedAt = new Date().toISOString();

    await this.settingsStore.write({
      ...(await this.settingsStore.read()),
      syncFolderPath: resolved,
      lastSyncedAt,
    });

    this.lastError = null;

    return {
      snapshot: await this.store.read(),
      settings: {
        folderPath: resolved,
        lastSyncedAt,
      },
    };
  }

  private async synchronizeAchievementHistory(
    folderPath: string,
    excludedSourceIds: Set<string>,
  ) {
    const remotePath = path.join(folderPath, "launcher-next-achievements.json");
    const localEntries = await this.achievementService.readHistory();
    const remoteRaw = await fs.promises.readFile(remotePath, "utf8").catch(() => null);
    const remoteEntries = parseAchievementHistory(remoteRaw);
    const mergedEntries = mergeAchievementHistory(localEntries, remoteEntries).filter(
      (entry) => !excludedSourceIds.has(entry.gameSourceId),
    );

    await this.achievementService.writeHistory(mergedEntries);
    await this.writeJsonAtomically(remotePath, mergedEntries);
  }

  private async writeJsonAtomically(filePath: string, value: unknown) {
    const temporaryPath = `${filePath}.tmp`;

    await fs.promises.writeFile(temporaryPath, JSON.stringify(value, null, 2));
    await fs.promises.rename(temporaryPath, filePath);
  }
}

function parseAchievementHistory(raw: string | null) {
  if (!raw) {
    return [] as AchievementHistoryEntry[];
  }

  try {
    return JSON.parse(raw) as AchievementHistoryEntry[];
  } catch {
    return [];
  }
}

function mergeAchievementHistory(
  localEntries: AchievementHistoryEntry[],
  remoteEntries: AchievementHistoryEntry[],
) {
  const mergedEntries = new Map<string, AchievementHistoryEntry>();

  for (const entry of [...localEntries, ...remoteEntries]) {
    const key = `${entry.gameSourceId}:${entry.achievementId}`;
    const previous = mergedEntries.get(key);

    if (!previous || entry.detectedAt < previous.detectedAt) {
      mergedEntries.set(key, entry);
    }
  }

  return [...mergedEntries.values()];
}
