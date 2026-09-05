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
    onSuccess: (snapshot) => {
      onUpdated(snapshot);
      onClose();
    },
  });
  const uploadArtworkMutation = useMutation({
    mutationFn: () => window.launcher.setCover(game.id),
    onSuccess: (snapshot) => {
      if (snapshot) {
        onUpdated(snapshot);
        onClose();
      }
    },
  });

  const saving = remoteArtworkMutation.isPending || uploadArtworkMutation.isPending;
  const mutationError = remoteArtworkMutation.error ?? uploadArtworkMutation.error;
  const error = mutationError ?? artworkQuery.error;
  const applySuggestion = (suggestion: ArtworkSuggestion) => {
    if (!saving) {
      uploadArtworkMutation.reset();
      remoteArtworkMutation.mutate(suggestion);
    }
  };

  const uploadArtwork = () => {
    if (!saving) {
      remoteArtworkMutation.reset();
      uploadArtworkMutation.mutate();
    }
  };

  return {
    query,
    setQuery,
    suggestions: artworkQuery.data ?? [],
    loading: artworkQuery.isFetching,
    saving,
    error: error instanceof Error ? error.message : "",
    applySuggestion,
    uploadArtwork,
  };
}
