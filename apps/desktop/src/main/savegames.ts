import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { strToU8, unzip, zip } from "fflate";
export interface SavegameVersion {
  id: string;
  createdAt: string;
  deviceId: string;
  deviceName: string;
  sizeBytes: number;
  fileCount: number;
  pinned?: boolean;
}

export interface SavegameConflict {
  remoteVersion: SavegameVersion;
}

export interface SavegameSuggestion {
  path: string;
  confidence: "high" | "medium" | "low";
  reason: string;
}

export interface SavegamePolicy {
  autoBackup: boolean;
  backupBeforeLaunch: boolean;
  maxVersions: number;
  maxSizeMb: number;
  excludedNames: string[];
  exactRestore: boolean;
  includeConfig: boolean;
}

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

const zipAsync = (files: Record<string, Uint8Array>) =>
  new Promise<Uint8Array>((resolve, reject) => {
    zip(files, { level: 6 }, (error, data) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(data);
    });
  });

const unzipAsync = (bytes: Uint8Array) =>
  new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(bytes, (error, data) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(data);
    });
  });

export class SavegameManager {
  private readonly suggestionCache = new Map<
    string,
    { expiresAt: number; suggestions: SavegameSuggestion[] }
  >();

  constructor(private readonly configPath: string) {}

  private async readConfig(): Promise<SavegameConfig> {
    const raw = await fs.promises.readFile(this.configPath, "utf8").catch(() => null);

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
      return emptyConfig();
    }
  }

  private async writeConfig(config: SavegameConfig) {
    await fs.promises.mkdir(path.dirname(this.configPath), { recursive: true });
    await fs.promises.writeFile(this.configPath, JSON.stringify(config, null, 2));
  }

  async getPaths(gameId: string) {
    return (await this.readConfig()).games[gameId] ?? [];
  }

  async getPolicy(gameId: string) {
    return { ...defaultPolicy(), ...(await this.readConfig()).policies?.[gameId] };
  }

  async setPolicy(gameId: string, policy: Partial<SavegamePolicy>) {
    const config = await this.readConfig();
    config.policies ??= {};
    const next = { ...defaultPolicy(), ...config.policies[gameId], ...policy };
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
  }

  async addPath(gameId: string, folderPath: string) {
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
  }

  async removePath(gameId: string, folderPath: string) {
    const config = await this.readConfig();
    config.games[gameId] = (config.games[gameId] ?? []).filter(
      (item) => item !== folderPath,
    );
    await this.writeConfig(config);
    return config.games[gameId];
  }

  async removeInstallRoot(gameId: string, executablePath: string) {
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
  }

  async captureActivity(roamingAppData: string) {
    const profile = path.dirname(path.dirname(roamingAppData));
    const roots = [
      path.join(profile, "Documents"),
      path.join(profile, "Saved Games"),
      roamingAppData,
      path.join(path.dirname(roamingAppData), "Local"),
      path.join(path.dirname(roamingAppData), "LocalLow"),
    ];
    const snapshot = new Map<string, number>();
    let visited = 0;
    const walk = async (directory: string, depth: number): Promise<void> => {
      if (visited++ >= 2_500 || depth > 3) {
        return;
      }

      const entries = await fs.promises
        .readdir(directory, { withFileTypes: true })
        .catch(() => []);

      for (const entry of entries) {
        if (/^\.|^(cache|logs?|temp|tmp|node_modules)$/i.test(entry.name)) {
          continue;
        }

        const absolute = path.join(directory, entry.name);

        if (entry.isDirectory() && !entry.isSymbolicLink()) {
          await walk(absolute, depth + 1);
        } else if (entry.isFile()) {
          const info = await fs.promises.stat(absolute).catch(() => null);

          if (info) {
            snapshot.set(absolute, info.mtimeMs);
          }
        }
      }
    };

    for (const root of roots) {
      await walk(root, 0);
    }
    return snapshot;
  }

  async learnActivity(
    gameTitle: string,
    before: Map<string, number>,
    roamingAppData: string,
  ) {
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
  }

  async suggestPaths(
    gameTitle: string,
    roamingAppData: string,
    executablePath = "",
    steamAppId?: string | null,
    ludusavi?: { name: string; files: Array<{ path: string; tags: string[] }> } | null,
    includeConfig = false,
    scanHeuristics = true,
  ): Promise<SavegameSuggestion[]> {
    const cacheKey = JSON.stringify([
      gameTitle,
      roamingAppData,
      executablePath,
      steamAppId,
      ludusavi?.name,
      includeConfig,
      scanHeuristics,
    ]);
    const cached = this.suggestionCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.suggestions;
    }

    const profile = path.dirname(path.dirname(roamingAppData));
    const executableDirectory = executablePath ? path.dirname(executablePath) : "";
    const roots = [
      ...new Set(
        [
          path.join(profile, "Documents", "My Games"),
          path.join(profile, "Saved Games"),
          path.join(profile, "Documents"),
          roamingAppData,
          path.join(path.dirname(roamingAppData), "Local"),
          path.join(path.dirname(roamingAppData), "LocalLow"),
          executableDirectory,
        ]
          .filter(Boolean)
          .map((item) => path.resolve(item)),
      ),
    ];
    const normalize = (value: string) =>
      value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
    const titleParts = gameTitle
      .split(/[:\-–—|()\[\]]/)
      .map(normalize)
      .filter((item) => item.length >= 5);
    const executableName = executablePath
      ? normalize(path.basename(executablePath, path.extname(executablePath)))
      : "";
    const identifiers = [
      ...new Set(
        [normalize(gameTitle), ...titleParts, executableName, steamAppId ?? ""].filter(
          (item) => item.length >= 4,
        ),
      ),
    ];
    const saveExtensions = new Set([
      ".sav",
      ".save",
      ".dat",
      ".bin",
      ".slot",
      ".profile",
      ".json",
    ]);
    const found = new Map<string, SavegameSuggestion>();
    const learned = (await this.readConfig()).learned?.[gameTitle] ?? [];

    for (const learnedPath of learned) {
      const info = await fs.promises.stat(learnedPath).catch(() => null);

      if (
        info?.isDirectory() &&
        /(^|[\\/])(save|saves|savegames?|saved games)([\\/]|$)/i.test(learnedPath)
      ) {
        found.set(learnedPath, {
          path: learnedPath,
          confidence: "high",
          reason: "Archivos de partida modificados mientras jugabas",
        });
      }
    }

    let visited = 0;

    if (ludusavi) {
      const replacements: Record<string, string> = {
        "<home>": profile,
        "<winAppData>": roamingAppData,
        "<winLocalAppData>": path.join(path.dirname(roamingAppData), "Local"),
        "<winLocalAppDataLow>": path.join(path.dirname(roamingAppData), "LocalLow"),
        "<winDocuments>": path.join(profile, "Documents"),
        "<winPublic>": path.join(path.dirname(profile), "Public"),
        "<winProgramData>": path.join(path.parse(profile).root, "ProgramData"),
        "<osUserName>": path.basename(profile),
        "<base>": executableDirectory,
        "<root>": executableDirectory ? path.dirname(executableDirectory) : "",
        "<game>": ludusavi.name,
        "<storeGameId>": steamAppId ?? "",
        "<storeUserId>": "*",
      };

      for (const manifestFile of ludusavi.files) {
        if (
          !includeConfig &&
          manifestFile.tags.includes("config") &&
          !manifestFile.tags.includes("save")
        ) {
          continue;
        }

        const manifestPath = manifestFile.path;

        if (
          (manifestPath.includes("<base>") || manifestPath.includes("<root>")) &&
          !executableDirectory
        ) {
          continue;
        }

        let resolved = manifestPath;

        for (const [placeholder, value] of Object.entries(replacements)) {
          resolved = resolved.replaceAll(placeholder, value);
        }
        if (!resolved || /<[^>]+>/.test(resolved)) {
          continue;
        }
        resolved = path.resolve(resolved.replaceAll("/", path.sep));
        const allowed = [...roots, profile].some((root) =>
          resolved.startsWith(path.resolve(root)),
        );

        if (!allowed) {
          continue;
        }

        const matches: string[] = [];

        if (/[*?{}[\]]/.test(resolved)) {
          for await (const match of fs.promises.glob(resolved)) {
            matches.push(match);
            if (matches.length >= 100) {
              break;
            }
          }
        } else {
          matches.push(resolved);
        }
        for (const match of matches) {
          const info = await fs.promises.stat(match).catch(() => null);
          const directory = info?.isDirectory()
            ? match
            : info?.isFile()
              ? path.dirname(match)
              : null;

          if (directory) {
            found.set(directory, {
              path: directory,
              confidence: "high",
              reason: `Ruta conocida de Ludusavi para ${ludusavi.name}`,
            });
          }
        }
      }
    }

    const inspect = async (
      directory: string,
      depth: number,
      root: string,
    ): Promise<void> => {
      if (visited++ >= 2_000) {
        return;
      }

      const entries = await fs.promises
        .readdir(directory, { withFileTypes: true })
        .catch(() => []);
      const normalizedSegments = path
        .relative(root, directory)
        .split(path.sep)
        .map(normalize);
      const matchingIdentifier = identifiers.find((identifier) =>
        normalizedSegments.some(
          (segment) =>
            segment === identifier ||
            (identifier.length >= 5 &&
              (segment.includes(identifier) || identifier.includes(segment))),
        ),
      );
      const hasSaveFile = entries.some(
        (entry) =>
          entry.isFile() &&
          (saveExtensions.has(path.extname(entry.name).toLowerCase()) ||
            /^(save|slot|profile|checkpoint)/i.test(entry.name)),
      );
      const appIdMatch = Boolean(steamAppId && normalizedSegments.includes(steamAppId));

      if ((matchingIdentifier || appIdMatch) && (hasSaveFile || depth < 2)) {
        const confidence =
          appIdMatch || (matchingIdentifier && hasSaveFile)
            ? "high"
            : hasSaveFile
              ? "medium"
              : "low";
        const reason = appIdMatch
          ? `Coincide con Steam AppID ${steamAppId}`
          : hasSaveFile
            ? "Coincide con el juego y contiene archivos de partida"
            : "El nombre coincide con el juego";
        const candidate = {
          path: directory,
          confidence,
          reason,
        } satisfies SavegameSuggestion;
        const previous = found.get(directory);

        if (
          !previous ||
          ["low", "medium", "high"].indexOf(candidate.confidence) >
            ["low", "medium", "high"].indexOf(previous.confidence)
        ) {
          found.set(directory, candidate);
        }
      }
      if (depth >= 3) {
        return;
      }
      for (const entry of entries) {
        if (
          !entry.isDirectory() ||
          entry.isSymbolicLink() ||
          /^\.|^(cache|logs?|temp|tmp|node_modules)$/i.test(entry.name)
        ) {
          continue;
        }
        await inspect(path.join(directory, entry.name), depth + 1, root);
      }
    };

    if (scanHeuristics) {
      for (const root of roots) {
        await inspect(root, 0, root);
      }
    }

    const rank = { high: 2, medium: 1, low: 0 } as const;
    const suggestions = [...found.values()]
      .sort(
        (a, b) =>
          rank[b.confidence] - rank[a.confidence] || a.path.localeCompare(b.path),
      )
      .slice(0, 20);
    this.suggestionCache.set(cacheKey, {
      expiresAt: Date.now() + 5 * 60_000,
      suggestions,
    });
    return suggestions;
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
        const archive = await unzipAsync(
          new Uint8Array(
            await fs.promises.readFile(path.join(archiveDirectory, entry.name)),
          ),
        );
        const manifest = JSON.parse(
          Buffer.from(archive["manifest.json"]!).toString("utf8"),
        ) as SnapshotManifest;
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

      const raw = await fs.promises
        .readFile(path.join(directory, entry.name), "utf8")
        .catch(() => null);

      if (!raw) {
        continue;
      }
      try {
        const manifest = JSON.parse(raw) as SnapshotManifest;
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
            const bytes = await fs.promises.readFile(absolute);
            files.push({
              rootIndex,
              relativePath: path.relative(root, absolute),
              hash: createHash("sha256").update(bytes).digest("hex"),
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
  ): Promise<SavegameVersion | null> {
    const config = await this.readConfig();
    const roots = config.games[gameId] ?? [];
    const policy = { ...defaultPolicy(), ...config.policies?.[gameId] };

    if (roots.length === 0) {
      return null;
    }

    const gameRoot = this.gameRoot(syncFolder, sourceId);
    const archiveRoot = path.join(gameRoot, "versions");
    await fs.promises.mkdir(archiveRoot, { recursive: true });
    const files: SnapshotFile[] = [];
    const archiveFiles: Record<string, Uint8Array> = {};
    let totalSize = 0;

    for (const [rootIndex, root] of roots.entries()) {
      const walk = async (directory: string) => {
        const entries = await fs.promises
          .readdir(directory, { withFileTypes: true })
          .catch(() => []);

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

            const bytes = await fs.promises.readFile(absolute);
            const hash = createHash("sha256").update(bytes).digest("hex");
            const relativePath = path.relative(root, absolute);
            const archivePath = `files/${rootIndex}/${relativePath.split(path.sep).map(safeSegment).join("/")}`;
            archiveFiles[archivePath] = new Uint8Array(bytes);
            totalSize += bytes.length;
            files.push({
              rootIndex,
              rootKey: rootKey(root),
              relativePath,
              hash,
              size: bytes.length,
              archivePath,
            });
            if (files.length > 100_000 || totalSize > policy.maxSizeMb * 1024 * 1024) {
              throw new Error(`La copia supera el límite de ${policy.maxSizeMb} MB`);
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
    archiveFiles["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
    const target = path.join(archiveRoot, `${id}.zip`);
    const temporary = `${target}.tmp`;
    await fs.promises.writeFile(temporary, await zipAsync(archiveFiles));
    await fs.promises.rename(temporary, target);
    const snapshotRoot = path.join(gameRoot, "snapshots");
    await fs.promises.mkdir(snapshotRoot, { recursive: true });
    const manifestPath = path.join(snapshotRoot, `${id}.json`);
    await fs.promises.writeFile(
      `${manifestPath}.tmp`,
      JSON.stringify(manifest, null, 2),
    );
    await fs.promises.rename(`${manifestPath}.tmp`, manifestPath);
    await this.prune(syncFolder, sourceId, policy.maxVersions);
    return manifest;
  }

  private async prune(syncFolder: string, sourceId: string, maxVersions: number) {
    const gameRoot = this.gameRoot(syncFolder, sourceId);
    const snapshotRoot = path.join(gameRoot, "snapshots");
    const archiveRoot = path.join(gameRoot, "versions");
    const versions = await this.listVersions(syncFolder, sourceId);
    const removable = versions.filter((version) => !version.pinned).slice(maxVersions);

    for (const version of removable) {
      await fs.promises
        .unlink(path.join(archiveRoot, `${version.id}.zip`))
        .catch(() => undefined);
      await fs.promises
        .unlink(path.join(snapshotRoot, `${version.id}.json`))
        .catch(() => undefined);
    }

    const retained = await this.listVersions(syncFolder, sourceId);
    const hashes = new Set<string>();

    for (const version of retained) {
      const raw = await fs.promises
        .readFile(path.join(snapshotRoot, `${version.id}.json`), "utf8")
        .catch(() => null);

      if (raw) {
        for (const file of (JSON.parse(raw) as SnapshotManifest).files) {
          hashes.add(file.hash);
        }
      }
    }

    const blobRoot = path.join(gameRoot, "blobs");

    for (const entry of await fs.promises
      .readdir(blobRoot, { withFileTypes: true })
      .catch(() => [])) {
      if (entry.isFile() && !hashes.has(entry.name)) {
        await fs.promises
          .unlink(path.join(blobRoot, entry.name))
          .catch(() => undefined);
      }
    }
  }

  async setPinned(
    syncFolder: string,
    sourceId: string,
    versionId: string,
    pinned: boolean,
  ) {
    const archivePath = path.join(
      this.gameRoot(syncFolder, sourceId),
      "versions",
      `${versionId}.zip`,
    );
    const manifestPath = path.join(
      this.gameRoot(syncFolder, sourceId),
      "snapshots",
      `${versionId}.json`,
    );
    const raw = await fs.promises.readFile(manifestPath, "utf8").catch(() => null);

    if (!raw) {
      const archiveBytes = await fs.promises.readFile(archivePath);
      const archive = await unzipAsync(new Uint8Array(archiveBytes));
      const manifest = JSON.parse(
        Buffer.from(archive["manifest.json"]!).toString("utf8"),
      ) as SnapshotManifest;
      manifest.pinned = pinned;
      archive["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
      const temporary = `${archivePath}.tmp`;
      await fs.promises.writeFile(temporary, await zipAsync(archive));
      await fs.promises.rename(temporary, archivePath);
      return this.listVersions(syncFolder, sourceId);
    }

    const manifest = JSON.parse(raw) as SnapshotManifest;
    manifest.pinned = pinned;
    const temporary = `${manifestPath}.tmp`;
    await fs.promises.writeFile(temporary, JSON.stringify(manifest, null, 2));
    await fs.promises.rename(temporary, manifestPath);
    return this.listVersions(syncFolder, sourceId);
  }

  async restore(
    gameId: string,
    sourceId: string,
    syncFolder: string,
    versionId: string,
  ) {
    const roots = await this.getPaths(gameId);

    if (roots.length === 0) {
      throw new Error("Configura primero una carpeta local de partidas");
    }

    const gameRoot = this.gameRoot(syncFolder, sourceId);
    const archiveBytes = await fs.promises
      .readFile(path.join(gameRoot, "versions", `${versionId}.zip`))
      .catch(() => null);
    const archive = archiveBytes
      ? await unzipAsync(new Uint8Array(archiveBytes))
      : null;
    const raw = await fs.promises
      .readFile(path.join(gameRoot, "snapshots", `${versionId}.json`), "utf8")
      .catch(() =>
        archive ? Buffer.from(archive["manifest.json"]!).toString("utf8") : null,
      );

    if (!raw) {
      throw new Error("No se encontró la copia de partidas");
    }

    const manifest = JSON.parse(raw) as SnapshotManifest;
    const policy = await this.getPolicy(gameId);

    if (policy.exactRestore) {
      for (const root of roots) {
        const info = await fs.promises.stat(root).catch(() => null);

        if (!info?.isDirectory()) {
          continue;
        }
        for (const entry of await fs.promises.readdir(root)) {
          await fs.promises.rm(path.join(root, entry), {
            recursive: true,
            force: true,
          });
        }
      }
    }
    for (const file of manifest.files) {
      const root = file.rootKey
        ? (roots.find((item) => rootKey(item) === file.rootKey) ??
          roots[file.rootIndex])
        : roots[file.rootIndex];

      if (!root) {
        continue;
      }

      const target = path.resolve(root, file.relativePath);

      if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) {
        throw new Error("La copia contiene una ruta no válida");
      }
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      const bytes =
        archive && file.archivePath
          ? Buffer.from(archive[file.archivePath]!)
          : await fs.promises.readFile(path.join(gameRoot, "blobs", file.hash));

      if (createHash("sha256").update(bytes).digest("hex") !== file.hash) {
        throw new Error(`La copia está dañada: ${file.relativePath}`);
      }
      await fs.promises.writeFile(target, bytes);
    }
    return { restoredFiles: manifest.files.length };
  }
}
