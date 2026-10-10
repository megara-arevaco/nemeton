import type { LibrarySnapshot, LibraryStore } from "@launcher/core";
import type { AchievementService } from "./achievements.js";
import type { FolderSyncService } from "./folder-sync.js";
import type { LudusaviCatalog } from "./ludusavi.js";
import type { SavegameManager } from "./savegames.js";
import type { SettingsStore } from "./settings.js";
import type { SteamSyncService } from "./steam-sync.js";
export interface MainContext {
  awaitStartupRecovery: () => Promise<void>;
  awaitStartupReady: () => Promise<void>;
  achievementService: AchievementService;
  autoSync: () => Promise<void>;
  broadcastGameRunning: (gameId: string, running: boolean) => void;
  broadcastSavegameChanged: (gameId: string) => void;
  broadcastLibrary: (snapshot?: LibrarySnapshot) => Promise<void>;
  publishLibrarySnapshot: (snapshot: LibrarySnapshot) => LibrarySnapshot;
  coversDirectory: string;
  folderSyncService: FolderSyncService;
  ludusaviCatalog: LudusaviCatalog;
  reportSlowOperation: <T>(name: string, operation: () => Promise<T>) => Promise<T>;
  savegameManager: SavegameManager;
  scheduleAutoSync: () => void;
  scheduleSteamRefresh: (delayMs?: number) => void;
  settingsStore: SettingsStore;
  steamSyncService: SteamSyncService;
  store: LibraryStore;
  watchSteamSession: (gameId: string, installPath: string) => Promise<void>;
}
