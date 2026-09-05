import { useDeferredValue, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { LibrarySnapshot } from "@launcher/core";
import {
  useArtworkQuery,
  useDebouncedValue,
  useLudusaviQuery,
} from "../../queries/game.queries";
import type { LudusaviSuggestion } from "../../types/ludusavi";

export interface AddGameModalOptions {
  onClose: () => void;
  onCreated: (snapshot: LibrarySnapshot) => void;
}

export function useAddGameModal({ onClose, onCreated }: AddGameModalOptions) {
  const [title, setTitle] = useState("");
  const [executablePath, setExecutablePath] = useState("");
  const [selectedLudusavi, setSelectedLudusavi] = useState<LudusaviSuggestion | null>(
    null,
  );
  const [error, setError] = useState("");
  const deferredTitle = useDeferredValue(title);
  const searchedTitle = useDebouncedValue(deferredTitle, 250);
  const ludusaviQuery = useLudusaviQuery(searchedTitle, selectedLudusavi === null);
  const createGameMutation = useMutation({
    mutationFn: window.launcher.addLocalGame,
  });

  const artworkQuery = useArtworkQuery(selectedLudusavi?.name ?? "");
  const artwork = artworkQuery.data ?? [];
  const exactSteamArtwork = selectedLudusavi?.steamAppId
    ? artwork.find(
        (candidate) =>
          candidate.provider === "steam" &&
          candidate.providerId === selectedLudusavi.steamAppId,
      )
    : null;
  const automaticArtwork = selectedLudusavi
    ? (exactSteamArtwork ?? artwork[0] ?? null)
    : null;

  const chooseExecutable = async () => {
    try {
      const result = await window.launcher.selectExecutable();

      if (!result) {
        return;
      }
      setExecutablePath(result.path);
      setTitle((current) => current || result.suggestedTitle);
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo seleccionar el ejecutable",
      );
    }
  };

  const chooseLudusaviSuggestion = (item: LudusaviSuggestion) => {
    setTitle(item.name);
    setSelectedLudusavi(item);
  };

  const clearLudusavi = () => {
    setSelectedLudusavi(null);
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
      setError(reason instanceof Error ? reason.message : "No se pudo añadir el juego");
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
