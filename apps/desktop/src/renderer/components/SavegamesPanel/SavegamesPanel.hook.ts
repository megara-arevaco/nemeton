import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../queries/queryKeys";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryGame } from "@launcher/core";
import {
  useAddSavegameFolderMutation,
  useBackupSavegamesMutation,
  useChooseSavegameFolderMutation,
  useRemoveSavegameFolderMutation,
  useRestoreSavegamesMutation,
  useSavegamePinnedMutation,
  useSetSavegamePolicyMutation,
  useSavegamesQuery,
} from "../../queries/game.queries";

type SavegameStatus = { key: string } | { text: string };

export function useSavegamesPanel(game: LibraryGame) {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<SavegameStatus | null>(null);
  const savegamesQuery = useSavegamesQuery(game.id);
  useEffect(() => {
    const unsubscribe = window.launcher.onSavegamesChanged((changedGameId) => {
      if (changedGameId === game.id) {
        void savegamesQuery.refetch();
      }
    });
    return () => {
      unsubscribe();
    };
  }, [game.id, savegamesQuery.refetch]);
  const backupMutation = useBackupSavegamesMutation(game.id);
  const chooseFolderMutation = useChooseSavegameFolderMutation(game.id);
  const restoreMutation = useRestoreSavegamesMutation(game.id);
  const setPolicyMutation = useSetSavegamePolicyMutation(game.id);
  const pinMutation = useSavegamePinnedMutation(game.id);
  const addFolderMutation = useAddSavegameFolderMutation(game.id);
  const removeFolderMutation = useRemoveSavegameFolderMutation(game.id);
  const [integrity, setIntegrity] = useState<
    Record<string, "checking" | "verified" | "corrupt">
  >({});
  const discovery = useQuery({
    queryKey: [...queryKeys.savegameDiscovery(game.id), savegamesQuery.dataUpdatedAt],
    queryFn: () => window.launcher.discoverSavegames(game.id),
    enabled: Boolean(savegamesQuery.data),
    staleTime: 30_000,
    gcTime: 0,
  });
  const base = discovery.data ?? savegamesQuery.data ?? null;
  const verification = useQuery({
    queryKey: [
      ...queryKeys.savegameVerification(game.id),
      discovery.dataUpdatedAt || savegamesQuery.dataUpdatedAt,
    ],
    queryFn: async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await window.launcher.verifySavegames(game.id);

        if (result.syncState !== "checking") {
          return result;
        }
      }
      throw new Error(t("savegames.verificationStale"));
    },
    enabled: !discovery.isPending && base?.syncState === "checking",
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const verifiedVersion = verification.data?.versionId;
  const displayedVersion = base?.versions[0]?.id ?? null;
  useEffect(() => {
    if (verifiedVersion !== undefined && verifiedVersion !== displayedVersion) {
      void savegamesQuery.refetch();
    }
  }, [verifiedVersion, displayedVersion, savegamesQuery.refetch]);
  const data =
    base && verification.data && verifiedVersion === displayedVersion
      ? { ...base, ...verification.data }
      : base;
  const busy =
    backupMutation.isPending ||
    chooseFolderMutation.isPending ||
    restoreMutation.isPending ||
    setPolicyMutation.isPending ||
    pinMutation.isPending ||
    addFolderMutation.isPending ||
    removeFolderMutation.isPending;

  const run = async (action: () => Promise<unknown>, successKey: string) => {
    setStatus(null);

    try {
      await action();
      setStatus({ key: successKey });
    } catch (error) {
      setStatus({
        text: error instanceof Error ? error.message : t("savegames.operationError"),
      });
    }
  };

  const errorMessage = savegamesQuery.error
    ? savegamesQuery.error instanceof Error
      ? savegamesQuery.error.message
      : t("savegames.loadError")
    : discovery.error
      ? t("savegames.discoverError")
      : verification.error
        ? t("savegames.verifyError")
        : "";

  const copy = !data
    ? {
        title: t("savegames.checking"),
        detail: t("savegames.checkingDetail"),
        tone: "checking",
      }
    : data.syncState === "checking"
      ? {
          title: t("savegames.checkingChanges"),
          detail: t("savegames.checkingChangesDetail"),
          tone: "checking",
        }
      : data.syncState === "synced"
        ? {
            title: t("savegames.syncedTitle"),
            detail: t("savegames.syncedDetail", {
              date: new Date(data.versions[0]!.createdAt).toLocaleString(i18n.language),
            }),
            tone: "ok",
          }
        : data.syncState === "conflict"
          ? {
              title: t("savegames.conflictTitle"),
              detail: t("savegames.conflictDetail"),
              tone: "warning",
            }
          : data.syncState === "unconfigured"
            ? {
                title: t("savegames.unconfiguredTitle"),
                detail: t("savegames.unconfiguredDetail"),
                tone: "warning",
              }
            : data.syncState === "path-missing"
              ? {
                  title: t("savegames.pathMissingTitle"),
                  detail: data.missingPaths[0] ?? t("savegames.pathMissingDetail"),
                  tone: "error",
                }
              : data.syncState === "not-detected"
                ? {
                    title: t("savegames.notDetectedTitle"),
                    detail: t("savegames.notDetectedDetail"),
                    tone: "warning",
                  }
                : data.syncState === "waiting-backup"
                  ? {
                      title: t("savegames.waitingBackupTitle"),
                      detail: t("savegames.waitingBackupDetail"),
                      tone: "warning",
                    }
                  : {
                      title: t("savegames.pendingTitle"),
                      detail: t("savegames.pendingDetail"),
                      tone: "warning",
                    };
  const conflictCopy = data?.conflict
    ? t("savegames.conflictCopy", {
        device: data.conflict.deviceName,
        remoteDate: new Date(data.conflict.createdAt).toLocaleString(i18n.language),
        remoteSize: (data.conflict.sizeBytes / 1024).toFixed(0),
        remoteFiles: data.conflict.fileCount,
        localDate: data.localSummary?.modifiedAt
          ? new Date(data.localSummary.modifiedAt).toLocaleString(i18n.language)
          : t("savegames.unknownDate"),
        localSize: ((data.localSummary?.sizeBytes ?? 0) / 1024).toFixed(0),
        localFiles: data.localSummary?.fileCount ?? 0,
      })
    : "";
  const chooseFolder = () => chooseFolderMutation.mutateAsync(data?.missingPaths ?? []);

  const backup = () => backupMutation.mutateAsync();

  const restoreLatest = () => {
    if (!data?.conflict) {
      return Promise.resolve(null);
    }
    return restoreMutation.mutateAsync(data.conflict.id);
  };
  const restoreVersion = (versionId: string) => restoreMutation.mutateAsync(versionId);
  const setPolicy = (policy: Partial<NonNullable<typeof data>["policy"]>) =>
    setPolicyMutation.mutateAsync(policy);
  const pinVersion = (versionId: string, pinned: boolean) =>
    pinMutation.mutateAsync({ versionId, pinned });
  const addFolder = () => addFolderMutation.mutateAsync();
  const removeFolder = (folderPath: string) =>
    removeFolderMutation.mutateAsync(folderPath);
  const verifyVersion = async (versionId: string) => {
    setIntegrity((current) => ({ ...current, [versionId]: "checking" }));
    try {
      const result = await window.launcher.verifySavegameVersion(game.id, versionId);
      setIntegrity((current) => ({ ...current, [versionId]: result }));
      return result;
    } catch (error) {
      setIntegrity((current) => ({ ...current, [versionId]: "corrupt" }));
      setStatus({
        text: error instanceof Error ? error.message : t("savegames.verifyError"),
      });
      return "corrupt" as const;
    }
  };

  return {
    loading: savegamesQuery.isPending,
    data,
    busy,
    status: status ? ("key" in status ? t(status.key) : status.text) : errorMessage,
    copy,
    conflictCopy,
    run,
    chooseFolder,
    backup,
    restoreLatest,
    restoreVersion,
    setPolicy,
    pinVersion,
    addFolder,
    removeFolder,
    verifyVersion,
    integrity,
    verificationFailed: Boolean(verification.error || discovery.error),
    retryVerification: () =>
      discovery.error ? discovery.refetch() : verification.refetch(),
  };
}
