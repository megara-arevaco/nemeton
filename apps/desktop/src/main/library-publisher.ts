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

  snapshot(snapshot: LibrarySnapshot, storageRevision?: number): PublishedLibrary {
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
    this.publish(snapshot, storageRevision);
    return { ...snapshot, revision: this.current!.revision };
  }

  publish(snapshot: LibrarySnapshot, storageRevision?: number) {
    if (
      "revision" in snapshot &&
      typeof snapshot.revision === "number" &&
      this.current &&
      snapshot.revision < this.current.revision
    ) {
      return;
    }
    if (storageRevision !== undefined) {
      if (storageRevision < this.storageRevision) {
        return;
      }
      this.storageRevision = storageRevision;
    }
    if (!this.current) {
      this.current = { ...structuredClone(snapshot), revision: 0 };
      return;
    }

    const change = libraryChange(this.current, snapshot);

    if (!change) {
      return;
    }
    this.current = { ...structuredClone(snapshot), revision: change.revision };
    this.send(change);
  }
}
