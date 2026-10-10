import { remoteLibrarySchema, achievementHistorySchema } from "./sync-validation.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
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

    const releaseLock = await acquireFolderSyncLock(resolved);

    try {
      await this.performLocked(resolved);
    } finally {
      await releaseLock();
    }

    const snapshot = await this.store.read();
    const settings = await this.settingsStore.read();
    return {
      snapshot,
      settings: {
        folderPath: resolved,
        lastSyncedAt: settings.lastSyncedAt ?? new Date().toISOString(),
      },
    };
  }

  private async performLocked(resolved: string): Promise<void> {
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

interface FolderLockOwner {
  token: string;
  host: string;
  pid: number;
}

async function acquireFolderSyncLock(folderPath: string): Promise<() => Promise<void>> {
  const lockPath = path.join(folderPath, ".nemeton-sync.lock");
  const token = randomUUID();
  const owner: FolderLockOwner = { token, host: os.hostname(), pid: process.pid };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await fs.promises.mkdir(lockPath);
      const info = await fs.promises.lstat(lockPath);

      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new Error("El bloqueo de sincronización no es un directorio seguro");
      }
      try {
        await fs.promises.writeFile(
          path.join(lockPath, "owner.json"),
          JSON.stringify(owner),
          { flag: "wx", mode: 0o600 },
        );
      } catch (error) {
        const current = await fs.promises.lstat(lockPath).catch(() => null);

        if (
          current?.isDirectory() &&
          !current.isSymbolicLink() &&
          current.ino === info.ino
        ) {
          await fs.promises
            .rm(lockPath, { recursive: true, force: true })
            .catch(() => undefined);
        }
        throw error;
      }
      return async () => {
        const current = await readFolderLockOwner(lockPath);
        const currentInfo = await fs.promises.lstat(lockPath).catch(() => null);

        if (current?.token !== token || !currentInfo || currentInfo.ino !== info.ino) {
          return;
        }

        const releasedPath = `${lockPath}.released-${token}`;
        await fs.promises.rename(lockPath, releasedPath).catch(() => undefined);
        await fs.promises.rm(releasedPath, { recursive: true, force: true });
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;

      if (code !== "EEXIST") {
        throw error;
      }

      const previous = await readFolderLockOwner(lockPath);
      const ownerDescription = previous
        ? ` (${previous.host}, proceso ${previous.pid})`
        : "";
      throw new Error(
        `La carpeta de sincronización está ocupada o conserva un bloqueo${ownerDescription}. No se sobrescribió ningún historial; comprueba que la otra instancia terminó y elimina manualmente el bloqueo solo si confirmas que no hay otro escritor.`,
      );
    }
  }
  throw new Error("No se pudo adquirir el bloqueo de sincronización");
}

async function readFolderLockOwner(lockPath: string): Promise<FolderLockOwner | null> {
  let handle: fs.promises.FileHandle | undefined;

  try {
    const directory = await fs.promises.lstat(lockPath);

    if (!directory.isDirectory() || directory.isSymbolicLink()) {
      return null;
    }

    const ownerPath = path.join(lockPath, "owner.json");
    const info = await fs.promises.lstat(ownerPath);

    if (!info.isFile() || info.isSymbolicLink() || info.size > 4096) {
      return null;
    }
    handle = await fs.promises.open(
      ownerPath,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
    );
    const opened = await handle.stat();

    if (
      !opened.isFile() ||
      opened.dev !== info.dev ||
      opened.ino !== info.ino ||
      opened.size > 4096
    ) {
      return null;
    }

    const chunks: Buffer[] = [];
    let size = 0;

    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      size += chunk.length;
      if (size > 4096) {
        return null;
      }
      chunks.push(Buffer.from(chunk));
    }

    const parsed = JSON.parse(
      Buffer.concat(chunks, size).toString("utf8"),
    ) as Partial<FolderLockOwner>;

    return typeof parsed.token === "string" &&
      /^[a-f0-9-]{36}$/i.test(parsed.token) &&
      typeof parsed.host === "string" &&
      parsed.host.length <= 255 &&
      Number.isSafeInteger(parsed.pid) &&
      (parsed.pid ?? 0) > 0
      ? (parsed as FolderLockOwner)
      : null;
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => undefined);
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
