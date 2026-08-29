import { useEffect, useState } from "react";
import type { FolderSyncSettings, GameSession, LibraryGame, LibrarySnapshot, SteamAccountSettings } from "@launcher/core";

interface InitialData {
  snapshot: LibrarySnapshot;
  importedFromSteam: boolean;
  steamSettings: SteamAccountSettings;
  syncSettings: FolderSyncSettings;
}

let initialDataPromise: Promise<InitialData> | null = null;

function loadInitialData(): Promise<InitialData> {
  if (initialDataPromise) return initialDataPromise;
  initialDataPromise = Promise.all([
    window.launcher.listGames(),
    window.launcher.getSteamSettings(),
    window.launcher.getSyncSettings(),
  ]).then(async ([storedSnapshot, steamSettings, syncSettings]) => {
    const importedFromSteam = storedSnapshot.games.length === 0;
    const snapshot = importedFromSteam ? await window.launcher.scanSteam() : storedSnapshot;
    return { snapshot, importedFromSteam, steamSettings, syncSettings };
  }).catch((error) => {
    initialDataPromise = null;
    throw error;
  });
  return initialDataPromise;
}

export function useLibraryController() {
  const [games, setGames] = useState<LibraryGame[]>([]);
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("Tu biblioteca vive en este equipo");
  const [steamSettings, setSteamSettings] = useState<SteamAccountSettings | null>(null);
  const [syncSettings, setSyncSettings] = useState<FolderSyncSettings | null>(null);
  const [runningGameIds, setRunningGameIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let active = true;
    void loadInitialData()
      .then(({ snapshot, importedFromSteam, steamSettings: nextSteamSettings, syncSettings: nextSyncSettings }) => {
        if (!active) return;
        setGames(snapshot.games);
        setSessions(snapshot.sessions);
        setSelectedId(null);
        setSteamSettings(nextSteamSettings);
        setSyncSettings(nextSyncSettings);
        if (importedFromSteam && snapshot.games.length > 0) setMessage(`${snapshot.games.length} juegos importados desde Steam`);
      })
      .catch((error) => {
        if (active) setMessage(error instanceof Error ? error.message : "No se pudo cargar la biblioteca");
      });

    const unsubscribeLibrary = window.launcher.onLibraryChanged((snapshot) => {
      setGames(snapshot.games);
      setSessions(snapshot.sessions);
    });
    const unsubscribeRunning = window.launcher.onGameRunningChanged(({ gameId, running }) => {
      setRunningGameIds((current) => {
        const next = new Set(current);
        if (running) next.add(gameId);
        else next.delete(gameId);
        return next;
      });
    });

    return () => {
      active = false;
      unsubscribeLibrary();
      unsubscribeRunning();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void window.launcher.getSyncSettings()
        .then((settings) => { if (active) setSyncSettings(settings); })
        .catch(() => undefined);
    };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return {
    games, setGames,
    sessions, setSessions,
    selectedId, setSelectedId,
    message, setMessage,
    steamSettings, setSteamSettings,
    syncSettings, setSyncSettings,
    runningGameIds,
  };
}
