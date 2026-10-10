import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
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
  const exportDataMutation = useMutation({
    mutationFn: window.launcher.exportPortableData,
  });
  const importDataMutation = useMutation({
    mutationFn: window.launcher.importPortableData,
  });
  const dataLocationQuery = useQuery({
    queryKey: ["runtime", "data-location"],
    queryFn: window.launcher.getDataLocation,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const [dataStatus, setDataStatus] = useState("");
  const [portableFormat, setPortableFormat] = useState<"json" | "package">("json");
  const [includeArtwork, setIncludeArtwork] = useState(true);
  const [includeBackups, setIncludeBackups] = useState(false);
  const [repairChoices, setRepairChoices] = useState<Record<string, string>>({});
  const [backupRecoveryBusy, setBackupRecoveryBusy] = useState(false);
  const [sessionRepairBusy, setSessionRepairBusy] = useState(false);
  const importBackupsQuery = useQuery({
    queryKey: ["data", "import-backups"],
    queryFn: window.launcher.listImportBackups,
  });
  const sessionDiagnosticsQuery = useQuery({
    queryKey: ["data", "session-diagnostics"],
    queryFn: window.launcher.getSessionDiagnostics,
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
        text:
          error instanceof Error ? error.message : t("settings.feedback.connectError"),
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
        text:
          error instanceof Error
            ? error.message
            : t("settings.feedback.configureFolderError"),
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

  const exportData = async () => {
    setDataStatus(t("settings.dataExporting"));
    try {
      const result = await exportDataMutation.mutateAsync({
        language: i18n.resolvedLanguage?.startsWith("en") ? "en" : "es",
        accentTheme: options.accentTheme,
        format: portableFormat,
        includeArtwork: portableFormat === "package" && includeArtwork,
        includeBackups: portableFormat === "package" && includeBackups,
      });
      setDataStatus(
        result
          ? t("settings.dataExported", {
              count: result.gameCount,
              assets: result.assetCount,
              backups: result.backupCount,
            })
          : "",
      );
    } catch (error) {
      setDataStatus(
        error instanceof Error ? error.message : t("settings.dataExportError"),
      );
    }
  };

  const importData = async () => {
    setDataStatus(t("settings.dataImporting"));
    try {
      const result = await importDataMutation.mutateAsync(
        i18n.resolvedLanguage?.startsWith("en") ? "en" : "es",
      );

      if (result) {
        options.onAccentThemeChange(result.preferences.accentTheme);
        await i18n.changeLanguage(result.preferences.language);
        await queryClient.invalidateQueries({ queryKey: ["data", "import-backups"] });
      }
      setDataStatus(
        result
          ? t("settings.dataImported", {
              count: result.gameCount,
              assets: result.assetCount,
              backups: result.backupCount,
            })
          : "",
      );
    } catch (error) {
      setDataStatus(
        error instanceof Error ? error.message : t("settings.dataImportError"),
      );
    }
  };

  const restoreImportBackup = async (
    category: "library" | "savegames" | "achievements",
    fileName: string,
  ) => {
    setDataStatus(t("settings.dataWorking"));
    setBackupRecoveryBusy(true);
    try {
      const result = await window.launcher.restoreImportBackup(
        category,
        fileName,
        i18n.resolvedLanguage?.startsWith("en") ? "en" : "es",
      );

      if (result && category === "library") {
        onLibraryUpdated(await window.launcher.listGames());
      }
      await queryClient.invalidateQueries({ queryKey: ["data", "import-backups"] });
      await queryClient.invalidateQueries({
        queryKey: ["data", "session-diagnostics"],
      });
      setDataStatus(result ? t("settings.recoveryRestored") : "");
    } catch (error) {
      setDataStatus(
        error instanceof Error ? error.message : t("settings.dataImportError"),
      );
    } finally {
      setBackupRecoveryBusy(false);
    }
  };

  const setRepairChoice = (sessionId: string, choice: string) => {
    setRepairChoices((current) => ({ ...current, [sessionId]: choice }));
  };

  const applySessionRepair = async () => {
    const decisions = Object.entries(repairChoices)
      .filter(([, choice]) => choice !== "")
      .map(([sessionId, choice]) => ({
        sessionId,
        gameId: choice === "discard" ? null : choice,
      }));

    if (!decisions.length) {
      return;
    }
    setDataStatus(t("settings.dataWorking"));
    setSessionRepairBusy(true);
    try {
      const result = await window.launcher.repairOrphanSessions(
        decisions,
        i18n.resolvedLanguage?.startsWith("en") ? "en" : "es",
      );

      if (result.repairedCount || result.discardedCount) {
        onLibraryUpdated(await window.launcher.listGames());
        setRepairChoices({});
        await queryClient.invalidateQueries({
          queryKey: ["data", "session-diagnostics"],
        });
        await queryClient.invalidateQueries({ queryKey: ["data", "import-backups"] });
      }
      setDataStatus(
        t("settings.repairFinished", {
          repaired: result.repairedCount,
          discarded: result.discardedCount,
        }),
      );
    } catch (error) {
      setDataStatus(
        error instanceof Error ? error.message : t("settings.dataImportError"),
      );
      await queryClient.invalidateQueries({
        queryKey: ["data", "session-diagnostics"],
      });
    } finally {
      setSessionRepairBusy(false);
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
        text:
          error instanceof Error ? error.message : t("settings.feedback.ludusaviError"),
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
            error instanceof Error
              ? error.message
              : t("settings.feedback.accountError");
        }
      }

      const snapshot = result?.snapshot ?? (await syncSteamMutation.mutateAsync());
      onLibraryUpdated(snapshot);
      const installedCount = snapshot.games.filter(
        (game) => game.source === "steam" && game.installed && !game.hiddenFromLibrary,
      ).length;
      setStatus(
        accountError
          ? {
              key: "settings.feedback.accountSyncPending",
              values: { error: accountError },
            }
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
        text:
          error instanceof Error
            ? error.message
            : t("settings.feedback.readSteamError"),
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
    dataStatus,
    dataLocation: dataLocationQuery.data ?? null,
    transferringData:
      exportDataMutation.isPending ||
      importDataMutation.isPending ||
      backupRecoveryBusy ||
      sessionRepairBusy,
    portableFormat,
    setPortableFormat,
    includeArtwork,
    setIncludeArtwork,
    includeBackups,
    setIncludeBackups,
    importBackups: importBackupsQuery.data ?? [],
    sessionDiagnostics: sessionDiagnosticsQuery.data ?? null,
    repairChoices,
    setRepairChoice,
    applySessionRepair,
    restoringBackup: backupRecoveryBusy,
    repairingSessions: sessionRepairBusy,
    repairPreview: Object.values(repairChoices).filter(Boolean).length,
    exportData,
    importData,
    restoreImportBackup,
    connect,
    syncSteam,
    chooseSyncFolder,
    syncNow,
    associateLudusavi,
  };
}
