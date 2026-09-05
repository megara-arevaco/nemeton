import { remoteLibrarySchema, achievementHistorySchema } from "./sync-validation.js";
import fs from "node:fs";
import path from "node:path";
import { readTextIfExists, writeJsonAtomically, LibraryStore } from "@launcher/core";
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
  private readonly remoteContents = new Map<string, string>();
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
    const remoteHistory = await readTextIfExists(historyPath);

    if (remoteHistory && this.remoteContents.get(historyPath) !== remoteHistory) {
      try {
        await this.store.mergeRemoteManual(
          remoteLibrarySchema.parse(JSON.parse(remoteHistory)),
        );
      } catch {
        throw new Error("El historial remoto no tiene un formato válido");
      }
    }

    const exported = await this.store.exportManualHistory();
    await writeJsonAtomically(historyPath, exported);
    this.remoteContents.clear();
    this.remoteContents.set(historyPath, JSON.stringify(exported, null, 2));

    const snapshot = await this.store.read();
    const excludedSourceIds = new Set(
      (snapshot.excludedGameKeys ?? []).map((key) => key.slice(key.indexOf(":") + 1)),
    );
    await this.synchronizeAchievementHistory(resolved, excludedSourceIds);

    const lastSyncedAt = new Date().toISOString();

    await this.settingsStore.update({
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
    const remoteRaw = await readTextIfExists(remotePath);
    const remoteEntries = parseAchievementHistory(remoteRaw);
    const mergedEntries = await this.achievementService.mergeHistory(
      remoteEntries,
      excludedSourceIds,
    );
    await writeJsonAtomically(remotePath, mergedEntries);
  }
}

function parseAchievementHistory(raw: string | null) {
  if (!raw) {
    return [] as AchievementHistoryEntry[];
  }

  try {
    return achievementHistorySchema.parse(JSON.parse(raw));
  } catch {
    throw new Error("El historial remoto de logros no tiene un formato válido");
  }
}
