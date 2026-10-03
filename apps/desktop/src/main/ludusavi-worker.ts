import fs from "node:fs/promises";
import { parentPort, workerData } from "node:worker_threads";
import { parseManifest } from "./ludusavi-parser.js";

if (typeof workerData === "string") {
  parentPort?.postMessage(parseManifest(workerData));
} else if (workerData?.mode === "cache") {
  const raw = await fs.readFile(workerData.filePath, "utf8");

  if (Buffer.byteLength(raw) > 32 * 1024 * 1024) {
    throw new Error("Catalog cache too large");
  }

  const cached = JSON.parse(raw);

  if (!Array.isArray(cached.games) || !Number.isFinite(Date.parse(cached.updatedAt))) {
    throw new Error("Invalid catalog cache");
  }

  const games = cached.games.map(
    (game: {
      name: string;
      steamAppId: string | null;
      files?: Array<string | { path: string; tags: string[] }>;
    }) => ({
      ...game,
      files: (game.files ?? []).map((file) =>
        typeof file === "string" ? { path: file, tags: [] } : file,
      ),
    }),
  );

  if (
    !games.every(
      (game: { name: string; files: Array<{ path: string; tags: string[] }> }) =>
        typeof game.name === "string" &&
        game.files.every(
          (file) => typeof file.path === "string" && Array.isArray(file.tags),
        ),
    )
  ) {
    throw new Error("Invalid catalog entries");
  }
  parentPort?.postMessage({ updatedAt: cached.updatedAt, games });
} else {
  throw new Error("Invalid catalog operation");
}
