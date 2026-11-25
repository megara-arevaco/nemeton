import { stat } from "node:fs/promises";
import type { LibrarySnapshot } from "@launcher/core";
import {
  libraryChange,
  type LibraryChange,
  type PublishedLibrary,
} from "../shared/library-updates.js";

export class LibraryPublisher {
  private storageRevision = -1;
  private current: PublishedLibrary | null = null;
  constructor(private readonly send: (change: LibraryChange) => void) {}

  async snapshot(
    snapshot: LibrarySnapshot,
    storageRevision?: number,
  ): Promise<PublishedLibrary> {
    const visibleGames = await Promise.all(
      snapshot.games.map(async (game) => {
        if (game.source !== "local" || !game.installPath) {
          return game;
        }
        try {
          return (await stat(game.installPath)).isFile() ? game : null;
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          return code === "ENOENT" || code === "ENOTDIR" ? null : game;
        }
      }),
    );
    snapshot = { ...snapshot, games: visibleGames.filter((game) => game !== null) };

    if (
      "revision" in snapshot &&
      typeof snapshot.revision === "number" &&
      this.current &&
      snapshot.revision < this.current.revision
    ) {
      return structuredClone(this.current);
    }
    if (
      storageRevision !== undefined &&
      storageRevision < this.storageRevision &&
      this.current
    ) {
      return structuredClone(this.current);
    }
    if (storageRevision !== undefined) {
      this.storageRevision = storageRevision;
    }

    if (!this.current) {
      this.current = { ...structuredClone(snapshot), revision: 0 };
      return { ...snapshot, revision: this.current.revision };
    }

    const change = libraryChange(this.current, snapshot);

    if (change) {
      this.current = { ...structuredClone(snapshot), revision: change.revision };
      this.send(change);
    }
    return { ...snapshot, revision: this.current.revision };
  }
}
