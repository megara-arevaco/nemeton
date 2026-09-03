import type { LibraryGame } from "@launcher/core";
import type { ComponentPropsWithoutRef, SyntheticEvent } from "react";
import { gameCoverUrl, gameLibraryCoverUrl } from "../../shared/presentation";

type GameCoverImageProps = Omit<ComponentPropsWithoutRef<"img">, "onError" | "src"> & {
  game: LibraryGame;
};

export function GameCoverImage({ game, ...imageProps }: GameCoverImageProps) {
  const source = gameLibraryCoverUrl(game);
  const fallback = gameCoverUrl(game);

  if (!source) {
    return null;
  }

  const handleError = (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;

    if (fallback && fallback !== source && image.dataset.fallbackUsed !== "true") {
      image.dataset.fallbackUsed = "true";
      image.src = fallback;
      return;
    }

    image.remove();
  };

  return <img {...imageProps} src={source} onError={handleError} />;
}
