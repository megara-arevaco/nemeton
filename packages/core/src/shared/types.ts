export type GameSource = "steam" | "local";

export interface LibraryGame {
  id: string;
  source: GameSource;
  sourceId: string;
  steamAppId?: string | null;
  achievementStateId?: string | null;
  ludusaviGameName?: string | null;
  title: string;
  installPath: string;
  launchUri: string | null;
  coverPath: string | null;
  coverUrl: string | null;
  heroUrl: string | null;
  playtimeMinutes: number;
  playtimeSecondsRemainder: number;
  platformPlaytimeMinutes: number | null;
  trackedPlaytimeSeconds: number;
  installed: boolean;
  hiddenFromLibrary?: boolean;
  lastPlayedAt: string | null;
  importedAt: string;
  updatedAt?: string;
}

export interface SteamCandidate {
  appId: string;
  title: string;
  installPath: string;
  libraryPath: string;
  playtimeMinutes: number;
  lastPlayedAt: string | null;
}

export interface LibrarySnapshot {
  version: 1;
  games: LibraryGame[];
  sessions: GameSession[];
  excludedGameKeys?: string[];
}

export interface GameSession {
  id: string;
  gameId: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  origin?: "launcher" | "steam-sync";
}

export interface SteamOwnedGame {
  appId: string;
  title: string;
  playtimeMinutes: number;
  lastPlayedAt: string | null;
}

export interface SteamAccountSettings {
  steamId: string | null;
  hasApiKey: boolean;
}

export interface FolderSyncSettings {
  folderPath: string | null;
  lastSyncedAt: string | null;
  status?: "unconfigured" | "ready" | "missing" | "syncing" | "error";
  error?: string | null;
}

export interface LocalGameInput {
  title: string;
  executablePath: string;
  coverPath?: string | null;
  coverUrl?: string | null;
  heroUrl?: string | null;
  steamAppId?: string | null;
  ludusaviGameName?: string | null;
}

export interface ArtworkSuggestion {
  provider: "steam" | "wikipedia";
  providerId: string;
  title: string;
  coverUrl: string;
  heroUrl: string;
}

export interface GameMetadata {
  appId: string;
  description: string;
  genres: string[];
  developers: string[];
  publishers: string[];
  releaseDate: string | null;
  website: string | null;
}

export interface GameAchievement {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  achieved: boolean;
  unlockedAt: string | null;
  globalPercentage: number | null;
  hidden: boolean;
}

export interface GameAchievements {
  total: number;
  unlocked: number;
  items: GameAchievement[];
  source?: string | null;
  statePath?: string | null;
  status?: "detected" | "missing-app-id" | "no-state" | "parse-error";
}
