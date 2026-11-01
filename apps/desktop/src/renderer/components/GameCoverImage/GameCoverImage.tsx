import { useState } from "react";
import type { LibraryGame } from "@launcher/core";
import type { ComponentPropsWithoutRef, SyntheticEvent } from "react";
import { gameCoverUrl, gameLibraryCoverUrl } from "../../shared/presentation";

type GameCoverImageProps = Omit<ComponentPropsWithoutRef<"img">, "onError" | "src"> & {
  game: LibraryGame;
};

export function GameCoverImage({ game, ...imageProps }: GameCoverImageProps) {
  const source = gameLibraryCoverUrl(game);
  const fallback = gameCoverUrl(game);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [fallbackSource, setFallbackSource] = useState<string | null>(null);

  if (!source || failedSource === source) {
    return null;
  }

  const handleError = (_event: SyntheticEvent<HTMLImageElement>) => {
    if (fallback && fallback !== source && fallbackSource !== source) {
      setFallbackSource(source);
    } else {
      setFailedSource(source);
    }
  };

  return (
    <img
      {...imageProps}
      src={fallbackSource === source ? fallback! : source}
      onError={handleError}
    />
  );
}
