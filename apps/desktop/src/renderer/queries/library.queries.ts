import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  applyLibraryChange,
  type PublishedLibrary,
} from "../../shared/library-updates";
import { queryKeys } from "./queryKeys";

let newestRevision = 0;

async function loadLibrary(): Promise<PublishedLibrary> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const snapshot = await window.launcher.listGames();

    if (snapshot.revision >= newestRevision) {
      return snapshot;
    }
  }
  throw new Error("La biblioteca cambió durante la carga. Se volverá a consultar.");
}

export function useLibraryQuery() {
  return useQuery({
    queryKey: queryKeys.library,
    queryFn: loadLibrary,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useSteamSettingsQuery() {
  return useQuery({
    queryKey: queryKeys.steamSettings,
    queryFn: window.launcher.getSteamSettings,
  });
}

export function useSyncSettingsQuery() {
  return useQuery({
    queryKey: queryKeys.syncSettings,
    queryFn: window.launcher.getSyncSettings,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useRunningGamesQuery() {
  return useQuery({
    queryKey: queryKeys.runningGames,
    queryFn: () => Promise.resolve(new Set<string>()),
    initialData: new Set<string>(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useLibrarySubscriptions() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribeLibrary = window.launcher.onLibraryChanged((change) => {
      newestRevision = Math.max(newestRevision, change.revision);
      const current = queryClient.getQueryData<PublishedLibrary>(queryKeys.library);

      // A response may already contain this revision; older events are harmless.
      if (current && current.revision >= change.revision) {
        return;
      }

      const next = current ? applyLibraryChange(current, change) : null;

      if (next) {
        queryClient.setQueryData(queryKeys.library, next);
      } else {
        void queryClient.invalidateQueries({ queryKey: queryKeys.library });
      }
    });
    const unsubscribeRunning = window.launcher.onGameRunningChanged(
      ({ gameId, running }) => {
        queryClient.setQueryData<Set<string>>(
          queryKeys.runningGames,
          (current = new Set<string>()) => {
            const next = new Set(current);

            if (running) {
              next.add(gameId);
            } else {
              next.delete(gameId);
            }

            return next;
          },
        );
      },
    );

    return () => {
      unsubscribeLibrary();
      unsubscribeRunning();
    };
  }, [queryClient]);
}

export function useScanSteamMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: window.launcher.scanSteam,
    onSuccess: (snapshot) => {
      queryClient.setQueryData(queryKeys.library, snapshot);
    },
  });
}

export function useLaunchGameMutation() {
  return useMutation({
    mutationFn: (gameId: string) => window.launcher.launchGame(gameId),
  });
}

export function useRemoveGameMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (gameId: string) => window.launcher.uninstallOrHide(gameId),
    onSuccess: (snapshot) => {
      queryClient.setQueryData(queryKeys.library, snapshot);
    },
  });
}

export function useDeleteGameForeverMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ gameId, confirmation }: { gameId: string; confirmation: string }) =>
      window.launcher.deleteGameForever(gameId, confirmation),
    onSuccess: (snapshot) => {
      queryClient.setQueryData(queryKeys.library, snapshot);
    },
  });
}
