import { useDeferredValue, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ArtworkSuggestion, LibrarySnapshot } from "@launcher/core";
import { useLudusaviQuery } from "../../queries/game.queries";
import { queryKeys } from "../../queries/queryKeys";

export type LudusaviSuggestion = {
  name: string;
  steamAppId: string | null;
  files: Array<{ path: string; tags: string[] }>;
};
export interface AddGameModalOptions {
  onClose: () => void;
  onCreated: (snapshot: LibrarySnapshot) => void;
}

export function useAddGameModal({ onClose, onCreated }: AddGameModalOptions) {
  const [title, setTitle] = useState("");
  const [executablePath, setExecutablePath] = useState("");
  const [selectedLudusavi, setSelectedLudusavi] =
    useState<LudusaviSuggestion | null>(null);
  const [automaticArtwork, setAutomaticArtwork] =
    useState<ArtworkSuggestion | null>(null);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const deferredTitle = useDeferredValue(title);
  const ludusaviQuery = useLudusaviQuery(
    deferredTitle,
    selectedLudusavi === null,
  );
  const createGameMutation = useMutation({
    mutationFn: window.launcher.addLocalGame,
  });

  const chooseExecutable = async () => {
    const result = await window.launcher.selectExecutable();
    if (!result) {
      return;
    }
    setExecutablePath(result.path);
    setTitle((current) => current || result.suggestedTitle);
    setError("");
  };
  const chooseLudusaviSuggestion = async (item: LudusaviSuggestion) => {
    setTitle(item.name);
    setSelectedLudusavi(item);
    setAutomaticArtwork(null);

    try {
      const artwork = await queryClient.fetchQuery({
        queryKey: queryKeys.artwork(item.name),
        queryFn: () => window.launcher.searchArtwork(item.name),
      });
      const exactSteam = item.steamAppId
        ? artwork.find(
            (candidate) =>
              candidate.provider === "steam" &&
              candidate.providerId === item.steamAppId,
          )
        : null;
      setAutomaticArtwork(exactSteam ?? artwork[0] ?? null);
    } catch {
      /* El juego puede añadirse aunque no haya arte disponible. */
    }
  };
  const clearLudusavi = () => {
    setSelectedLudusavi(null);
    setAutomaticArtwork(null);
  };
  const updateTitle = (value: string) => {
    setTitle(value);
    clearLudusavi();
  };
  const createGame = async () => {
    if (!title.trim()) {
      setError("Escribe un nombre para el juego");
      return;
    }
    setError("");

    try {
      const snapshot = await createGameMutation.mutateAsync({
        title,
        executablePath,
        steamAppId: selectedLudusavi?.steamAppId ?? null,
        ludusaviGameName: selectedLudusavi?.name ?? null,
        coverUrl: automaticArtwork?.coverUrl ?? null,
        heroUrl: automaticArtwork?.heroUrl ?? null,
      });
      onCreated(snapshot);
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "No se pudo añadir el juego",
      );
    }
  };
  return {
    title,
    executablePath,
    ludusaviSuggestions: ludusaviQuery.data ?? [],
    selectedLudusavi,
    automaticArtwork,
    searchingLudusavi: ludusaviQuery.isFetching,
    saving: createGameMutation.isPending,
    error,
    chooseExecutable,
    chooseLudusaviSuggestion,
    clearLudusavi,
    updateTitle,
    createGame,
  };
}
