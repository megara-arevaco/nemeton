import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";
import type { ChangeEvent, MouseEvent, SyntheticEvent } from "react";
import type { SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
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
  useSteamSettingsQuery,
  useSyncSettingsQuery,
} from "../../queries/library.queries";
import { queryKeys } from "../../queries/queryKeys";
import { useAchievementsQuery, useGameMetadataQuery } from "../../queries/game.queries";
import { useWorkspaceStatusQuery } from "../../queries/workspace.queries";

export function useLibraryController() {
  const queryClient = useQueryClient();
  const libraryQuery = useLibraryQuery();
  const steamSettingsQuery = useSteamSettingsQuery();
  const syncSettingsQuery = useSyncSettingsQuery();
  const runningGamesQuery = useRunningGamesQuery();
  const workspaceStatusQuery = useWorkspaceStatusQuery();
  const [message, setMessage] = useState("Tu biblioteca vive en este equipo");
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
    games: snapshot.games,
    setGames,
    sessions: snapshot.sessions,
    setSessions,
    message,
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
  const queryClient = useQueryClient();
  const library = useLibraryController();
  const { accentTheme, setAccentTheme } = useTheme();
  const [navigation, dispatchNavigation] = useReducer(
    navigationReducer,
    initialNavigationState,
  );
  const [query, setQuery] = useState("");
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
    return normalized
      ? libraryGames.filter((game) =>
          game.title.toLocaleLowerCase().includes(normalized),
        )
      : libraryGames;
  }, [libraryGames, deferredQuery]);
  const selected =
    library.games.find((game) => game.id === navigation.selectedId) ?? null;
  const selectedIsRunning = selected ? library.runningGameIds.has(selected.id) : false;
  const achievementsQuery = useAchievementsQuery(
    selected?.id ?? null,
    selectedIsRunning,
  );
  const achievements = achievementsQuery.data ?? null;
  const metadataQuery = useGameMetadataQuery(selected?.id ?? null);
  const metadata = metadataQuery.data ?? null;

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
    library.setGames(snapshot.games);
    library.setSessions(snapshot.sessions);
  };

  const connectSteam = (snapshot: LibrarySnapshot, count: number) => {
    updateLibrary(snapshot);
    library.setSteamSettings((current) => ({
      steamId: current?.steamId ?? null,
      hasApiKey: true,
    }));
    library.setMessage(`${count} juegos en tu cuenta de Steam`);
  };

  const syncLibrary = (snapshot: LibrarySnapshot, nextSettings: FolderSyncSettings) => {
    updateLibrary(snapshot);
    library.setSyncSettings(nextSettings);
    library.setMessage("Historial manual sincronizado");
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
    library.setGames(snapshot.games);
    library.setSessions(snapshot.sessions);
    const newest = [...snapshot.games].sort((a, b) =>
      b.importedAt.localeCompare(a.importedAt),
    )[0];
    dispatchNavigation({ type: "select-game", gameId: newest?.id ?? null });
    library.setMessage("Juego local añadido");
  };

  const launchSelected = async () => {
    if (!selected) {
      return;
    }

    try {
      library.setMessage(`Abriendo ${selected.title}…`);
      await launchGameMutation.mutateAsync(selected.id);
      library.setMessage(`${selected.title} iniciado`);
    } catch (error) {
      library.setMessage(
        error instanceof Error ? error.message : `No se pudo iniciar ${selected.title}`,
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
          ? "Desinstalación abierta en Steam; historial conservado"
          : "Juego retirado de la biblioteca; historial conservado",
      );
    } catch (error) {
      library.setMessage(
        error instanceof Error ? error.message : "No se pudo retirar el juego",
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
      library.setMessage(`${deleteGame.title} eliminado definitivamente`);
    } catch (error) {
      library.setMessage(
        error instanceof Error ? error.message : "No se pudo eliminar el juego",
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
