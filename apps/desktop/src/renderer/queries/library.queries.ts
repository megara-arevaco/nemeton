import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LibrarySnapshot } from "@launcher/core";
import { queryKeys } from "./queryKeys";

async function loadLibrary(): Promise<LibrarySnapshot> {
  return window.launcher.listGames();
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
    const unsubscribeLibrary = window.launcher.onLibraryChanged((snapshot) => {
      queryClient.setQueryData(queryKeys.library, snapshot);
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
