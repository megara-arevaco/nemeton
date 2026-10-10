import type {
  SavegameVerification,
  SavegameState,
  SavegamePolicy,
  SavegameVersion,
  SavegameVersionIntegrity,
} from "../shared/savegames.js";
import type { LibraryChange, PublishedLibrary } from "../shared/library-updates.js";
import type { IpcArgs, IpcChannel } from "../shared/ipc-contracts.js";
import { contextBridge, ipcRenderer } from "electron";
import type {
  ArtworkSuggestion,
  FolderSyncSettings,
  GameAchievements,
  GameMetadata,
  LibrarySnapshot,
  SteamAccountSettings,
} from "@launcher/core";

const measuredChannels = new Set<string>([
  "library:list",
  "library:metadata",
  "library:achievements",
  "library:launch",
  "savegames:get",
  "savegames:verify",
]);

const invoke = async <K extends IpcChannel>(channel: K, ...args: IpcArgs<K>) => {
  const started = performance.now();

  try {
    return await ipcRenderer.invoke(channel, ...args);
  } finally {
    if (measuredChannels.has(channel)) {
      void ipcRenderer
        .invoke("performance:record", channel, performance.now() - started)
        .catch(() => undefined);
    }
  }
};

const api = {
  recordPerformance: (
    name: "ui:library-ready" | "ui:game-ready",
    elapsedMs: number,
  ): Promise<void> => invoke("performance:record", name, elapsedMs),
  minimizeWindow: (): Promise<void> => invoke("window:minimize"),
  toggleMaximizeWindow: (): Promise<void> => invoke("window:toggle-maximize"),
  closeWindow: (): Promise<void> => invoke("window:close"),
  listGames: (): Promise<PublishedLibrary> => invoke("library:list"),
  getWorkspaceStatus: (): Promise<{ branch: string | null; version: string }> =>
    invoke("workspace:status"),
  getGameMetadata: (gameId: string): Promise<GameMetadata | null> =>
    invoke("library:metadata", gameId),
  getSteamSettings: (): Promise<SteamAccountSettings> => invoke("steam:settings"),
  getSyncSettings: (): Promise<FolderSyncSettings> => invoke("sync:settings"),
  getDataLocation: (): Promise<{ portable: boolean; dataDirectory: string }> =>
    invoke("runtime:data-location"),
  exportPortableData: (options: {
    language: "es" | "en";
    accentTheme: "forest" | "aurora" | "ember" | "amethyst" | "glacier";
    format: "json" | "package";
    includeArtwork: boolean;
    includeBackups: boolean;
  }): Promise<{ gameCount: number; assetCount: number; backupCount: number } | null> =>
    invoke("data:export", options),
  importPortableData: (
    language: "es" | "en",
  ): Promise<{
    gameCount: number;
    preferences: {
      language: "es" | "en";
      accentTheme: "forest" | "aurora" | "ember" | "amethyst" | "glacier";
    };
    libraryBackup: string | null;
    savegameBackup: string | null;
    achievementBackup: string | null;
    assetCount: number;
    backupCount: number;
  } | null> => invoke("data:import", language),
  listImportBackups: (): Promise<
    Array<{
      category: "library" | "savegames" | "achievements";
      fileName: string;
      createdAt: string;
      reason: "before-import" | "before-session-repair" | "before-recovery";
    }>
  > => invoke("data:list-import-backups"),
  restoreImportBackup: (
    category: "library" | "savegames" | "achievements",
    fileName: string,
    language: "es" | "en",
  ): Promise<{ safetyCopy: string | null } | null> =>
    invoke("data:restore-import-backup", category, fileName, language),
  getSessionDiagnostics: (): Promise<{
    orphanCount: number;
    sessions: Array<{
      id: string;
      gameId: string;
      startedAt: string;
      endedAt: string;
      durationSeconds: number;
    }>;
    games: Array<{ id: string; title: string }>;
  }> => invoke("data:session-diagnostics"),
  repairOrphanSessions: (
    decisions: Array<{ sessionId: string; gameId: string | null }>,
    language: "es" | "en",
  ): Promise<{
    repairedCount: number;
    discardedCount: number;
    safetyCopy: string | null;
  }> => invoke("data:repair-sessions", decisions, language),
  selectSyncFolder: (): Promise<{
    snapshot: LibrarySnapshot;
    settings: FolderSyncSettings;
  } | null> => invoke("sync:select-folder"),
  syncNow: (): Promise<{ snapshot: LibrarySnapshot; settings: FolderSyncSettings }> =>
    invoke("sync:now"),
  getSavegames: (gameId: string): Promise<SavegameState> =>
    invoke("savegames:get", gameId),
  discoverSavegames: (gameId: string): Promise<SavegameState> =>
    invoke("savegames:discover", gameId),
  verifySavegames: (gameId: string): Promise<SavegameVerification> =>
    invoke("savegames:verify", gameId),
  verifySavegameVersion: (
    gameId: string,
    versionId: string,
  ): Promise<SavegameVersionIntegrity> =>
    invoke("savegames:verify-version", gameId, versionId),
  setSavegamePolicy: (
    gameId: string,
    policy: Partial<SavegamePolicy>,
  ): Promise<SavegamePolicy> => invoke("savegames:set-policy", gameId, policy),
  addSavegameFolder: (gameId: string): Promise<string[] | null> =>
    invoke("savegames:add-folder", gameId),
  addSuggestedSavegameFolder: (gameId: string, folderPath: string): Promise<string[]> =>
    invoke("savegames:add-suggested", gameId, folderPath),
  removeSavegameFolder: (gameId: string, folderPath: string): Promise<string[]> =>
    invoke("savegames:remove-folder", gameId, folderPath),
  backupSavegames: (gameId: string): Promise<SavegameVersion[]> =>
    invoke("savegames:backup", gameId),
  setSavegamePinned: (
    gameId: string,
    versionId: string,
    pinned: boolean,
  ): Promise<SavegameVersion[]> =>
    invoke("savegames:set-pinned", gameId, versionId, pinned),
  restoreSavegames: (
    gameId: string,
    versionId: string,
  ): Promise<{ restoredFiles: number } | null> =>
    invoke("savegames:restore", gameId, versionId),
  connectSteam: (
    apiKey: string,
    steamId?: string,
  ): Promise<{
    settings: SteamAccountSettings;
    snapshot: LibrarySnapshot;
    ownedCount: number;
  }> => invoke("steam:connect", apiKey, steamId),
  refreshSteamAccount: (): Promise<{ snapshot: LibrarySnapshot; ownedCount: number }> =>
    invoke("steam:refresh-account"),
  getAchievements: (gameId: string): Promise<GameAchievements> =>
    invoke("library:achievements", gameId),
  scanSteam: (): Promise<LibrarySnapshot> => invoke("library:scan-steam"),
  selectExecutable: (): Promise<{ path: string; suggestedTitle: string } | null> =>
    invoke("dialog:select-executable"),
  selectArtwork: (): Promise<{
    path: string;
    name: string;
    previewUrl: string;
  } | null> => invoke("dialog:select-artwork"),
  searchArtwork: (query: string): Promise<ArtworkSuggestion[]> =>
    invoke("artwork:search", query),
  searchLudusavi: (
    query: string,
  ): Promise<
    Array<{
      name: string;
      steamAppId: string | null;
      files: Array<{ path: string; tags: string[] }>;
    }>
  > => invoke("ludusavi:search", query),
  autoAssociateLudusavi: (): Promise<{ snapshot: LibrarySnapshot; count: number }> =>
    invoke("ludusavi:auto-associate"),
  setRemoteArtwork: (
    gameId: string,
    artwork: ArtworkSuggestion,
  ): Promise<LibrarySnapshot> => invoke("library:set-remote-artwork", gameId, artwork),
  addLocalGame: (input: {
    title: string;
    executablePath: string;
    artworkPath?: string | null;
    coverUrl?: string | null;
    heroUrl?: string | null;
    steamAppId?: string | null;
    ludusaviGameName?: string | null;
  }): Promise<LibrarySnapshot> => invoke("library:add-local", input),
  updateLocalGame: (
    gameId: string,
    input: {
      title: string;
      executablePath: string;
      playtimeMinutes: number;
      steamAppId?: string | null;
      ludusaviGameName?: string | null;
    },
  ): Promise<LibrarySnapshot> => invoke("library:update-local", gameId, input),
  setCover: (gameId: string): Promise<LibrarySnapshot | null> =>
    invoke("library:set-cover", gameId),
  setGameCollectionState: (
    gameId: string,
    state: {
      favorite?: boolean;
      backlogStatus?: "pending" | "playing" | "finished" | null;
    },
  ): Promise<LibrarySnapshot> => invoke("library:set-collection-state", gameId, state),
  uninstallOrHide: (gameId: string): Promise<LibrarySnapshot> =>
    invoke("library:uninstall-or-hide", gameId),
  deleteGameForever: (gameId: string, confirmation: string): Promise<LibrarySnapshot> =>
    invoke("library:delete-forever", gameId, confirmation),
  launchGame: (gameId: string): Promise<void> => invoke("library:launch", gameId),
  onLibraryChanged: (callback: (snapshot: LibraryChange) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: LibraryChange) =>
      callback(snapshot);
    ipcRenderer.on("library:changed", listener);
    return () => ipcRenderer.removeListener("library:changed", listener);
  },
  onSavegamesChanged: (callback: (gameId: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, gameId: string) =>
      callback(gameId);
    ipcRenderer.on("savegames:changed", listener);
    return () => ipcRenderer.removeListener("savegames:changed", listener);
  },
  onGameRunningChanged: (
    callback: (state: { gameId: string; running: boolean }) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: { gameId: string; running: boolean },
    ) => callback(state);
    ipcRenderer.on("game:running-changed", listener);
    return () => ipcRenderer.removeListener("game:running-changed", listener);
  },
};

contextBridge.exposeInMainWorld("launcher", api);
export type LauncherApi = typeof api;
