import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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

type Feedback =
  | { key: string; values?: Record<string, string | number> }
  | { text: string };

export function useSettingsView(options: SettingsViewOptions) {
  const { t } = useTranslation();
  const { settings, onConnected, onSynced, onLibraryUpdated } = options;
  const [steamIdDraft, setSteamIdDraft] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<Feedback | null>(null);
  const [syncStatus, setSyncStatus] = useState<Feedback | null>(null);
  const renderFeedback = (feedback: Feedback | null) =>
    feedback
      ? "key" in feedback
        ? t(feedback.key, feedback.values)
        : feedback.text
      : "";
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
  const syncSteamMutation = useScanSteamMutation();
  const refreshSteamMutation = useMutation({
    mutationFn: window.launcher.refreshSteamAccount,
  });

  const connect = async () => {
    setStatus({ key: "settings.feedback.importing" });

    try {
      const result = await connectMutation.mutateAsync();
      onConnected(result.snapshot, result.ownedCount);
      setApiKey("");
      setStatus({
        key: "settings.feedback.imported",
        values: { count: result.ownedCount },
      });
    } catch (error) {
      setStatus({
        text: error instanceof Error ? error.message : t("settings.feedback.connectError"),
      });
    }
  };

  const chooseSyncFolder = async () => {
    setSyncStatus({ key: "settings.feedback.selectingSyncFolder" });

    try {
      const result = await chooseSyncFolderMutation.mutateAsync();

      if (result) {
        onSynced(result.snapshot, result.settings);
        setSyncStatus({ key: "settings.feedback.syncComplete" });
      } else {
        setSyncStatus(null);
      }
    } catch (error) {
      setSyncStatus({
        text: error instanceof Error ? error.message : t("settings.feedback.configureFolderError"),
      });
    }
  };

  const syncNow = async () => {
    setSyncStatus({ key: "settings.feedback.mergingHistory" });

    try {
      const result = await syncNowMutation.mutateAsync();
      onSynced(result.snapshot, result.settings);
      setSyncStatus({ key: "settings.feedback.syncComplete" });
    } catch (error) {
      setSyncStatus({
        text: error instanceof Error ? error.message : t("settings.feedback.syncError"),
      });
    }
  };

  const associateLudusavi = async () => {
    setSyncStatus({ key: "settings.feedback.matchingLudusavi" });

    try {
      const result = await associateLudusaviMutation.mutateAsync();
      onLibraryUpdated(result.snapshot);
      setSyncStatus({
        key: "settings.feedback.ludusaviAssociated",
        values: { count: result.count },
      });
    } catch (error) {
      setSyncStatus({
        text: error instanceof Error ? error.message : t("settings.feedback.ludusaviError"),
      });
    }
  };

  const syncSteam = async () => {
    setStatus({ key: "settings.feedback.syncingSteam" });

    try {
      let result: Awaited<
        ReturnType<typeof window.launcher.refreshSteamAccount>
      > | null = null;
      let accountError: string | null = null;

      if (settings?.hasApiKey && settings.steamId) {
        try {
          result = await refreshSteamMutation.mutateAsync();
        } catch (error) {
          accountError =
            error instanceof Error ? error.message : t("settings.feedback.accountError");
        }
      }

      const snapshot = result?.snapshot ?? (await syncSteamMutation.mutateAsync());
      onLibraryUpdated(snapshot);
      const installedCount = snapshot.games.filter(
        (game) => game.source === "steam" && game.installed && !game.hiddenFromLibrary,
      ).length;
      setStatus(
        accountError
          ? { key: "settings.feedback.accountSyncPending", values: { error: accountError } }
          : result
            ? {
                key: "settings.feedback.steamSynced",
                values: { owned: result.ownedCount, installed: installedCount },
              }
            : {
                key: "settings.feedback.installsSynced",
                values: { count: installedCount },
              },
      );
    } catch (error) {
      setStatus({
        text: error instanceof Error ? error.message : t("settings.feedback.readSteamError"),
      });
    }
  };

  return {
    steamId,
    setSteamId: setSteamIdDraft,
    apiKey,
    setApiKey,
    saving: connectMutation.isPending,
    syncingSteam: syncSteamMutation.isPending || refreshSteamMutation.isPending,
    status:
      renderFeedback(status) ||
      (settings?.hasApiKey ? t("settings.feedback.accountConnected") : ""),
    syncing:
      chooseSyncFolderMutation.isPending ||
      syncNowMutation.isPending ||
      associateLudusaviMutation.isPending,
    syncStatus: renderFeedback(syncStatus),
    connect,
    syncSteam,
    chooseSyncFolder,
    syncNow,
    associateLudusavi,
  };
}
