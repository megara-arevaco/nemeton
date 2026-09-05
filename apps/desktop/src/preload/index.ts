import type {
  SavegameState,
  SavegamePolicy,
  SavegameVersion,
} from "../shared/savegames.js";
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

const invoke = <K extends IpcChannel>(channel: K, ...args: IpcArgs<K>) =>
  ipcRenderer.invoke(channel, ...args);

const api = {
  minimizeWindow: (): Promise<void> => invoke("window:minimize"),
  toggleMaximizeWindow: (): Promise<void> => invoke("window:toggle-maximize"),
  closeWindow: (): Promise<void> => invoke("window:close"),
  listGames: (): Promise<LibrarySnapshot> => invoke("library:list"),
  getWorkspaceStatus: (): Promise<{ branch: string | null }> =>
    invoke("workspace:status"),
  getGameMetadata: (gameId: string): Promise<GameMetadata | null> =>
    invoke("library:metadata", gameId),
  getSteamSettings: (): Promise<SteamAccountSettings> => invoke("steam:settings"),
  getSyncSettings: (): Promise<FolderSyncSettings> => invoke("sync:settings"),
  selectSyncFolder: (): Promise<{
    snapshot: LibrarySnapshot;
    settings: FolderSyncSettings;
  } | null> => invoke("sync:select-folder"),
  syncNow: (): Promise<{ snapshot: LibrarySnapshot; settings: FolderSyncSettings }> =>
    invoke("sync:now"),
  getSavegames: (gameId: string): Promise<SavegameState> =>
    invoke("savegames:get", gameId),
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
  uninstallOrHide: (gameId: string): Promise<LibrarySnapshot> =>
    invoke("library:uninstall-or-hide", gameId),
  deleteGameForever: (gameId: string, confirmation: string): Promise<LibrarySnapshot> =>
    invoke("library:delete-forever", gameId, confirmation),
  launchGame: (gameId: string): Promise<void> => invoke("library:launch", gameId),
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
