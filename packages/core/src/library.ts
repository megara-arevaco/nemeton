import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { LibraryGame, LibrarySnapshot, LocalGameInput, SteamCandidate, SteamOwnedGame } from "./types.js";

const emptySnapshot = (): LibrarySnapshot => ({ version: 1, games: [], sessions: [] });
const excludedSteamAppIds = new Set(["228980"]);

export class LibraryStore {
  constructor(private readonly filePath: string) {}

  async read(): Promise<LibrarySnapshot> {
    const raw = await fs.promises.readFile(this.filePath, "utf8").catch(() => null);
    if (!raw) return emptySnapshot();
    try {
      const parsed = JSON.parse(raw) as LibrarySnapshot;
      if (parsed.version !== 1 || !Array.isArray(parsed.games)) return emptySnapshot();
      return {
        ...parsed,
        sessions: parsed.sessions ?? [],
        games: parsed.games.filter((game) => game.source !== "steam" || !excludedSteamAppIds.has(game.sourceId)).map((game) => ({
          ...game,
          coverPath: game.coverPath ?? null,
          coverUrl:
            game.coverUrl ??
            (game.source === "steam"
              ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.sourceId}/library_600x900_2x.jpg`
              : null),
          heroUrl:
            game.heroUrl ??
            (game.source === "steam"
              ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.sourceId}/library_hero.jpg`
              : null),
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
    } catch {
      return emptySnapshot();
    }
  }

  async importSteam(candidates: SteamCandidate[]): Promise<LibrarySnapshot> {
    const snapshot = await this.read();
    const games = new Map(snapshot.games.map((game) => [`${game.source}:${game.sourceId}`, game]));
    for (const candidate of candidates) {
      if (excludedSteamAppIds.has(candidate.appId)) continue;
      const key = `steam:${candidate.appId}`;
      const previous = games.get(key);
      const previousPlatformMinutes = previous?.platformPlaytimeMinutes ?? previous?.playtimeMinutes;
      if (previous && previousPlatformMinutes !== undefined && candidate.playtimeMinutes > previousPlatformMinutes) {
        const durationSeconds = (candidate.playtimeMinutes - previousPlatformMinutes) * 60;
        const endedAt = candidate.lastPlayedAt ?? new Date().toISOString();
        snapshot.sessions.push({ id: randomUUID(), gameId: previous.id, startedAt: new Date(new Date(endedAt).getTime() - durationSeconds * 1_000).toISOString(), endedAt, durationSeconds, origin: "steam-sync" });
      }
      const game: LibraryGame = {
        id: previous?.id ?? randomUUID(),
        source: "steam",
        sourceId: candidate.appId,
        title: candidate.title,
        installPath: candidate.installPath,
        launchUri: `steam://rungameid/${candidate.appId}`,
        coverPath: previous?.coverPath ?? null,
        coverUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${candidate.appId}/library_600x900_2x.jpg`,
        heroUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${candidate.appId}/library_hero.jpg`,
        playtimeMinutes: Math.max(previous?.playtimeMinutes ?? 0, candidate.playtimeMinutes),
        playtimeSecondsRemainder: previous?.playtimeSecondsRemainder ?? 0,
        platformPlaytimeMinutes: Math.max(
          previous?.platformPlaytimeMinutes ?? 0,
          candidate.playtimeMinutes
        ),
        trackedPlaytimeSeconds: previous?.trackedPlaytimeSeconds ?? 0,
        installed: true,
        hiddenFromLibrary: previous?.hiddenFromLibrary ?? false,
        lastPlayedAt: candidate.lastPlayedAt ?? previous?.lastPlayedAt ?? null,
        importedAt: previous?.importedAt ?? new Date().toISOString(),
        updatedAt: previous?.updatedAt ?? previous?.importedAt ?? new Date().toISOString(),
      };
      games.set(key, game);
    }
    const next: LibrarySnapshot = {
      version: 1,
      games: [...games.values()].sort((a, b) => a.title.localeCompare(b.title)),
      sessions: snapshot.sessions,
    };
    await this.write(next);
    return next;
  }

  async importSteamAccount(ownedGames: SteamOwnedGame[]): Promise<LibrarySnapshot> {
    const snapshot = await this.read();
    const games = new Map(snapshot.games.map((game) => [`${game.source}:${game.sourceId}`, game]));
    for (const owned of ownedGames) {
      if (excludedSteamAppIds.has(owned.appId)) continue;
      const key = `steam:${owned.appId}`;
      const previous = games.get(key);
      const previousPlatformMinutes = previous?.platformPlaytimeMinutes ?? previous?.playtimeMinutes;
      if (previous && previousPlatformMinutes !== undefined && owned.playtimeMinutes > previousPlatformMinutes) {
        const durationSeconds = (owned.playtimeMinutes - previousPlatformMinutes) * 60;
        const endedAt = owned.lastPlayedAt ?? new Date().toISOString();
        snapshot.sessions.push({ id: randomUUID(), gameId: previous.id, startedAt: new Date(new Date(endedAt).getTime() - durationSeconds * 1_000).toISOString(), endedAt, durationSeconds, origin: "steam-sync" });
      }
      games.set(key, {
        id: previous?.id ?? randomUUID(),
        source: "steam",
        sourceId: owned.appId,
        title: owned.title,
        installPath: previous?.installPath ?? "",
        launchUri: `steam://rungameid/${owned.appId}`,
        coverPath: previous?.coverPath ?? null,
        coverUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${owned.appId}/library_600x900_2x.jpg`,
        heroUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${owned.appId}/library_hero.jpg`,
        playtimeMinutes: owned.playtimeMinutes,
        playtimeSecondsRemainder: previous?.playtimeSecondsRemainder ?? 0,
        platformPlaytimeMinutes: owned.playtimeMinutes,
        trackedPlaytimeSeconds: previous?.trackedPlaytimeSeconds ?? 0,
        lastPlayedAt: owned.lastPlayedAt ?? previous?.lastPlayedAt ?? null,
        importedAt: previous?.importedAt ?? new Date().toISOString(),
        updatedAt: previous?.updatedAt ?? previous?.importedAt ?? new Date().toISOString(),
        installed: previous?.installed ?? false,
        hiddenFromLibrary: previous?.hiddenFromLibrary ?? false,
      });
    }
    const next = { ...snapshot, games: [...games.values()].sort((a, b) => a.title.localeCompare(b.title)) };
    await this.write(next);
    return next;
  }

  async addLocal(input: LocalGameInput): Promise<LibrarySnapshot> {
    const snapshot = await this.read();
    const normalizedPath = input.executablePath ? path.resolve(input.executablePath) : "";
    const previous = normalizedPath
      ? snapshot.games.find(
          (game) => game.source === "local" && game.installPath && path.resolve(game.installPath) === normalizedPath
        )
      : undefined;
    if (!previous) {
      const now = new Date().toISOString();
      snapshot.games.push({
        id: randomUUID(),
        source: "local",
        sourceId: randomUUID(),
        steamAppId: input.steamAppId ?? null,
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
        lastPlayedAt: null,
        importedAt: now,
        updatedAt: now,
      });
    }
    snapshot.games.sort((a, b) => a.title.localeCompare(b.title));
    await this.write(snapshot);
    return snapshot;
  }

  async updateLocalGame(
    gameId: string,
    input: { title: string; executablePath: string; playtimeMinutes: number; steamAppId?: string | null; ludusaviGameName?: string | null }
  ): Promise<LibrarySnapshot> {
    const snapshot = await this.read();
    const game = snapshot.games.find((item) => item.id === gameId && item.source === "local");
    if (!game) throw new Error("No se encontró el juego local");
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
  }

  async setCover(gameId: string, coverPath: string | null): Promise<LibrarySnapshot> {
    const snapshot = await this.read();
    const game = snapshot.games.find((item) => item.id === gameId);
    if (game) { game.coverPath = coverPath; game.updatedAt = new Date().toISOString(); }
    await this.write(snapshot);
    return snapshot;
  }

  async hideFromLibrary(gameId: string): Promise<LibrarySnapshot> {
    const snapshot = await this.read();
    const game = snapshot.games.find((item) => item.id === gameId);
    if (game) { game.hiddenFromLibrary = true; game.updatedAt = new Date().toISOString(); }
    await this.write(snapshot);
    return snapshot;
  }

  async mergeRemoteManual(remote: LibrarySnapshot): Promise<LibrarySnapshot> {
    const snapshot = await this.read();
    const games = new Map(snapshot.games.map((game) => [`${game.source}:${game.sourceId}`, game]));
    for (const remoteGame of remote.games.filter((game) => game.source === "local")) {
      const key = `local:${remoteGame.sourceId}`;
      const localGame = games.get(key);
      const localUpdatedAt = localGame?.updatedAt ?? localGame?.importedAt ?? "";
      const remoteUpdatedAt = remoteGame.updatedAt ?? remoteGame.importedAt;
      const metadata = !localGame || remoteUpdatedAt > localUpdatedAt ? remoteGame : localGame;
      games.set(key, {
        ...metadata,
        id: localGame?.id ?? remoteGame.id,
        installPath: localGame?.installPath ?? "",
        launchUri: null,
        coverPath: localGame?.coverPath ?? null,
        playtimeMinutes: Math.max(localGame?.playtimeMinutes ?? 0, remoteGame.playtimeMinutes),
        trackedPlaytimeSeconds: Math.max(localGame?.trackedPlaytimeSeconds ?? 0, remoteGame.trackedPlaytimeSeconds),
        installed: Boolean(localGame?.installPath),
        updatedAt: [localUpdatedAt, remoteUpdatedAt].sort().at(-1),
        lastPlayedAt: [localGame?.lastPlayedAt, remoteGame.lastPlayedAt].filter((value): value is string => Boolean(value)).sort().at(-1) ?? null,
      });
    }
    const sessions = new Map(snapshot.sessions.map((session) => [session.id, session]));
    remote.sessions.forEach((session) => { if (!sessions.has(session.id)) sessions.set(session.id, session); });
    const next = { version: 1 as const, games: [...games.values()].sort((a, b) => a.title.localeCompare(b.title)), sessions: [...sessions.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt)) };
    await this.write(next);
    return next;
  }

  async exportManualHistory(): Promise<LibrarySnapshot> {
    const snapshot = await this.read();
    const manualGames = snapshot.games.filter((game) => game.source === "local").map((game) => ({ ...game, installPath: "", launchUri: null, installed: false, coverPath: null }));
    const ids = new Set(manualGames.map((game) => game.id));
    return { version: 1, games: manualGames, sessions: snapshot.sessions.filter((session) => ids.has(session.gameId)) };
  }

  async setRemoteArtwork(
    gameId: string,
    artwork: { coverUrl: string; heroUrl: string; steamAppId?: string | null }
  ): Promise<LibrarySnapshot> {
    const snapshot = await this.read();
    const game = snapshot.games.find((item) => item.id === gameId);
    if (game) {
      game.coverPath = null;
      game.coverUrl = artwork.coverUrl;
      game.heroUrl = artwork.heroUrl;
      if (game.source === "local" && artwork.steamAppId) game.steamAppId = artwork.steamAppId;
      game.updatedAt = new Date().toISOString();
    }
    await this.write(snapshot);
    return snapshot;
  }

  async addPlaytime(gameId: string, elapsedSeconds: number): Promise<LibrarySnapshot> {
    const snapshot = await this.read();
    const game = snapshot.games.find((item) => item.id === gameId);
    if (game) {
      const durationSeconds = Math.max(0, elapsedSeconds);
      const totalSeconds = (game.playtimeSecondsRemainder ?? 0) + durationSeconds;
      game.playtimeMinutes += Math.floor(totalSeconds / 60);
      game.playtimeSecondsRemainder = totalSeconds % 60;
      game.trackedPlaytimeSeconds = (game.trackedPlaytimeSeconds ?? 0) + durationSeconds;
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
  }

  private async write(snapshot: LibrarySnapshot): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    await fs.promises.writeFile(temporary, JSON.stringify(snapshot, null, 2));
    await fs.promises.rename(temporary, this.filePath);
  }
}
