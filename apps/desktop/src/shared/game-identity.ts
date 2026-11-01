import type { LibraryGame } from "@launcher/core";

/** Preserve historical local backup folders and namespace store copies. */
export const savegameStorageKey = (game: Pick<LibraryGame, "source" | "sourceId">) =>
  game.source === "local" ? game.sourceId : `${game.source}-${game.sourceId}`;
