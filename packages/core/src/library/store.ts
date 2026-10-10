import {
  readTextIfExists,
  withFileLock,
  writeJsonAtomically,
} from "../shared/persistence.js";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isValidSteamAppId } from "../shared/types.js";
import type {
  LibraryGame,
  LibrarySnapshot,
  LocalGameInput,
  SteamCandidate,
  SteamOwnedGame,
} from "../shared/types.js";
import { steamFallbackArtwork } from "../artwork/steam.js";
const emptySnapshot = (): LibrarySnapshot => ({
  version: 1,
  games: [],
  sessions: [],
  excludedGameKeys: [],
});

const excludedSteamAppIds = new Set(["228980"]);

const isLegacySteamLibraryArtwork = (url: string | null | undefined): boolean =>
  Boolean(
    url?.includes("/library_600x900_2x.jpg") || url?.includes("/library_hero.jpg"),
  );

const retainedArtwork = (url: string | null | undefined) =>
  isLegacySteamLibraryArtwork(url) ? null : (url ?? null);

const steamArtwork = (appId: string) => steamFallbackArtwork(appId);

interface LibraryCacheEntry {
  stamp: string;
  revision: number;
  snapshot: LibrarySnapshot;
  byId: Map<string, LibraryGame>;
}

// Shared between stores; callers always receive their own mutable objects.
const libraryCache = new Map<string, LibraryCacheEntry>();
const snapshotRevisions = new WeakMap<LibrarySnapshot, number>();
let nextSnapshotRevision = 0;

export class LibraryStore {
  constructor(private readonly filePath: string) {}

  async read(): Promise<LibrarySnapshot> {
    return withFileLock(this.filePath, async () => {
      const { snapshot, revision } = await this.loadCached();
      const copy = {
        ...snapshot,
        games: snapshot.games.map((game) => ({ ...game })),
        sessions: snapshot.sessions.map((session) => ({ ...session })),
        excludedGameKeys: [...(snapshot.excludedGameKeys ?? [])],
      };
      snapshotRevisions.set(copy, revision);
      return copy;
    });
  }

  getSnapshotRevision(snapshot: LibrarySnapshot) {
    return snapshotRevisions.get(snapshot);
  }

  async getGame(gameId: string): Promise<LibraryGame | null> {
    return withFileLock(this.filePath, async () => {
      const game = (await this.loadCached()).byId.get(gameId);
      return game ? { ...game } : null;
    });
  }

  private async loadCached(): Promise<LibraryCacheEntry> {
    const key = path.resolve(this.filePath);
    const info = await fs.promises.stat(key).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    });

    if (!info) {
      libraryCache.delete(key);
      return {
        stamp: "missing",
        revision: ++nextSnapshotRevision,
        snapshot: emptySnapshot(),
        byId: new Map(),
      };
    }

    const stamp = `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
    const cached = libraryCache.get(key);

    if (cached?.stamp === stamp) {
      return cached;
    }

    const raw = await readTextIfExists(key);

    if (!raw) {
      throw new Error("La biblioteca está vacía o ha desaparecido");
    }
    try {
      const parsed = JSON.parse(raw) as LibrarySnapshot;

      if (parsed.version !== 1 || !Array.isArray(parsed.games)) {
        throw new Error("Formato de biblioteca no válido");
      }

      const snapshot: LibrarySnapshot = {
        ...parsed,
        sessions: parsed.sessions ?? [],
        excludedGameKeys: parsed.excludedGameKeys ?? [],
        games: parsed.games
          .filter(
            (game) =>
              game.source !== "steam" || !excludedSteamAppIds.has(game.sourceId),
          )
          .map((game) => ({
            ...game,
            achievementStateId: game.achievementStateId ?? null,
            coverPath: game.coverPath ?? null,
            coverUrl:
              retainedArtwork(game.coverUrl) ??
              (game.source === "steam" ? steamArtwork(game.sourceId).coverUrl : null),
            heroUrl:
              retainedArtwork(game.heroUrl) ??
              (game.source === "steam" ? steamArtwork(game.sourceId).heroUrl : null),
            playtimeSecondsRemainder: game.playtimeSecondsRemainder ?? 0,
            platformPlaytimeMinutes:
              game.platformPlaytimeMinutes ??
              (game.source === "steam" ? game.playtimeMinutes : null),
            trackedPlaytimeSeconds:
              game.trackedPlaytimeSeconds ??
              (game.source === "local"
                ? game.playtimeMinutes * 60 + (game.playtimeSecondsRemainder ?? 0)
                : 0),
            installed: game.installed ?? Boolean(game.installPath),
            hiddenFromLibrary: game.hiddenFromLibrary ?? false,
            updatedAt: game.updatedAt ?? game.importedAt,
          })),
      };
      const entry = {
        stamp,
        revision: ++nextSnapshotRevision,
        snapshot,
        byId: new Map(snapshot.games.map((game) => [game.id, game])),
      };

      if (libraryCache.size >= 32) {
        libraryCache.delete(libraryCache.keys().next().value!);
      }
      libraryCache.set(key, entry);
      return entry;
    } catch {
      throw new Error("La biblioteca está dañada; se conserva el archivo original");
    }
  }

  async importSteam(candidates: SteamCandidate[]): Promise<LibrarySnapshot> {
    return this.importSteamSnapshot(null, candidates);
  }

  async importSteamAccount(ownedGames: SteamOwnedGame[]): Promise<LibrarySnapshot> {
    return this.importSteamSnapshot(ownedGames, null);
  }

  async importSteamSnapshot(
    ownedGames: SteamOwnedGame[] | null,
    installedGames: SteamCandidate[] | null,
  ): Promise<LibrarySnapshot> {
    return withFileLock(this.filePath, async () => {
      let snapshot = await this.read();

      if (ownedGames) {
        snapshot = this.applySteamAccount(snapshot, ownedGames);
      }
      if (installedGames) {
        snapshot = this.applySteamInstalled(snapshot, installedGames);
      }
      await this.write(snapshot);
      return snapshot;
    });
  }

  private applySteamInstalled(
    snapshot: LibrarySnapshot,
    candidates: SteamCandidate[],
  ): LibrarySnapshot {
    const excludedGameKeys = new Set(snapshot.excludedGameKeys ?? []);
    const games = new Map(
      snapshot.games.map((game) => [`${game.source}:${game.sourceId}`, game]),
    );

    const installedAppIds = new Set(candidates.map((candidate) => candidate.appId));

    for (const game of games.values()) {
      if (
        game.source === "steam" &&
        !installedAppIds.has(game.sourceId) &&
        (game.installed || game.installPath)
      ) {
        game.installed = false;
        game.installPath = "";
        game.updatedAt = new Date().toISOString();
      }
    }

    for (const candidate of candidates) {
      if (
        excludedSteamAppIds.has(candidate.appId) ||
        excludedGameKeys.has(`steam:${candidate.appId}`)
      ) {
        continue;
      }

      const key = `steam:${candidate.appId}`;
      const previous = games.get(key);
      const previousPlatformMinutes =
        previous?.platformPlaytimeMinutes ?? previous?.playtimeMinutes;

      if (
        previous &&
        previousPlatformMinutes !== undefined &&
        candidate.playtimeMinutes > previousPlatformMinutes
      ) {
        const durationSeconds =
          (candidate.playtimeMinutes - previousPlatformMinutes) * 60;
        const endedAt = candidate.lastPlayedAt ?? new Date().toISOString();
        snapshot.sessions.push({
          id: randomUUID(),
          gameId: previous.id,
          startedAt: new Date(
            new Date(endedAt).getTime() - durationSeconds * 1_000,
          ).toISOString(),
          endedAt,
          durationSeconds,
          origin: "steam-sync",
        });
      }

      const game: LibraryGame = {
        id: previous?.id ?? randomUUID(),
        source: "steam",
        sourceId: candidate.appId,
        title: candidate.title,
        installPath: candidate.installPath,
        launchUri: `steam://rungameid/${candidate.appId}`,
        coverPath: previous?.coverPath ?? null,
        coverUrl:
          retainedArtwork(previous?.coverUrl) ?? steamArtwork(candidate.appId).coverUrl,
        heroUrl:
          retainedArtwork(previous?.heroUrl) ?? steamArtwork(candidate.appId).heroUrl,
        playtimeMinutes: Math.max(
          previous?.playtimeMinutes ?? 0,
          candidate.playtimeMinutes,
        ),
        playtimeSecondsRemainder: previous?.playtimeSecondsRemainder ?? 0,
        platformPlaytimeMinutes: Math.max(
          previous?.platformPlaytimeMinutes ?? 0,
          candidate.playtimeMinutes,
        ),
        trackedPlaytimeSeconds: previous?.trackedPlaytimeSeconds ?? 0,
        installed: true,
        hiddenFromLibrary: previous?.hiddenFromLibrary ?? false,
        favorite: previous?.favorite ?? false,
        backlogStatus: previous?.backlogStatus ?? null,
        lastPlayedAt: candidate.lastPlayedAt ?? previous?.lastPlayedAt ?? null,
        importedAt: previous?.importedAt ?? new Date().toISOString(),
        updatedAt:
          previous?.updatedAt ?? previous?.importedAt ?? new Date().toISOString(),
      };
      games.set(key, game);
    }

    const next: LibrarySnapshot = {
      version: 1,
      games: [...games.values()].sort((a, b) => a.title.localeCompare(b.title)),
      sessions: snapshot.sessions,
      excludedGameKeys: snapshot.excludedGameKeys ?? [],
    };
    return next;
  }

  private applySteamAccount(
    snapshot: LibrarySnapshot,
    ownedGames: SteamOwnedGame[],
  ): LibrarySnapshot {
    const excludedGameKeys = new Set(snapshot.excludedGameKeys ?? []);
    const games = new Map(
      snapshot.games.map((game) => [`${game.source}:${game.sourceId}`, game]),
    );

    for (const owned of ownedGames) {
      if (
        excludedSteamAppIds.has(owned.appId) ||
        excludedGameKeys.has(`steam:${owned.appId}`)
      ) {
        continue;
      }

      const key = `steam:${owned.appId}`;
      const previous = games.get(key);
      const previousPlatformMinutes =
        previous?.platformPlaytimeMinutes ?? previous?.playtimeMinutes;

      if (
        previous &&
        previousPlatformMinutes !== undefined &&
        owned.playtimeMinutes > previousPlatformMinutes
      ) {
        const durationSeconds = (owned.playtimeMinutes - previousPlatformMinutes) * 60;
        const endedAt = owned.lastPlayedAt ?? new Date().toISOString();
        snapshot.sessions.push({
          id: randomUUID(),
          gameId: previous.id,
          startedAt: new Date(
            new Date(endedAt).getTime() - durationSeconds * 1_000,
          ).toISOString(),
          endedAt,
          durationSeconds,
          origin: "steam-sync",
        });
      }
      games.set(key, {
        id: previous?.id ?? randomUUID(),
        source: "steam",
        sourceId: owned.appId,
        title: owned.title,
        installPath: previous?.installPath ?? "",
        launchUri: `steam://rungameid/${owned.appId}`,
        coverPath: previous?.coverPath ?? null,
        coverUrl:
          retainedArtwork(previous?.coverUrl) ?? steamArtwork(owned.appId).coverUrl,
        heroUrl:
          retainedArtwork(previous?.heroUrl) ?? steamArtwork(owned.appId).heroUrl,
        playtimeMinutes: Math.max(
          previous?.playtimeMinutes ?? 0,
          owned.playtimeMinutes,
        ),
        playtimeSecondsRemainder: previous?.playtimeSecondsRemainder ?? 0,
        platformPlaytimeMinutes: Math.max(
          previous?.platformPlaytimeMinutes ?? 0,
          owned.playtimeMinutes,
        ),
        trackedPlaytimeSeconds: previous?.trackedPlaytimeSeconds ?? 0,
        lastPlayedAt: owned.lastPlayedAt ?? previous?.lastPlayedAt ?? null,
        importedAt: previous?.importedAt ?? new Date().toISOString(),
        updatedAt:
          previous?.updatedAt ?? previous?.importedAt ?? new Date().toISOString(),
        installed: previous?.installed ?? false,
        hiddenFromLibrary: previous?.hiddenFromLibrary ?? false,
        favorite: previous?.favorite ?? false,
        backlogStatus: previous?.backlogStatus ?? null,
      });
    }

    const next = {
      ...snapshot,
      games: [...games.values()].sort((a, b) => a.title.localeCompare(b.title)),
    };
    return next;
  }

  async addLocal(input: LocalGameInput): Promise<LibrarySnapshot> {
    return withFileLock(this.filePath, async () => {
      const snapshot = await this.read();
      const normalizedPath = input.executablePath
        ? path.resolve(input.executablePath)
        : "";
      const previous = normalizedPath
        ? snapshot.games.find(
            (game) =>
              game.source === "local" &&
              game.installPath &&
              path.resolve(game.installPath) === normalizedPath,
          )
        : undefined;

      if (!previous) {
        const now = new Date().toISOString();
        snapshot.games.push({
          id: randomUUID(),
          source: "local",
          sourceId: randomUUID(),
          steamAppId: input.steamAppId ?? null,
          achievementStateId: null,
          ludusaviGameName: input.ludusaviGameName ?? null,
          title: input.title.trim(),
          installPath: normalizedPath,
          launchUri: null,
          coverPath: input.coverPath ?? null,
          coverUrl: input.coverUrl ?? null,
          heroUrl: input.heroUrl ?? null,
          playtimeMinutes: 0,
          playtimeSecondsRemainder: 0,
          platformPlaytimeMinutes: null,
          trackedPlaytimeSeconds: 0,
          installed: Boolean(normalizedPath),
          hiddenFromLibrary: false,
          favorite: false,
          backlogStatus: null,
          lastPlayedAt: null,
          importedAt: now,
          updatedAt: now,
        });
      }
      snapshot.games.sort((a, b) => a.title.localeCompare(b.title));
      await this.write(snapshot);
      return snapshot;
    });
  }

  async updateLocalGame(
    gameId: string,
    input: {
      title: string;
      executablePath: string;
      playtimeMinutes: number;
      steamAppId?: string | null;
      ludusaviGameName?: string | null;
    },
  ): Promise<LibrarySnapshot> {
    return withFileLock(this.filePath, async () => {
      const snapshot = await this.read();
      const game = snapshot.games.find(
        (item) => item.id === gameId && item.source === "local",
      );

      if (!game) {
        throw new Error("No se encontró el juego local");
      }
      game.title = input.title.trim();
      game.installPath = input.executablePath ? path.resolve(input.executablePath) : "";
      game.installed = Boolean(game.installPath);
      game.playtimeMinutes = Math.max(0, Math.round(input.playtimeMinutes));
      game.playtimeSecondsRemainder = 0;
      game.trackedPlaytimeSeconds = game.playtimeMinutes * 60;
      game.steamAppId = input.steamAppId?.trim() || null;
      game.ludusaviGameName = input.ludusaviGameName?.trim() || null;
      game.updatedAt = new Date().toISOString();
      snapshot.games.sort((a, b) => a.title.localeCompare(b.title));
      await this.write(snapshot);
      return snapshot;
    });
  }

  async updateLocalGames(
    updates: Array<{
      gameId: string;
      input: {
        title: string;
        executablePath: string;
        playtimeMinutes: number;
        steamAppId?: string | null;
        ludusaviGameName?: string | null;
      };
    }>,
  ): Promise<LibrarySnapshot> {
    return withFileLock(this.filePath, async () => {
      if (!updates.length) {
        return this.read();
      }

      const snapshot = await this.read();
      const byId = new Map(snapshot.games.map((game) => [game.id, game]));

      for (const { gameId, input } of updates) {
        const game = byId.get(gameId);

        if (!game || game.source !== "local") {
          continue;
        }
        game.title = input.title.trim();
        game.installPath = input.executablePath
          ? path.resolve(input.executablePath)
          : "";
        game.installed = Boolean(game.installPath);
        game.playtimeMinutes = Math.max(0, Math.round(input.playtimeMinutes));
        game.playtimeSecondsRemainder = 0;
        game.trackedPlaytimeSeconds = game.playtimeMinutes * 60;
        game.steamAppId = input.steamAppId?.trim() || null;
        game.ludusaviGameName = input.ludusaviGameName?.trim() || null;
        game.updatedAt = new Date().toISOString();
      }
      snapshot.games.sort((a, b) => a.title.localeCompare(b.title));
      await this.write(snapshot);
      return snapshot;
    });
  }

  async setCover(gameId: string, coverPath: string | null): Promise<LibrarySnapshot> {
    return withFileLock(this.filePath, async () => {
      const snapshot = await this.read();
      const game = snapshot.games.find((item) => item.id === gameId);

      if (game) {
        game.coverPath = coverPath;
        game.updatedAt = new Date().toISOString();
      }
      await this.write(snapshot);
      return snapshot;
    });
  }

  async setAchievementStateId(
    gameId: string,
    achievementStateId: string,
  ): Promise<LibrarySnapshot> {
    return withFileLock(this.filePath, async () => {
      if (!/^\d+$/.test(achievementStateId)) {
        return this.read();
      }

      const snapshot = await this.read();
      const game = snapshot.games.find(
        (item) => item.id === gameId && item.source === "local",
      );

      if (game && game.achievementStateId !== achievementStateId) {
        game.achievementStateId = achievementStateId;
        game.updatedAt = new Date().toISOString();
        await this.write(snapshot);
      }
      return snapshot;
    });
  }

  async setCollectionState(
    gameId: string,
    state: {
      favorite?: boolean;
      backlogStatus?: "pending" | "playing" | "finished" | null;
    },
  ): Promise<LibrarySnapshot> {
    return withFileLock(this.filePath, async () => {
      const snapshot = await this.read();
      const game = snapshot.games.find((item) => item.id === gameId);

      if (!game) {
        throw new Error("No se encontró el juego");
      }
      if (state.favorite !== undefined) {
        game.favorite = state.favorite;
      }
      if (state.backlogStatus !== undefined) {
        game.backlogStatus = state.backlogStatus;
      }
      game.updatedAt = new Date().toISOString();
      await this.write(snapshot);
      return snapshot;
    });
  }

  async hideFromLibrary(gameId: string): Promise<LibrarySnapshot> {
    return withFileLock(this.filePath, async () => {
      const snapshot = await this.read();
      const game = snapshot.games.find((item) => item.id === gameId);

      if (game) {
        game.hiddenFromLibrary = true;
        game.updatedAt = new Date().toISOString();
      }
      await this.write(snapshot);
      return snapshot;
    });
  }

  async deleteForever(gameId: string): Promise<LibrarySnapshot> {
    return withFileLock(this.filePath, async () => {
      const snapshot = await this.read();
      const game = snapshot.games.find((item) => item.id === gameId);

      if (!game) {
        throw new Error("No se encontró el juego");
      }

      const excludedGameKey = `${game.source}:${game.sourceId}`;
      snapshot.games = snapshot.games.filter((item) => item.id !== gameId);
      snapshot.sessions = snapshot.sessions.filter(
        (session) => session.gameId !== gameId,
      );
      snapshot.excludedGameKeys = [
        ...new Set([...(snapshot.excludedGameKeys ?? []), excludedGameKey]),
      ];
      await this.write(snapshot);
      return snapshot;
    });
  }

  async createSafetyBackup(label: string): Promise<string | null> {
    return withFileLock(this.filePath, async () => {
      const info = await fs.promises
        .lstat(this.filePath)
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") {
            return null;
          }
          throw error;
        });

      if (!info) {
        return null;
      }
      if (!info.isFile() || info.isSymbolicLink()) {
        throw new Error("No se crea una copia de seguridad de una ruta no regular");
      }

      const safeLabel = label.replace(/[^a-z0-9-]/gi, "-");
      const backupPath = `${this.filePath}.${safeLabel}-${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
      await fs.promises.copyFile(this.filePath, backupPath, fs.constants.COPYFILE_EXCL);
      return backupPath;
    });
  }

  async importPortableSnapshot(remote: LibrarySnapshot): Promise<LibrarySnapshot> {
    return withFileLock(this.filePath, async () => {
      for (const game of remote.games) {
        if (
          game.source === "steam" &&
          (!isValidSteamAppId(game.sourceId) ||
            (game.steamAppId != null && game.steamAppId !== game.sourceId))
        ) {
          throw new Error("El juego Steam importado no contiene un AppID coherente");
        }
      }

      const current = await this.read();
      const currentGameIds = new Set(current.games.map((game) => game.id));

      if (current.sessions.some((session) => !currentGameIds.has(session.gameId))) {
        throw new Error(
          "La biblioteca local contiene sesiones sin juego; importación cancelada",
        );
      }

      const currentExcludedGameKeys = new Set(current.excludedGameKeys ?? []);
      const remoteExcludedGameKeys = new Set(remote.excludedGameKeys ?? []);
      // Exclusions travel with the merge, but are import filters—not deletion commands.
      const excludedGameKeys = new Set([
        ...currentExcludedGameKeys,
        ...remoteExcludedGameKeys,
      ]);
      const games = new Map(
        current.games.map((game) => [`${game.source}:${game.sourceId}`, { ...game }]),
      );
      const importedIds = new Map<string, string>();

      for (const imported of remote.games) {
        const key = `${imported.source}:${imported.sourceId}`;
        const existing = games.get(key);

        // Either device's exclusion blocks importing this record, but never removes a local one.
        if (currentExcludedGameKeys.has(key) || remoteExcludedGameKeys.has(key)) {
          continue;
        }

        const id = existing?.id ?? randomUUID();
        importedIds.set(imported.id, id);
        games.set(key, {
          ...imported,
          id,
          installPath: existing?.installPath ?? "",
          launchUri:
            existing?.launchUri ??
            (imported.source === "steam"
              ? `steam://rungameid/${imported.sourceId}`
              : null),
          coverPath: existing?.coverPath ?? imported.coverPath ?? null,
          installed: existing?.installed ?? false,
          hiddenFromLibrary:
            existing?.hiddenFromLibrary ?? imported.hiddenFromLibrary ?? false,
          playtimeMinutes: Math.max(
            existing?.playtimeMinutes ?? 0,
            imported.playtimeMinutes,
          ),
          trackedPlaytimeSeconds: Math.max(
            existing?.trackedPlaytimeSeconds ?? 0,
            imported.trackedPlaytimeSeconds,
          ),
          playtimeSecondsRemainder:
            existing?.playtimeSecondsRemainder ?? imported.playtimeSecondsRemainder,
          // Local preferences win on identity matches; importing another device must not
          // silently replace a user's collection state.
          favorite: existing?.favorite ?? imported.favorite ?? false,
          backlogStatus: existing?.backlogStatus ?? imported.backlogStatus ?? null,
          lastPlayedAt:
            [existing?.lastPlayedAt, imported.lastPlayedAt]
              .filter((value): value is string => Boolean(value))
              .sort()
              .at(-1) ?? null,
          updatedAt: new Date().toISOString(),
        });
      }

      const retainedIds = new Set([...games.values()].map((game) => game.id));
      const sessions = new Map(
        current.sessions.map((session) => [session.id, { ...session }]),
      );
      const sessionKey = (session: LibrarySnapshot["sessions"][number]) =>
        [
          session.gameId,
          session.startedAt,
          session.endedAt,
          session.durationSeconds,
          session.origin ?? "launcher",
        ].join("\0");
      const knownSessions = new Set(current.sessions.map(sessionKey));

      for (const session of remote.sessions) {
        const gameId = importedIds.get(session.gameId);

        if (!gameId || !retainedIds.has(gameId)) {
          continue;
        }

        const merged = { ...session, gameId };
        const key = sessionKey(merged);

        if (knownSessions.has(key)) {
          continue;
        }

        const id = sessions.has(session.id) ? randomUUID() : session.id;
        sessions.set(id, { ...merged, id });
        knownSessions.add(key);
      }

      const next: LibrarySnapshot = {
        version: 1,
        games: [...games.values()].sort((a, b) => a.title.localeCompare(b.title)),
        sessions: [...sessions.values()].sort((a, b) =>
          a.startedAt.localeCompare(b.startedAt),
        ),
        excludedGameKeys: [...excludedGameKeys],
      };
      await this.write(next);
      return next;
    });
  }

  async repairOrphanSessions(
    decisions: Array<{ sessionId: string; gameId: string | null }>,
  ): Promise<{
    snapshot: LibrarySnapshot;
    repairedCount: number;
    discardedCount: number;
  }> {
    return withFileLock(this.filePath, async () => {
      const snapshot = await this.read();
      const gameIds = new Set(snapshot.games.map((game) => game.id));
      const orphans = new Map(
        snapshot.sessions
          .filter((session) => !gameIds.has(session.gameId))
          .map((session) => [session.id, session]),
      );
      const selected = new Set<string>();

      for (const decision of decisions) {
        if (selected.has(decision.sessionId) || !orphans.has(decision.sessionId)) {
          throw new Error(
            "La sesión huérfana cambió; vuelve a diagnosticar antes de reparar",
          );
        }
        if (decision.gameId !== null && !gameIds.has(decision.gameId)) {
          throw new Error("El juego elegido para reparar la sesión ya no existe");
        }
        selected.add(decision.sessionId);
      }
      if (!decisions.length) {
        throw new Error("Selecciona al menos una decisión explícita");
      }

      let repairedCount = 0;
      let discardedCount = 0;
      const repaired = new Map(
        decisions.map((decision) => [decision.sessionId, decision]),
      );
      snapshot.sessions = snapshot.sessions.flatMap((session) => {
        const decision = repaired.get(session.id);

        if (!decision) {
          return [session];
        }
        if (decision.gameId === null) {
          discardedCount += 1;
          return [];
        }
        repairedCount += 1;
        return [{ ...session, gameId: decision.gameId }];
      });
      await this.write(snapshot);
      return { snapshot, repairedCount, discardedCount };
    });
  }

  async mergeRemoteManual(remote: LibrarySnapshot): Promise<LibrarySnapshot> {
    return withFileLock(this.filePath, async () => {
      const snapshot = await this.read();
      const excludedGameKeys = new Set([
        ...(snapshot.excludedGameKeys ?? []),
        ...(remote.excludedGameKeys ?? []),
      ]);
      const games = new Map(
        snapshot.games.map((game) => [`${game.source}:${game.sourceId}`, game]),
      );

      for (const remoteGame of remote.games.filter((game) => game.source === "local")) {
        const key = `local:${remoteGame.sourceId}`;

        if (excludedGameKeys.has(key)) {
          games.delete(key);
          continue;
        }

        const localGame = games.get(key);
        const localUpdatedAt = localGame?.updatedAt ?? localGame?.importedAt ?? "";
        const remoteUpdatedAt = remoteGame.updatedAt ?? remoteGame.importedAt;
        const metadata =
          !localGame || remoteUpdatedAt > localUpdatedAt ? remoteGame : localGame;
        games.set(key, {
          ...metadata,
          id: localGame?.id ?? remoteGame.id,
          installPath: localGame?.installPath ?? "",
          launchUri: null,
          coverPath: localGame?.coverPath ?? null,
          playtimeMinutes: Math.max(
            localGame?.playtimeMinutes ?? 0,
            remoteGame.playtimeMinutes,
          ),
          trackedPlaytimeSeconds: Math.max(
            localGame?.trackedPlaytimeSeconds ?? 0,
            remoteGame.trackedPlaytimeSeconds,
          ),
          installed: Boolean(localGame?.installPath),
          updatedAt: [localUpdatedAt, remoteUpdatedAt].sort().at(-1),
          lastPlayedAt:
            [localGame?.lastPlayedAt, remoteGame.lastPlayedAt]
              .filter((value): value is string => Boolean(value))
              .sort()
              .at(-1) ?? null,
        });
      }

      for (const excludedGameKey of excludedGameKeys) {
        games.delete(excludedGameKey);
      }

      const retainedGameIds = new Set([...games.values()].map((game) => game.id));
      const sessions = new Map(
        snapshot.sessions
          .filter((session) => retainedGameIds.has(session.gameId))
          .map((session) => [session.id, session]),
      );
      remote.sessions.forEach((session) => {
        if (retainedGameIds.has(session.gameId) && !sessions.has(session.id)) {
          sessions.set(session.id, session);
        }
      });
      const next = {
        version: 1 as const,
        games: [...games.values()].sort((a, b) => a.title.localeCompare(b.title)),
        sessions: [...sessions.values()].sort((a, b) =>
          a.startedAt.localeCompare(b.startedAt),
        ),
        excludedGameKeys: [...excludedGameKeys],
      };
      await this.write(next);
      return next;
    });
  }

  async exportManualHistory(): Promise<LibrarySnapshot> {
    const snapshot = await this.read();
    const manualGames = snapshot.games
      .filter((game) => game.source === "local")
      .map((game) => ({
        ...game,
        installPath: "",
        launchUri: null,
        installed: false,
        coverPath: null,
      }));
    const ids = new Set(manualGames.map((game) => game.id));
    return {
      version: 1,
      games: manualGames,
      sessions: snapshot.sessions.filter((session) => ids.has(session.gameId)),
      excludedGameKeys: snapshot.excludedGameKeys ?? [],
    };
  }

  async setRemoteArtwork(
    gameId: string,
    artwork: { coverUrl: string; heroUrl: string; steamAppId?: string | null },
  ): Promise<LibrarySnapshot> {
    return withFileLock(this.filePath, async () => {
      const snapshot = await this.read();
      const game = snapshot.games.find((item) => item.id === gameId);

      if (game) {
        game.coverPath = null;
        game.coverUrl = artwork.coverUrl;
        game.heroUrl = artwork.heroUrl;
        if (game.source === "local" && artwork.steamAppId) {
          game.steamAppId = artwork.steamAppId;
        }
        game.updatedAt = new Date().toISOString();
      }
      await this.write(snapshot);
      return snapshot;
    });
  }

  async addPlaytime(gameId: string, elapsedSeconds: number): Promise<LibrarySnapshot> {
    return withFileLock(this.filePath, async () => {
      const snapshot = await this.read();
      const game = snapshot.games.find((item) => item.id === gameId);

      if (game) {
        const durationSeconds = Math.max(0, elapsedSeconds);
        const totalSeconds = (game.playtimeSecondsRemainder ?? 0) + durationSeconds;
        game.playtimeMinutes += Math.floor(totalSeconds / 60);
        game.playtimeSecondsRemainder = totalSeconds % 60;
        game.trackedPlaytimeSeconds =
          (game.trackedPlaytimeSeconds ?? 0) + durationSeconds;
        game.lastPlayedAt = new Date().toISOString();
        game.updatedAt = game.lastPlayedAt;
        snapshot.sessions.push({
          id: randomUUID(),
          gameId,
          startedAt: new Date(Date.now() - durationSeconds * 1_000).toISOString(),
          endedAt: new Date().toISOString(),
          durationSeconds,
          origin: "launcher",
        });
      }
      await this.write(snapshot);
      return snapshot;
    });
  }

  private async write(snapshot: LibrarySnapshot): Promise<void> {
    if (await writeJsonAtomically(this.filePath, snapshot)) {
      libraryCache.delete(path.resolve(this.filePath));
    }
    snapshotRevisions.set(snapshot, ++nextSnapshotRevision);
  }
}
