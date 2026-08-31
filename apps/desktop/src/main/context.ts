import type { LibraryStore } from "@launcher/core";
import type { AchievementService } from "./achievements.js";
import type { FolderSyncService } from "./folder-sync.js";
import type { LudusaviCatalog } from "./ludusavi.js";
import type { SavegameManager } from "./savegames.js";
import type { SettingsStore } from "./settings.js";
export interface MainContext {
  achievementService: AchievementService;
  autoSync: () => Promise<void>;
  broadcastGameRunning: (gameId: string, running: boolean) => void;
  broadcastLibrary: () => Promise<void>;
  coversDirectory: string;
  folderSyncService: FolderSyncService;
  ludusaviCatalog: LudusaviCatalog;
  reportSlowOperation: <T>(name: string, operation: () => Promise<T>) => Promise<T>;
  savegameManager: SavegameManager;
  scheduleAutoSync: () => void;
  settingsStore: SettingsStore;
  store: LibraryStore;
  watchSteamSession: (gameId: string, installPath: string) => Promise<void>;
}
