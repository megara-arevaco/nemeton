import { savegamePolicySchema } from "../shared/ipc-contracts.js";
import { pruneVersions } from "./savegames/retention.js";
import { SavegameDiscovery } from "./savegames/discovery.js";
import { readTextIfExists, withFileLock, writeJsonAtomically } from "@launcher/core";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  copyAndHash,
  writeArchive,
  withArchive,
  MAX_BACKUP_BYTES,
  MAX_MANIFEST_BYTES,
} from "./savegames/archive.js";
import {
  manifestSchema,
  versionIdSchema,
  restoreTarget,
} from "./savegames/validation.js";
import { restoreDirectories, recoverRestore } from "./savegames/restore.js";
import type {
  SavegameVersion,
  SavegameConflict,
  SavegameSuggestion,
  SavegamePolicy,
} from "../shared/savegames.js";
export type {
  SavegameVersion,
  SavegameConflict,
  SavegameSuggestion,
  SavegamePolicy,
} from "../shared/savegames.js";

interface SavegameConfig {
  deviceId: string;
  deviceName: string;
  games: Record<string, string[]>;
  policies?: Record<string, SavegamePolicy>;
  learned?: Record<string, string[]>;
}

interface SnapshotFile {
  rootIndex: number;
  rootKey?: string;
  relativePath: string;
  hash: string;
  size: number;
  archivePath?: string;
}

interface SnapshotManifest extends SavegameVersion {
  files: SnapshotFile[];
}

const emptyConfig = (): SavegameConfig => ({
  deviceId: randomUUID(),
  deviceName: os.hostname(),
  games: {},
  policies: {},
  learned: {},
});

const safeSegment = (value: string) => value.replace(/[^a-z0-9_-]/gi, "_");

const defaultPolicy = (): SavegamePolicy => ({
  autoBackup: true,
  backupBeforeLaunch: false,
  maxVersions: 2,
  maxSizeMb: 1024,
  excludedNames: ["cache", "logs", "temp", "tmp"],
  exactRestore: false,
  includeConfig: false,
});

const rootKey = (root: string) => {
  const normalized = path.resolve(root).replaceAll("\\", "/").toLocaleLowerCase();

  for (const [marker, label] of [
    ["/documents/", "documents"],
    ["/saved games/", "saved-games"],
    ["/appdata/roaming/", "appdata"],
    ["/appdata/local/", "local-appdata"],
    ["/appdata/locallow/", "local-low"],
  ] as const) {
    const index = normalized.indexOf(marker);

    if (index >= 0) {
      return `${label}:${safeSegment(normalized.slice(index + marker.length))}`;
    }
  }
  return `custom:${safeSegment(path.basename(normalized)) || "root"}`;
};

export class SavegameManager {
  private readonly discovery: SavegameDiscovery;

  constructor(private readonly configPath: string) {
    this.discovery = new SavegameDiscovery(() => this.readConfig());
  }

  private async readConfig(): Promise<SavegameConfig> {
    return withFileLock(this.configPath, async () => {
      const raw = await readTextIfExists(this.configPath);

      if (!raw) {
        const config = emptyConfig();
        await this.writeConfig(config);
        return config;
      }
      try {
        const parsed = JSON.parse(raw) as SavegameConfig;
        return {
          deviceId: parsed.deviceId || randomUUID(),
          deviceName: parsed.deviceName || os.hostname(),
          games: parsed.games ?? {},
          policies: parsed.policies ?? {},
          learned: parsed.learned ?? {},
        };
      } catch {
        throw new Error("La configuración de partidas está dañada");
      }
    });
  }

  private async writeConfig(config: SavegameConfig) {
    await fs.promises.mkdir(path.dirname(this.configPath), { recursive: true });
    await writeJsonAtomically(this.configPath, config);
  }

  async getPaths(gameId: string) {
    return (await this.readConfig()).games[gameId] ?? [];
  }

  async getPolicy(gameId: string) {
    return savegamePolicySchema.parse({
      ...defaultPolicy(),
      ...(await this.readConfig()).policies?.[gameId],
    });
  }

  async setPolicy(gameId: string, policy: Partial<SavegamePolicy>) {
    return withFileLock(this.configPath, async () => {
      const config = await this.readConfig();
      config.policies ??= {};
      const next = savegamePolicySchema.parse({
        ...defaultPolicy(),
        ...config.policies[gameId],
        ...policy,
      });
      next.maxVersions = Math.max(1, Math.min(100, Math.round(next.maxVersions)));
      next.maxSizeMb = Math.max(1, Math.min(10240, Math.round(next.maxSizeMb)));
      next.excludedNames = [
        ...new Set(
          next.excludedNames
            .map((item) => item.trim().toLocaleLowerCase())
            .filter(Boolean),
        ),
      ];
      config.policies[gameId] = next;
      await this.writeConfig(config);
      return next;
    });
  }

  async addPath(gameId: string, folderPath: string) {
    return withFileLock(this.configPath, async () => {
      const info = await fs.promises.stat(folderPath).catch(() => null);

      if (!info?.isDirectory()) {
        throw new Error("La carpeta de partidas no existe");
      }

      const config = await this.readConfig();
      config.games[gameId] = [
        ...new Set([...(config.games[gameId] ?? []), path.resolve(folderPath)]),
      ];
      await this.writeConfig(config);
      return config.games[gameId];
    });
  }

  async removePath(gameId: string, folderPath: string) {
    return withFileLock(this.configPath, async () => {
      const config = await this.readConfig();
      config.games[gameId] = (config.games[gameId] ?? []).filter(
        (item) => item !== folderPath,
      );
      await this.writeConfig(config);
      return config.games[gameId];
    });
  }

  async removeInstallRoot(gameId: string, executablePath: string) {
    return withFileLock(this.configPath, async () => {
      if (!executablePath) {
        return this.getPaths(gameId);
      }

      const executable = path.resolve(executablePath);
      const config = await this.readConfig();
      const current = config.games[gameId] ?? [];
      config.games[gameId] = current.filter((item) => {
        const root = path.resolve(item);
        return executable !== root && !executable.startsWith(`${root}${path.sep}`);
      });
      if (config.games[gameId]!.length !== current.length) {
        await this.writeConfig(config);
      }
      return config.games[gameId]!;
    });
  }

  async purgeGame(
    gameId: string,
    gameTitle: string,
    sourceId: string,
    syncFolderPath?: string | null,
  ) {
    return withFileLock(this.configPath, async () => {
      const config = await this.readConfig();
      delete config.games[gameId];
      delete config.policies?.[gameId];
      delete config.learned?.[gameTitle];
      await this.writeConfig(config);
      this.discovery.clearCache();

      if (syncFolderPath) {
        await fs.promises.rm(this.gameRoot(syncFolderPath, sourceId), {
          recursive: true,
          force: true,
        });
      }
    });
  }

  async captureActivity(roamingAppData: string) {
    return this.discovery.captureActivity(roamingAppData);
  }

  async learnActivity(
    gameTitle: string,
    before: Map<string, number>,
    roamingAppData: string,
  ) {
    return withFileLock(this.configPath, async () => {
      const after = await this.captureActivity(roamingAppData);
      const changed = [...after]
        .filter(
          ([file, modified]) =>
            before.get(file) !== modified &&
            (/\.(sav|save|slot|profile)$/i.test(file) ||
              /(^|[\\/])(save|saves|savegames?|saved games)([\\/]|$)/i.test(file)),
        )
        .map(([file]) => path.dirname(file));

      if (!changed.length) {
        return [];
      }

      const config = await this.readConfig();
      config.learned ??= {};
      config.learned[gameTitle] = [
        ...new Set([...(config.learned[gameTitle] ?? []), ...changed]),
      ].slice(-20);
      await this.writeConfig(config);
      return changed;
    });
  }

  async suggestPaths(...args: Parameters<SavegameDiscovery["suggestPaths"]>) {
    return this.discovery.suggestPaths(...args);
  }

  private gameRoot(syncFolder: string, sourceId: string) {
    return path.join(syncFolder, "launcher-next-saves", safeSegment(sourceId));
  }

  async listVersions(syncFolder: string, sourceId: string): Promise<SavegameVersion[]> {
    const gameRoot = this.gameRoot(syncFolder, sourceId);
    const versions: SavegameVersion[] = [];
    const archiveDirectory = path.join(gameRoot, "versions");
    const directory = path.join(gameRoot, "snapshots");
    const entries = await fs.promises
      .readdir(directory, { withFileTypes: true })
      .catch(() => []);
    const archives = await fs.promises
      .readdir(archiveDirectory, { withFileTypes: true })
      .catch(() => []);
    const snapshotIds = new Set(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => entry.name.slice(0, -5)),
    );

    for (const entry of archives) {
      if (!entry.isFile() || !entry.name.endsWith(".zip")) {
        continue;
      }
      if (snapshotIds.has(entry.name.slice(0, -4))) {
        continue;
      }
      try {
        const manifest = await withArchive(
          path.join(archiveDirectory, entry.name),
          MAX_BACKUP_BYTES,
          async (archive) => manifestSchema.parse(await archive.manifest()),
        );

        if (manifest.id !== entry.name.slice(0, -4)) {
          continue;
        }
        versionIdSchema.parse(manifest.id);
        versions.push({
          id: manifest.id,
          createdAt: manifest.createdAt,
          deviceId: manifest.deviceId,
          deviceName: manifest.deviceName,
          sizeBytes: manifest.sizeBytes,
          fileCount: manifest.fileCount,
          pinned: manifest.pinned ?? false,
        });
      } catch {
        /* Ignore an archive while Drive is downloading it. */
      }
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }

      const raw = await readTextIfExists(
        path.join(directory, entry.name),
        MAX_MANIFEST_BYTES,
      );

      if (!raw) {
        continue;
      }
      try {
        const manifest = manifestSchema.parse(JSON.parse(raw));

        if (manifest.id !== entry.name.slice(0, -5)) {
          continue;
        }
        versionIdSchema.parse(manifest.id);
        versions.push({
          id: manifest.id,
          createdAt: manifest.createdAt,
          deviceId: manifest.deviceId,
          deviceName: manifest.deviceName,
          sizeBytes: manifest.sizeBytes,
          fileCount: manifest.fileCount,
          pinned: manifest.pinned ?? false,
        });
      } catch {
        /* Ignore a Drive file while it is being downloaded. */
      }
    }
    return versions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private async currentSignature(gameId: string) {
    const roots = await this.getPaths(gameId);

    if (!roots.length) {
      return null;
    }

    const policy = await this.getPolicy(gameId);
    const files: Array<{ rootIndex: number; relativePath: string; hash: string }> = [];

    for (const [rootIndex, root] of roots.entries()) {
      const walk = async (directory: string): Promise<void> => {
        const entries = await fs.promises
          .readdir(directory, { withFileTypes: true })
          .catch(() => []);

        for (const entry of entries) {
          if (policy.excludedNames.includes(entry.name.toLocaleLowerCase())) {
            continue;
          }

          const absolute = path.join(directory, entry.name);

          if (entry.isDirectory() && !entry.isSymbolicLink()) {
            await walk(absolute);
          } else if (entry.isFile()) {
            const { hash } = await copyAndHash(
              absolute,
              undefined,
              policy.maxSizeMb * 1024 * 1024,
            );
            files.push({
              rootIndex,
              relativePath: path.relative(root, absolute),
              hash,
            });
          }
        }
      };
      await walk(root);
    }
    files.sort((a, b) =>
      `${a.rootIndex}:${a.relativePath}`.localeCompare(
        `${b.rootIndex}:${b.relativePath}`,
      ),
    );
    const signature = createHash("sha256")
      .update(JSON.stringify(files))
      .digest("hex")
      .slice(0, 12);
    return signature;
  }

  async currentMatchesLatest(gameId: string, latestVersion?: SavegameVersion) {
    if (!latestVersion) {
      return false;
    }

    const signature = await this.currentSignature(gameId);
    return Boolean(signature && latestVersion.id.endsWith(signature));
  }

  async detectExternalConflict(
    gameId: string,
    sourceId: string,
    syncFolder: string,
    latestVersion?: SavegameVersion,
    currentMatchesLatest?: boolean,
  ): Promise<SavegameConflict | null> {
    const [config, latest] = await Promise.all([
      this.readConfig(),
      latestVersion
        ? Promise.resolve(latestVersion)
        : this.listVersions(syncFolder, sourceId).then((versions) => versions[0]),
    ]);

    if (!latest || latest.deviceId === config.deviceId) {
      return null;
    }

    const matchesLatest =
      currentMatchesLatest ?? (await this.currentMatchesLatest(gameId, latest));
    return matchesLatest ? null : { remoteVersion: latest };
  }

  async backup(
    gameId: string,
    sourceId: string,
    syncFolder: string,
    preserveVersionId?: string,
  ): Promise<SavegameVersion | null> {
    return withFileLock(this.configPath, async () => {
      const config = await this.readConfig();
      const roots = config.games[gameId] ?? [];
      const policy = savegamePolicySchema.parse({
        ...defaultPolicy(),
        ...config.policies?.[gameId],
      });

      if (roots.length === 0) {
        return null;
      }

      const gameRoot = this.gameRoot(syncFolder, sourceId);
      const archiveRoot = path.join(gameRoot, "versions");
      await fs.promises.mkdir(archiveRoot, { recursive: true });
      const files: SnapshotFile[] = [];
      const archiveFiles: Array<{ source: string; name: string }> = [];
      const staging = await fs.promises.mkdtemp(path.join(gameRoot, ".backup-"));

      try {
        let totalSize = 0;

        for (const [rootIndex, root] of roots.entries()) {
          const walk = async (directory: string) => {
            const entries = await fs.promises.readdir(directory, {
              withFileTypes: true,
            });

            for (const entry of entries) {
              const absolute = path.join(directory, entry.name);

              if (policy.excludedNames.includes(entry.name.toLocaleLowerCase())) {
                continue;
              }
              if (entry.isDirectory()) {
                await walk(absolute);
              } else if (entry.isFile()) {
                const stat = await fs.promises.stat(absolute);

                if (stat.size > policy.maxSizeMb * 1024 * 1024) {
                  throw new Error(
                    `El archivo ${entry.name} supera el límite de ${policy.maxSizeMb} MB`,
                  );
                }

                const source = path.join(staging, String(files.length));
                const { hash, size } = await copyAndHash(
                  absolute,
                  source,
                  policy.maxSizeMb * 1024 * 1024 - totalSize,
                );
                const relativePath = path.relative(root, absolute);
                const archivePath = `files/${files.length}`;
                archiveFiles.push({ source, name: archivePath });
                totalSize += size;
                files.push({
                  rootIndex,
                  rootKey: rootKey(root),
                  relativePath,
                  hash,
                  size,
                  archivePath,
                });
                if (
                  files.length > 100_000 ||
                  totalSize > policy.maxSizeMb * 1024 * 1024
                ) {
                  throw new Error(
                    `La copia supera el límite de ${policy.maxSizeMb} MB`,
                  );
                }
              }
            }
          };
          await walk(root);
        }
        files.sort((a, b) =>
          `${a.rootIndex}:${a.relativePath}`.localeCompare(
            `${b.rootIndex}:${b.relativePath}`,
          ),
        );
        const signature = createHash("sha256")
          .update(
            JSON.stringify(
              files.map(({ rootIndex, relativePath, hash }) => ({
                rootIndex,
                relativePath,
                hash,
              })),
            ),
          )
          .digest("hex");
        const versions = await this.listVersions(syncFolder, sourceId);

        if (versions[0]?.id.endsWith(signature.slice(0, 12))) {
          return versions[0];
        }

        const createdAt = new Date().toISOString();
        const id = `${createdAt.replace(/[:.]/g, "-")}-${safeSegment(config.deviceId)}-${signature.slice(0, 12)}`;
        const manifest: SnapshotManifest = {
          id,
          createdAt,
          deviceId: config.deviceId,
          deviceName: config.deviceName,
          sizeBytes: totalSize,
          fileCount: files.length,
          files,
        };
        const target = path.join(archiveRoot, `${id}.zip`);
        const temporary = path.join(staging, "backup.zip");
        await writeArchive(temporary, archiveFiles, manifest);
        await fs.promises.rename(temporary, target);
        const snapshotRoot = path.join(gameRoot, "snapshots");
        await fs.promises.mkdir(snapshotRoot, { recursive: true });
        const manifestPath = path.join(snapshotRoot, `${id}.json`);
        await writeJsonAtomically(manifestPath, manifest);
        await pruneVersions(
          gameRoot,
          () => this.listVersions(syncFolder, sourceId),
          policy.maxVersions,
          preserveVersionId,
        );
        return manifest;
      } finally {
        await fs.promises.rm(staging, { recursive: true, force: true });
      }
    });
  }

  async setPinned(
    syncFolder: string,
    sourceId: string,
    versionId: string,
    pinned: boolean,
  ) {
    return withFileLock(this.configPath, async () => {
      versionIdSchema.parse(versionId);
      const root = this.gameRoot(syncFolder, sourceId);
      const manifest = await this.readManifest(root, versionId);
      manifest.pinned = pinned;
      await writeJsonAtomically(
        path.join(root, "snapshots", `${versionId}.json`),
        manifest,
      );
      return this.listVersions(syncFolder, sourceId);
    });
  }

  private async readManifest(
    root: string,
    versionId: string,
  ): Promise<SnapshotManifest> {
    versionIdSchema.parse(versionId);
    const filePath = path.join(root, "snapshots", `${versionId}.json`);
    const info = await fs.promises.stat(filePath).catch(() => null);

    if (info && info.size > MAX_MANIFEST_BYTES) {
      throw new Error("Manifiesto demasiado grande");
    }

    const manifest = info
      ? manifestSchema.parse(JSON.parse(await fs.promises.readFile(filePath, "utf8")))
      : await withArchive(
          path.join(root, "versions", `${versionId}.zip`),
          MAX_BACKUP_BYTES,
          async (archive) => manifestSchema.parse(await archive.manifest()),
        );

    if (manifest.id !== versionId) {
      throw new Error("La versión no coincide con su manifiesto");
    }
    return manifest;
  }

  async recoverRestore() {
    await recoverRestore(`${this.configPath}.restore.json`);
  }

  async restore(
    gameId: string,
    sourceId: string,
    syncFolder: string,
    versionId: string,
  ) {
    return withFileLock(this.configPath, async () => {
      versionIdSchema.parse(versionId);
      const roots = await this.getPaths(gameId);

      if (!roots.length) {
        throw new Error("Configura primero una carpeta local de partidas");
      }

      const gameRoot = this.gameRoot(syncFolder, sourceId);
      const manifest = await this.readManifest(gameRoot, versionId);
      const policy = await this.getPolicy(gameId);
      const limit = policy.maxSizeMb * 1024 * 1024;

      if (manifest.sizeBytes > limit) {
        throw new Error("La copia supera el tamaño permitido");
      }

      const targets = new Set<string>();
      const mapped = manifest.files.map((file) => {
        const matched = file.rootKey
          ? roots.findIndex((root) => rootKey(root) === file.rootKey)
          : -1;
        const index = matched >= 0 ? matched : file.rootIndex;

        if (!roots[index]) {
          throw new Error("Falta una carpeta local para restaurar la copia completa");
        }

        const target = restoreTarget(roots[index]!, file.relativePath).toLowerCase();

        if (targets.has(target)) {
          throw new Error("La copia contiene rutas duplicadas");
        }
        targets.add(target);
        return { file, index };
      });
      await restoreDirectories(
        roots,
        policy.exactRestore,
        `${this.configPath}.restore.json`,
        async (stages) => {
          const populate = async (
            stream?: (name: string) => Promise<NodeJS.ReadableStream>,
          ) => {
            let remaining = limit;

            for (const { file, index } of mapped) {
              const target = restoreTarget(stages[index]!, file.relativePath);
              await fs.promises.mkdir(path.dirname(target), { recursive: true });
              await fs.promises.rm(target, { force: true });
              const source =
                stream && file.archivePath
                  ? await stream(file.archivePath)
                  : path.join(gameRoot, "blobs", file.hash);
              const result = await copyAndHash(
                source,
                target,
                Math.min(remaining, file.size),
              );

              if (result.hash !== file.hash || result.size !== file.size) {
                throw new Error(`La copia está dañada: ${file.relativePath}`);
              }
              remaining -= result.size;
            }
          };
          const archivePath = path.join(gameRoot, "versions", `${versionId}.zip`);

          if (await fs.promises.stat(archivePath).catch(() => null)) {
            await withArchive(archivePath, limit, async (archive) => {
              for (const { file } of mapped) {
                if (
                  !file.archivePath ||
                  archive.entries.get(file.archivePath)?.uncompressedSize !== file.size
                ) {
                  throw new Error(`La copia está dañada: ${file.relativePath}`);
                }
              }
              await populate(archive.stream);
            });
          } else {
            await populate();
          }
        },
      );
      return { restoredFiles: mapped.length };
    });
  }
}
