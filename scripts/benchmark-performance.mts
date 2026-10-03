import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { LibraryStore } from "../packages/core/src/library/store.js";

async function median(operation: () => unknown | Promise<unknown>) {
  const times: number[] = [];
  for (let index = 0; index < 8; index++) {
    const started = performance.now();
    await operation();
    if (index) times.push(performance.now() - started);
  }
  return Number(times.sort((a, b) => a - b)[3]!.toFixed(3));
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), "nemeton-performance-"));
try {
  for (const count of [1000, 10000, 50000]) {
    const games = Array.from({ length: 1000 }, (_, index) => ({
      id: String(index),
      source: "local",
      sourceId: String(index),
      title: `Game ${index}`,
      importedAt: "2026-01-01T00:00:00Z",
      playtimeMinutes: 60,
      installPath: "/tmp/game",
    }));
    const sessions = Array.from({ length: count }, (_, index) => ({
      id: String(index),
      gameId: String(index % 1000),
      startedAt: "2026-09-15T11:00:00Z",
      endedAt: "2026-09-15T12:00:00Z",
      durationSeconds: 3600,
      origin: "launcher",
    }));
    const file = path.join(root, `library-${count}.json`);
    await fs.writeFile(file, JSON.stringify({ version: 1, games, sessions }, null, 2));
    const store = new LibraryStore(file);
    const started = performance.now();
    await store.read();
    const coldReadMs = Number((performance.now() - started).toFixed(3));
    console.log(
      JSON.stringify({
        games: games.length,
        sessions: count,
        coldReadMs,
        cachedReadMedianMs: await median(() => store.read()),
        indexedGameMedianMs: await median(() => store.getGame("500")),
      }),
    );
  }
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
