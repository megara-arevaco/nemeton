import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { ChangeEvent, MouseEvent, SyntheticEvent } from "react";
import type { SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import type {
  BacklogStatus,
  FolderSyncSettings,
  LibraryGame,
  LibrarySnapshot,
  SteamAccountSettings,
} from "@launcher/core";
import { useTheme } from "../ThemeProvider";
import {
  useLibraryQuery,
  useLibrarySubscriptions,
  useDeleteGameForeverMutation,
  useLaunchGameMutation,
  useRemoveGameMutation,
  useRunningGamesQuery,
  useScanSteamMutation,
  useSteamSettingsQuery,
  useSyncSettingsQuery,
} from "../../queries/library.queries";
import { queryKeys } from "../../queries/queryKeys";
import { useAchievementsQuery, useGameMetadataQuery } from "../../queries/game.queries";
import { useWorkspaceStatusQuery } from "../../queries/workspace.queries";

export function useLibraryController() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const libraryQuery = useLibraryQuery();
  const libraryStarted = useRef(performance.now());
  const recordedReady = useRef(false);
  useEffect(() => {
    if (!libraryQuery.data || recordedReady.current) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      recordedReady.current = true;
      void window.launcher
        .recordPerformance(
          "ui:library-ready",
          performance.now() - libraryStarted.current,
        )
        .catch(() => undefined);
    });
    return () => cancelAnimationFrame(frame);
  }, [libraryQuery.data]);
  const steamSettingsQuery = useSteamSettingsQuery();
  const syncSettingsQuery = useSyncSettingsQuery();
  const runningGamesQuery = useRunningGamesQuery();
  const workspaceStatusQuery = useWorkspaceStatusQuery();
  const [message, setMessage] = useState(() => t("status.libraryStored"));
  useLibrarySubscriptions();

  const snapshot = libraryQuery.data ?? { games: [], sessions: [] };
  const setGames = (games: LibraryGame[]) => {
    queryClient.setQueryData<LibrarySnapshot>(queryKeys.library, (current) => ({
      version: 1,
      games,
      sessions: current?.sessions ?? [],
    }));
  };
  const setSessions = (sessions: LibrarySnapshot["sessions"]) => {
    queryClient.setQueryData<LibrarySnapshot>(queryKeys.library, (current) => ({
      version: 1,
      games: current?.games ?? [],
      sessions,
    }));
  };
  const setSteamSettings = (value: SetStateAction<SteamAccountSettings>) => {
    queryClient.setQueryData<SteamAccountSettings>(
      queryKeys.steamSettings,
      (current) =>
        typeof value === "function"
          ? value(current ?? { steamId: null, hasApiKey: false })
          : value,
    );
  };
  const setSyncSettings = (settings: FolderSyncSettings) => {
    queryClient.setQueryData(queryKeys.syncSettings, settings);
  };

  return {
    libraryLoading: libraryQuery.isPending,
    games: snapshot.games,
    setGames,
    sessions: snapshot.sessions,
    setSessions,
    message: libraryQuery.error
      ? t("status.libraryLoadError")
      : libraryQuery.isPending
        ? t("status.loadingLibrary")
        : message,
    setMessage,
    steamSettings: steamSettingsQuery.data ?? null,
    setSteamSettings,
    syncSettings: syncSettingsQuery.data ?? null,
    setSyncSettings,
    runningGameIds: runningGamesQuery.data,
    workspaceStatus: workspaceStatusQuery.data ?? null,
  };
}

export type AppView = "library" | "statistics" | "settings";

type AppOverlay =
  | { type: "add-game" }
  | { type: "artwork"; game: LibraryGame }
  | { type: "delete-game"; game: LibraryGame }
  | { type: "edit-game"; game: LibraryGame }
  | { type: "game-menu"; game: LibraryGame; x: number; y: number }
  | null;

interface NavigationState {
  view: AppView;
  selectedId: string | null;
  overlay: AppOverlay;
}

type NavigationAction =
  | { type: "open-view"; view: AppView }
  | { type: "select-game"; gameId: string | null }
  | { type: "open-overlay"; overlay: Exclude<AppOverlay, null> }
  | { type: "close-overlay" };

const initialNavigationState: NavigationState = {
  view: "library",
  selectedId: null,
  overlay: null,
};

function navigationReducer(
  state: NavigationState,
  action: NavigationAction,
): NavigationState {
  switch (action.type) {
    case "open-view":
      return {
        ...state,
        view: action.view,
        selectedId: action.view === "library" ? state.selectedId : null,
        overlay: null,
      };
    case "select-game":
      return {
        ...state,
        view: "library",
        selectedId: action.gameId,
        overlay: null,
      };
    case "open-overlay":
      return {
        ...state,
        overlay: action.overlay,
      };
    case "close-overlay":
      return {
        ...state,
        overlay: null,
      };
  }
}

export function useApp() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const library = useLibraryController();
  const { accentTheme, setAccentTheme } = useTheme();
  const [navigation, dispatchNavigation] = useReducer(
    navigationReducer,
    initialNavigationState,
  );
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [backlogFilter, setBacklogFilter] = useState<BacklogStatus | "all">("all");
  const scanSteamMutation = useScanSteamMutation();
  const launchGameMutation = useLaunchGameMutation();
  const removeGameMutation = useRemoveGameMutation();
  const deleteGameForeverMutation = useDeleteGameForeverMutation();
  const showAddGame = navigation.overlay?.type === "add-game";
  const artworkGame =
    navigation.overlay?.type === "artwork" ? navigation.overlay.game : null;
  const editGame =
    navigation.overlay?.type === "edit-game" ? navigation.overlay.game : null;
  const deleteGame =
    navigation.overlay?.type === "delete-game" ? navigation.overlay.game : null;
  const gameMenu = navigation.overlay?.type === "game-menu" ? navigation.overlay : null;
  const view = navigation.view;
  const deferredQuery = useDeferredValue(query);
  const selectionStarted = useRef<number | null>(null);

  useEffect(() => {
    if (!gameMenu) {
      return;
    }

    const close = () => dispatchNavigation({ type: "close-overlay" });
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);

    return () => {
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [gameMenu]);

  const libraryGames = useMemo(
    () =>
      library.games.filter(
        (game) =>
          !game.hiddenFromLibrary && (game.source === "local" || game.installed),
      ),
    [library.games],
  );
  const visibleGames = useMemo(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase();
    return libraryGames.filter((game) => {
      const matchesQuery =
        !normalized || game.title.toLocaleLowerCase().includes(normalized);
      const matchesFavorite = !favoritesOnly || game.favorite === true;
      const matchesBacklog =
        backlogFilter === "all" || game.backlogStatus === backlogFilter;
      return matchesQuery && matchesFavorite && matchesBacklog;
    });
  }, [libraryGames, deferredQuery, favoritesOnly, backlogFilter]);
  const selected =
    visibleGames.find((game) => game.id === navigation.selectedId) ?? null;
  const selectedIsRunning = selected ? library.runningGameIds.has(selected.id) : false;
  const achievementsQuery = useAchievementsQuery(
    selected?.id ?? null,
    selectedIsRunning,
  );
  const achievements = achievementsQuery.data ?? null;
  const metadataQuery = useGameMetadataQuery(selected?.id ?? null);
  const metadata = metadataQuery.data ?? null;

  useEffect(() => {
    if (
      !selected ||
      achievementsQuery.isPending ||
      metadataQuery.isPending ||
      selectionStarted.current === null
    ) {
      return;
    }

    const started = selectionStarted.current;
    const frame = requestAnimationFrame(() => {
      selectionStarted.current = null;
      void window.launcher
        .recordPerformance("ui:game-ready", performance.now() - started)
        .catch(() => undefined);
    });
    return () => cancelAnimationFrame(frame);
  }, [selected, achievementsQuery.isPending, metadataQuery.isPending]);

  const openLibrary = useCallback(() => {
    dispatchNavigation({ type: "select-game", gameId: null });
  }, []);
  const openStatistics = useCallback(() => {
    dispatchNavigation({ type: "open-view", view: "statistics" });
  }, []);
  const openSettings = useCallback(() => {
    dispatchNavigation({ type: "open-view", view: "settings" });
  }, []);
  const addGame = useCallback(() => {
    dispatchNavigation({ type: "open-overlay", overlay: { type: "add-game" } });
  }, []);
  const selectGame = useCallback((gameId: string) => {
    selectionStarted.current = performance.now();
    dispatchNavigation({ type: "select-game", gameId });
  }, []);
  const openGameMenu = useCallback((game: LibraryGame, x: number, y: number) => {
    dispatchNavigation({
      type: "open-overlay",
      overlay: {
        type: "game-menu",
        game,
        x: Math.min(x, window.innerWidth - 230),
        y: Math.min(y, window.innerHeight - 150),
      },
    });
  }, []);

  const updateQuery = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  };

  const updateCollectionState = async (
    gameId: string,
    state: { favorite?: boolean; backlogStatus?: BacklogStatus | null },
  ) => {
    try {
      const snapshot = await window.launcher.setGameCollectionState(gameId, state);
      queryClient.setQueryData(queryKeys.library, snapshot);
      library.setMessage(t("status.collectionUpdated"));
    } catch (error) {
      library.setMessage(
        error instanceof Error ? error.message : t("status.collectionError"),
      );
    }
  };

  const scanInstalledSteam = async () => {
    try {
      library.setMessage(t("status.scanningSteam"));
      const snapshot = await scanSteamMutation.mutateAsync();
      const count = snapshot.games.filter(
        (game) => game.source === "steam" && game.installed && !game.hiddenFromLibrary,
      ).length;
      library.setMessage(t("status.installedSteamGames", { count }));
    } catch (error) {
      library.setMessage(
        error instanceof Error ? error.message : t("status.scanSteamError"),
      );
    }
  };

  const clearLibraryFilters = () => {
    setQuery("");
    setFavoritesOnly(false);
    setBacklogFilter("all");
  };

  const minimizeWindow = () => {
    window.launcher.minimizeWindow();
  };

  const maximizeWindow = () => {
    window.launcher.toggleMaximizeWindow();
  };

  const closeWindow = () => {
    window.launcher.closeWindow();
  };

  const updateLibrary = (snapshot: LibrarySnapshot) => {
    queryClient.setQueryData(queryKeys.library, snapshot);
  };

  const connectSteam = (snapshot: LibrarySnapshot, count: number) => {
    updateLibrary(snapshot);
    library.setSteamSettings((current) => ({
      steamId: current?.steamId ?? null,
      hasApiKey: true,
    }));
    library.setMessage(t("status.steamGames", { count }));
  };

  const syncLibrary = (snapshot: LibrarySnapshot, nextSettings: FolderSyncSettings) => {
    updateLibrary(snapshot);
    library.setSyncSettings(nextSettings);
    library.setMessage(t("status.historySynced"));
  };

  const openEditor = () => {
    if (selected) {
      dispatchNavigation({
        type: "open-overlay",
        overlay: { type: "edit-game", game: selected },
      });
    }
  };

  const closeOverlay = () => dispatchNavigation({ type: "close-overlay" });

  const closeGameMenuFromContext = (event: MouseEvent) => {
    event.preventDefault();
    closeOverlay();
  };

  const stopPropagation = (event: MouseEvent) => {
    event.stopPropagation();
  };

  const hideBrokenImage = (event: SyntheticEvent<HTMLImageElement>) => {
    event.currentTarget.remove();
  };

  const onLocalGameCreated = (snapshot: LibrarySnapshot) => {
    queryClient.setQueryData(queryKeys.library, snapshot);
    const newest = [...snapshot.games].sort((a, b) =>
      b.importedAt.localeCompare(a.importedAt),
    )[0];
    dispatchNavigation({ type: "select-game", gameId: newest?.id ?? null });
    library.setMessage(t("status.localGameAdded"));
  };

  const launchSelected = async () => {
    if (!selected) {
      return;
    }

    try {
      library.setMessage(t("status.startingGame", { title: selected.title }));
      await launchGameMutation.mutateAsync(selected.id);
      library.setMessage(t("status.gameStarted", { title: selected.title }));
    } catch (error) {
      library.setMessage(
        error instanceof Error
          ? error.message
          : t("status.launchFailed", { title: selected.title }),
      );
    }
  };

  const chooseCover = () => {
    if (selected) {
      dispatchNavigation({
        type: "open-overlay",
        overlay: { type: "artwork", game: selected },
      });
    }
  };

  const removeGame = async () => {
    if (!gameMenu) {
      return;
    }

    try {
      await removeGameMutation.mutateAsync(gameMenu.game.id);

      if (navigation.selectedId === gameMenu.game.id) {
        dispatchNavigation({ type: "select-game", gameId: null });
      }

      library.setMessage(
        gameMenu.game.source === "steam" && gameMenu.game.installed
          ? t("status.uninstallOpened")
          : t("status.gameRemoved"),
      );
    } catch (error) {
      library.setMessage(
        error instanceof Error ? error.message : t("status.removeFailed"),
      );
    } finally {
      closeOverlay();
    }
  };

  const requestDeleteGame = () => {
    if (!gameMenu) {
      return;
    }

    deleteGameForeverMutation.reset();
    dispatchNavigation({
      type: "open-overlay",
      overlay: { type: "delete-game", game: gameMenu.game },
    });
  };

  const requestDeleteSelectedGame = () => {
    if (!selected) {
      return;
    }

    deleteGameForeverMutation.reset();
    dispatchNavigation({
      type: "open-overlay",
      overlay: { type: "delete-game", game: selected },
    });
  };

  const deleteGameForever = async (confirmation: string) => {
    if (!deleteGame) {
      return;
    }

    try {
      await deleteGameForeverMutation.mutateAsync({
        gameId: deleteGame.id,
        confirmation,
      });

      if (navigation.selectedId === deleteGame.id) {
        dispatchNavigation({ type: "select-game", gameId: null });
      } else {
        closeOverlay();
      }
      queryClient.removeQueries({ queryKey: queryKeys.metadata(deleteGame.id) });
      queryClient.removeQueries({ queryKey: queryKeys.achievements(deleteGame.id) });
      queryClient.removeQueries({ queryKey: queryKeys.savegames(deleteGame.id) });
      library.setMessage(t("status.gameDeleted", { title: deleteGame.title }));
    } catch (error) {
      library.setMessage(
        error instanceof Error ? error.message : t("status.deleteFailed"),
      );
    }
  };

  const deleteGameError =
    deleteGameForeverMutation.error instanceof Error
      ? deleteGameForeverMutation.error.message
      : "";

  return {
    ...library,
    selectedId: navigation.selectedId,
    query,
    setQuery,
    favoritesOnly,
    setFavoritesOnly,
    backlogFilter,
    setBacklogFilter,
    achievements,
    metadata,
    view,
    showAddGame,
    artworkGame,
    editGame,
    deleteGame,
    gameMenu,
    accentTheme,
    setAccentTheme,
    libraryGames,
    visibleGames,
    selected,
    openLibrary,
    openStatistics,
    openSettings,
    addGame,
    selectGame,
    openGameMenu,
    updateQuery,
    updateCollectionState,
    scanInstalledSteam,
    scanningSteam: scanSteamMutation.isPending,
    clearLibraryFilters,
    minimizeWindow,
    maximizeWindow,
    closeWindow,
    updateLibrary,
    connectSteam,
    syncLibrary,
    openEditor,
    closeAddGame: closeOverlay,
    closeArtwork: closeOverlay,
    closeEditor: closeOverlay,
    closeGameMenu: closeOverlay,
    closeGameMenuFromContext,
    stopPropagation,
    hideBrokenImage,
    onLocalGameCreated,
    launchSelected,
    chooseCover,
    removeGame,
    requestDeleteGame,
    requestDeleteSelectedGame,
    deleteGameForever,
    deletingGame: deleteGameForeverMutation.isPending,
    deleteGameError,
  };
}
