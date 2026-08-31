import { contextBridge, ipcRenderer } from "electron";
import type {
  ArtworkSuggestion,
  FolderSyncSettings,
  GameAchievements,
  GameMetadata,
  LibrarySnapshot,
  SteamAccountSettings,
} from "@launcher/core";

const api = {
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: (): Promise<void> =>
    ipcRenderer.invoke("window:toggle-maximize"),
  closeWindow: (): Promise<void> => ipcRenderer.invoke("window:close"),
  listGames: (): Promise<LibrarySnapshot> => ipcRenderer.invoke("library:list"),
  getWorkspaceStatus: (): Promise<{ branch: string | null }> =>
    ipcRenderer.invoke("workspace:status"),
  getGameMetadata: (gameId: string): Promise<GameMetadata | null> =>
    ipcRenderer.invoke("library:metadata", gameId),
  getSteamSettings: (): Promise<SteamAccountSettings> =>
    ipcRenderer.invoke("steam:settings"),
  getSyncSettings: (): Promise<FolderSyncSettings> =>
    ipcRenderer.invoke("sync:settings"),
  selectSyncFolder: (): Promise<{
    snapshot: LibrarySnapshot;
    settings: FolderSyncSettings;
  } | null> => ipcRenderer.invoke("sync:select-folder"),
  syncNow: (): Promise<{ snapshot: LibrarySnapshot; settings: FolderSyncSettings }> =>
    ipcRenderer.invoke("sync:now"),
  getSavegames: (
    gameId: string,
  ): Promise<{
    paths: string[];
    suggestions: Array<{
      path: string;
      confidence: "high" | "medium" | "low";
      reason: string;
    }>;
    versions: Array<{
      id: string;
      createdAt: string;
      deviceId: string;
      deviceName: string;
      sizeBytes: number;
      fileCount: number;
      pinned?: boolean;
    }>;
    policy: {
      autoBackup: boolean;
      backupBeforeLaunch: boolean;
      maxVersions: number;
      maxSizeMb: number;
      excludedNames: string[];
      exactRestore: boolean;
      includeConfig: boolean;
    };
    syncConfigured: boolean;
    syncState:
      | "unconfigured"
      | "path-missing"
      | "not-detected"
      | "waiting-backup"
      | "synced"
      | "conflict"
      | "pending";
    missingPaths: string[];
    conflict: {
      id: string;
      createdAt: string;
      deviceId: string;
      deviceName: string;
      sizeBytes: number;
      fileCount: number;
      pinned?: boolean;
    } | null;
  }> => ipcRenderer.invoke("savegames:get", gameId),
  setSavegamePolicy: (
    gameId: string,
    policy: Partial<{
      autoBackup: boolean;
      backupBeforeLaunch: boolean;
      maxVersions: number;
      maxSizeMb: number;
      excludedNames: string[];
      exactRestore: boolean;
      includeConfig: boolean;
    }>,
  ): Promise<{
    autoBackup: boolean;
    backupBeforeLaunch: boolean;
    maxVersions: number;
    maxSizeMb: number;
    excludedNames: string[];
    exactRestore: boolean;
    includeConfig: boolean;
  }> => ipcRenderer.invoke("savegames:set-policy", gameId, policy),
  addSavegameFolder: (gameId: string): Promise<string[] | null> =>
    ipcRenderer.invoke("savegames:add-folder", gameId),
  addSuggestedSavegameFolder: (gameId: string, folderPath: string): Promise<string[]> =>
    ipcRenderer.invoke("savegames:add-suggested", gameId, folderPath),
  removeSavegameFolder: (gameId: string, folderPath: string): Promise<string[]> =>
    ipcRenderer.invoke("savegames:remove-folder", gameId, folderPath),
  backupSavegames: (
    gameId: string,
  ): Promise<
    Array<{
      id: string;
      createdAt: string;
      deviceId: string;
      deviceName: string;
      sizeBytes: number;
      fileCount: number;
    }>
  > => ipcRenderer.invoke("savegames:backup", gameId),
  setSavegamePinned: (
    gameId: string,
    versionId: string,
    pinned: boolean,
  ): Promise<
    Array<{
      id: string;
      createdAt: string;
      deviceId: string;
      deviceName: string;
      sizeBytes: number;
      fileCount: number;
      pinned?: boolean;
    }>
  > => ipcRenderer.invoke("savegames:set-pinned", gameId, versionId, pinned),
  restoreSavegames: (
    gameId: string,
    versionId: string,
  ): Promise<{ restoredFiles: number } | null> =>
    ipcRenderer.invoke("savegames:restore", gameId, versionId),
  connectSteam: (
    apiKey: string,
    steamId?: string,
  ): Promise<{
    settings: SteamAccountSettings;
    snapshot: LibrarySnapshot;
    ownedCount: number;
  }> => ipcRenderer.invoke("steam:connect", apiKey, steamId),
  refreshSteamAccount: (): Promise<{ snapshot: LibrarySnapshot; ownedCount: number }> =>
    ipcRenderer.invoke("steam:refresh-account"),
  getAchievements: (gameId: string): Promise<GameAchievements> =>
    ipcRenderer.invoke("library:achievements", gameId),
  scanSteam: (): Promise<LibrarySnapshot> => ipcRenderer.invoke("library:scan-steam"),
  selectExecutable: (): Promise<{ path: string; suggestedTitle: string } | null> =>
    ipcRenderer.invoke("dialog:select-executable"),
  selectArtwork: (): Promise<{
    path: string;
    name: string;
    previewUrl: string;
  } | null> => ipcRenderer.invoke("dialog:select-artwork"),
  searchArtwork: (query: string): Promise<ArtworkSuggestion[]> =>
    ipcRenderer.invoke("artwork:search", query),
  searchLudusavi: (
    query: string,
  ): Promise<
    Array<{
      name: string;
      steamAppId: string | null;
      files: Array<{ path: string; tags: string[] }>;
    }>
  > => ipcRenderer.invoke("ludusavi:search", query),
  autoAssociateLudusavi: (): Promise<{ snapshot: LibrarySnapshot; count: number }> =>
    ipcRenderer.invoke("ludusavi:auto-associate"),
  setRemoteArtwork: (
    gameId: string,
    artwork: ArtworkSuggestion,
  ): Promise<LibrarySnapshot> =>
    ipcRenderer.invoke("library:set-remote-artwork", gameId, {
      ...artwork,
      steamAppId: artwork.provider === "steam" ? artwork.providerId : null,
    }),
  addLocalGame: (input: {
    title: string;
    executablePath: string;
    artworkPath?: string | null;
    coverUrl?: string | null;
    heroUrl?: string | null;
    steamAppId?: string | null;
    ludusaviGameName?: string | null;
  }): Promise<LibrarySnapshot> => ipcRenderer.invoke("library:add-local", input),
  updateLocalGame: (
    gameId: string,
    input: {
      title: string;
      executablePath: string;
      playtimeMinutes: number;
      steamAppId?: string | null;
      ludusaviGameName?: string | null;
    },
  ): Promise<LibrarySnapshot> =>
    ipcRenderer.invoke("library:update-local", gameId, input),
  setCover: (gameId: string): Promise<LibrarySnapshot | null> =>
    ipcRenderer.invoke("library:set-cover", gameId),
  uninstallOrHide: (gameId: string): Promise<LibrarySnapshot> =>
    ipcRenderer.invoke("library:uninstall-or-hide", gameId),
  launchGame: (gameId: string): Promise<void> =>
    ipcRenderer.invoke("library:launch", gameId),
  onLibraryChanged: (callback: (snapshot: LibrarySnapshot) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: LibrarySnapshot) =>
      callback(snapshot);
    ipcRenderer.on("library:changed", listener);
    return () => ipcRenderer.removeListener("library:changed", listener);
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
