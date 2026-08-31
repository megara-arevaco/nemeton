import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type {
  FolderSyncSettings,
  LibrarySnapshot,
  SteamAccountSettings,
} from "@launcher/core";
import type { AccentTheme } from "../../shared/presentation";
import { useScanSteamMutation } from "../../queries/library.queries";
export interface SettingsViewOptions {
  settings: SteamAccountSettings | null;
  syncSettings: FolderSyncSettings | null;
  accentTheme: AccentTheme;
  onAccentThemeChange: (theme: AccentTheme) => void;
  onConnected: (snapshot: LibrarySnapshot, count: number) => void;
  onSynced: (snapshot: LibrarySnapshot, settings: FolderSyncSettings) => void;
  onLibraryUpdated: (snapshot: LibrarySnapshot) => void;
}

export function useSettingsView(options: SettingsViewOptions) {
  const { settings, onConnected, onSynced, onLibraryUpdated } = options;
  const [steamIdDraft, setSteamIdDraft] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState("");
  const [syncStatus, setSyncStatus] = useState("");
  const steamId = steamIdDraft ?? settings?.steamId ?? "";
  const connectMutation = useMutation({
    mutationFn: () => window.launcher.connectSteam(apiKey, steamId || undefined),
  });
  const chooseSyncFolderMutation = useMutation({
    mutationFn: window.launcher.selectSyncFolder,
  });
  const syncNowMutation = useMutation({
    mutationFn: window.launcher.syncNow,
  });
  const associateLudusaviMutation = useMutation({
    mutationFn: window.launcher.autoAssociateLudusavi,
  });
  const importSteamMutation = useScanSteamMutation();

  const connect = async () => {
    setStatus("Importando la biblioteca de la cuenta…");

    try {
      const result = await connectMutation.mutateAsync();
      onConnected(result.snapshot, result.ownedCount);
      setApiKey("");
      setStatus(`${result.ownedCount} juegos importados desde tu cuenta`);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "No se pudo conectar con Steam",
      );
    }
  };

  const chooseSyncFolder = async () => {
    setSyncStatus("Seleccionando y sincronizando…");

    try {
      const result = await chooseSyncFolderMutation.mutateAsync();

      if (result) {
        onSynced(result.snapshot, result.settings);
        setSyncStatus("Sincronización completada");
      } else {
        setSyncStatus("");
      }
    } catch (error) {
      setSyncStatus(
        error instanceof Error ? error.message : "No se pudo configurar la carpeta",
      );
    }
  };

  const syncNow = async () => {
    setSyncStatus("Fusionando el historial…");

    try {
      const result = await syncNowMutation.mutateAsync();
      onSynced(result.snapshot, result.settings);
      setSyncStatus("Sincronización completada");
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : "No se pudo sincronizar");
    }
  };

  const associateLudusavi = async () => {
    setSyncStatus("Buscando coincidencias exactas en Ludusavi…");

    try {
      const result = await associateLudusaviMutation.mutateAsync();
      onLibraryUpdated(result.snapshot);
      setSyncStatus(`${result.count} juegos asociados con Ludusavi`);
    } catch (error) {
      setSyncStatus(
        error instanceof Error ? error.message : "No se pudo consultar Ludusavi",
      );
    }
  };

  const importSteam = async () => {
    setStatus("Buscando instalaciones locales de Steam…");

    try {
      const snapshot = await importSteamMutation.mutateAsync();
      onLibraryUpdated(snapshot);
      setStatus(`${snapshot.games.length} juegos detectados en Steam`);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "No se pudo leer la instalación de Steam",
      );
    }
  };

  return {
    steamId,
    setSteamId: setSteamIdDraft,
    apiKey,
    setApiKey,
    saving: connectMutation.isPending,
    importingSteam: importSteamMutation.isPending,
    status: status || (settings?.hasApiKey ? "Cuenta conectada" : ""),
    syncing:
      chooseSyncFolderMutation.isPending ||
      syncNowMutation.isPending ||
      associateLudusaviMutation.isPending,
    syncStatus,
    connect,
    importSteam,
    chooseSyncFolder,
    syncNow,
    associateLudusavi,
  };
}
