import fs from "node:fs";
import path from "node:path";
import type { SavegameVersion } from "../../shared/savegames.js";
import { manifestSchema } from "./validation.js";

export async function pruneVersions(
  gameRoot: string,
  listVersions: () => Promise<SavegameVersion[]>,
  maxVersions: number,
  preserveVersionId?: string,
) {
  const snapshotRoot = path.join(gameRoot, "snapshots");
  const archiveRoot = path.join(gameRoot, "versions");
  const versions = await listVersions();
  const removable = versions
    .filter((version) => !version.pinned)
    .slice(maxVersions)
    .filter((version) => version.id !== preserveVersionId);

  for (const version of removable) {
    await fs.promises
      .unlink(path.join(archiveRoot, `${version.id}.zip`))
      .catch(() => undefined);
    await fs.promises
      .unlink(path.join(snapshotRoot, `${version.id}.json`))
      .catch(() => undefined);
  }

  const retained = await listVersions();
  const hashes = new Set<string>();

  for (const version of retained) {
    const raw = await fs.promises
      .readFile(path.join(snapshotRoot, `${version.id}.json`), "utf8")
      .catch(() => null);

    if (raw) {
      for (const file of manifestSchema.parse(JSON.parse(raw)).files) {
        hashes.add(file.hash);
      }
    }
  }

  const blobRoot = path.join(gameRoot, "blobs");

  for (const entry of await fs.promises
    .readdir(blobRoot, { withFileTypes: true })
    .catch(() => [])) {
    if (entry.isFile() && !hashes.has(entry.name)) {
      await fs.promises.unlink(path.join(blobRoot, entry.name)).catch(() => undefined);
    }
  }
}
