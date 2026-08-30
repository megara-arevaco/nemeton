import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";

export function useAchievementsQuery(gameId: string | null, refreshToken: boolean) {
  return useQuery({
    queryKey: [...queryKeys.achievements(gameId ?? "none"), refreshToken],
    queryFn: () => window.launcher.getAchievements(gameId!),
    enabled: gameId !== null,
  });
}

export function useSavegamesQuery(gameId: string) {
  return useQuery({
    queryKey: queryKeys.savegames(gameId),
    queryFn: () => window.launcher.getSavegames(gameId),
  });
}

export function useArtworkQuery(search: string, enabled = true) {
  const normalizedSearch = search.trim();

  return useQuery({
    queryKey: queryKeys.artwork(normalizedSearch),
    queryFn: () => window.launcher.searchArtwork(normalizedSearch),
    enabled: enabled && normalizedSearch.length >= 2,
  });
}

export function useLudusaviQuery(search: string, enabled = true) {
  const normalizedSearch = search.trim();

  return useQuery({
    queryKey: queryKeys.ludusavi(normalizedSearch),
    queryFn: () => window.launcher.searchLudusavi(normalizedSearch),
    enabled: enabled && normalizedSearch.length >= 2,
  });
}

export function useBackupSavegamesMutation(gameId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => window.launcher.backupSavegames(gameId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.savegames(gameId),
      });
    },
  });
}

export function useChooseSavegameFolderMutation(gameId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (missingPaths: string[]) => {
      for (const missingPath of missingPaths) {
        await window.launcher.removeSavegameFolder(gameId, missingPath);
      }

      return window.launcher.addSavegameFolder(gameId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.savegames(gameId),
      });
    },
  });
}
