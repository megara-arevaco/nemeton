import { useState } from "react";
import type { ComponentPropsWithoutRef } from "react";
import type { LibraryGame } from "@launcher/core";
import { gameHeroSources } from "../../shared/presentation";

type Props = Omit<ComponentPropsWithoutRef<"img">, "src" | "onError"> & {
  game: LibraryGame;
};

export function GameHeroImage({ game, ...imageProps }: Props) {
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const source = gameHeroSources(game).find((candidate) => !failed.has(candidate));

  if (!source) {
    return null;
  }
  return (
    <img
      {...imageProps}
      key={source}
      src={source}
      onError={() => setFailed((previous) => new Set([...previous, source]))}
    />
  );
}
