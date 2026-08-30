import { useDeferredValue, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { ArtworkSuggestion, LibraryGame, LibrarySnapshot } from "@launcher/core";
import { useArtworkQuery } from "../../queries/game.queries";

export interface ArtworkModalOptions {
  game: LibraryGame;
  onClose: () => void;
  onUpdated: (snapshot: LibrarySnapshot) => void;
}

export function useArtworkModal({ game, onClose, onUpdated }: ArtworkModalOptions) {
  const [query, setQuery] = useState(game.title);
  const deferredQuery = useDeferredValue(query);
  const artworkQuery = useArtworkQuery(deferredQuery);
  const remoteArtworkMutation = useMutation({
    mutationFn: (suggestion: ArtworkSuggestion) =>
      window.launcher.setRemoteArtwork(game.id, suggestion),
  });
  const uploadArtworkMutation = useMutation({
    mutationFn: () => window.launcher.setCover(game.id),
  });

  const applySuggestion = async (suggestion: ArtworkSuggestion) => {
    const snapshot = await remoteArtworkMutation.mutateAsync(suggestion);
    onUpdated(snapshot);
    onClose();
  };

  const uploadArtwork = async () => {
    const snapshot = await uploadArtworkMutation.mutateAsync();

    if (snapshot) {
      onUpdated(snapshot);
      onClose();
    }
  };
  return {
    query,
    setQuery,
    suggestions: artworkQuery.data ?? [],
    loading: artworkQuery.isFetching,
    error: artworkQuery.error instanceof Error ? artworkQuery.error.message : "",
    applySuggestion,
    uploadArtwork,
  };
}
