import fs from "node:fs";
import { Worker } from "node:worker_threads";
import { writeJsonAtomically } from "@launcher/core";

const MANIFEST_URL =
  "https://raw.githubusercontent.com/mtkennerly/ludusavi-manifest/master/data/manifest.yaml";

const MAX_CACHE_AGE = 24 * 60 * 60 * 1_000;

interface CacheFile {
  updatedAt: string;
  games: LudusaviGame[];
}

export interface LudusaviGame {
  name: string;
  steamAppId: string | null;
  files: Array<{ path: string; tags: string[] }>;
}

const normalize = (value: string) =>
  value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export class LudusaviCatalog {
  private games: LudusaviGame[] | null = null;
  private searchIndex: Array<{
    game: LudusaviGame;
    normalizedName: string;
  }> | null = null;
  private byName = new Map<string, LudusaviGame>();
  private byNormalizedName = new Map<string, LudusaviGame>();
  private byAppId = new Map<string, LudusaviGame>();
  private loading: Promise<LudusaviGame[]> | null = null;

  constructor(
    private readonly cachePath: string,
    private readonly fetchText: (url: string) => Promise<string>,
    private readonly parseManifest: (
      text: string,
    ) => Promise<LudusaviGame[]> = parseInWorker,
  ) {}

  private async setGames(games: LudusaviGame[]) {
    const byName = new Map<string, LudusaviGame>();
    const byNormalizedName = new Map<string, LudusaviGame>();
    const byAppId = new Map<string, LudusaviGame>();
    const searchIndex: NonNullable<typeof this.searchIndex> = [];

    for (let index = 0; index < games.length; index++) {
      const game = games[index]!;
      const normalizedName = normalize(game.name);

      if (!byName.has(game.name)) {
        byName.set(game.name, game);
      }
      if (!byNormalizedName.has(normalizedName)) {
        byNormalizedName.set(normalizedName, game);
      }
      if (game.steamAppId && !byAppId.has(game.steamAppId)) {
        byAppId.set(game.steamAppId, game);
      }
      searchIndex.push({ game, normalizedName });
      if (index && index % 1000 === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }
    this.byName = byName;
    this.byNormalizedName = byNormalizedName;
    this.byAppId = byAppId;
    this.searchIndex = searchIndex;
    this.games = games;
    return games;
  }

  private async readCache() {
    const info = await fs.promises.stat(this.cachePath).catch(() => null);

    if (!info || info.size > 32 * 1024 * 1024) {
      return null;
    }

    try {
      return await runCatalogWorker<CacheFile>({
        mode: "cache",
        filePath: this.cachePath,
      });
    } catch {
      return null;
    }
  }

  private refreshing: Promise<LudusaviGame[]> | null = null;

  private refresh() {
    if (!this.refreshing) {
      this.refreshing = (async () => {
        const games = await this.parseManifest(await this.fetchText(MANIFEST_URL));
        await writeJsonAtomically(this.cachePath, {
          updatedAt: new Date().toISOString(),
          games,
        });
        return this.setGames(games);
      })().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  private async load(): Promise<LudusaviGame[]> {
    if (this.games) {
      return this.games;
    }
    if (this.loading) {
      return this.loading;
    }
    this.loading = (async () => {
      const cached = await this.readCache();

      if (cached) {
        const games = await this.setGames(cached.games);

        if (Date.now() - new Date(cached.updatedAt).getTime() >= MAX_CACHE_AGE) {
          this.refresh().catch((error) => console.warn("[ludusavi:refresh]", error));
        }
        return games;
      }
      return this.refresh();
    })().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  async search(query: string): Promise<LudusaviGame[]> {
    const wanted = normalize(query);

    if (wanted.length < 2) {
      return [];
    }

    const words = wanted.split(" ");
    await this.load();
    const best: Array<{ game: LudusaviGame; score: number }> = [];
    const compare = (a: (typeof best)[number], b: (typeof best)[number]) =>
      b.score - a.score || a.game.name.localeCompare(b.game.name);

    for (const { game, normalizedName: candidate } of this.searchIndex ?? []) {
      const rawScore =
        candidate === wanted
          ? 1000
          : candidate.startsWith(wanted)
            ? 700
            : candidate.includes(wanted)
              ? 500
              : words.every((word) => candidate.includes(word))
                ? 300
                : 0;
      const score = rawScore - Math.abs(candidate.length - wanted.length);

      if (score <= 0 || (best.length === 30 && score < best[29]!.score)) {
        continue;
      }

      const item = { game, score };
      let low = 0,
        high = best.length;

      while (low < high) {
        const middle = (low + high) >>> 1;

        if (compare(item, best[middle]!) < 0) {
          high = middle;
        } else {
          low = middle + 1;
        }
      }
      best.splice(low, 0, item);
      if (best.length > 30) {
        best.pop();
      }
    }
    return best.map(({ game }) => game);
  }

  async warmup() {
    await this.load();
  }

  async find(name: string) {
    await this.load();
    return this.byName.get(name) ?? null;
  }

  async match(title: string, steamAppId?: string | null) {
    await this.load();
    return (
      (steamAppId ? this.byAppId.get(steamAppId) : null) ??
      this.byNormalizedName.get(normalize(title)) ??
      null
    );
  }
}

function parseInWorker(text: string): Promise<LudusaviGame[]> {
  return runCatalogWorker<LudusaviGame[]>(text);
}

function runCatalogWorker<T>(workerData: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const sourceMode = import.meta.url.endsWith(".ts");
    const target = new URL(
      sourceMode ? "./ludusavi-worker.ts" : "./ludusavi-worker.js",
      import.meta.url,
    );
    const entry = sourceMode
      ? new URL(
          `data:text/javascript,${encodeURIComponent(`import { register } from ${JSON.stringify(import.meta.resolve("tsx/esm/api"))}; register(); await import(${JSON.stringify(target.href)});`)}`,
        )
      : target;
    const worker = new Worker(entry, {
      workerData,
      execArgv: sourceMode ? [] : undefined,
      resourceLimits: { maxOldGenerationSizeMb: 512 },
    });
    const timeout = setTimeout(() => {
      reject(new Error("El catálogo tardó demasiado en procesarse"));
      void worker.terminate();
    }, 30_000);
    worker.once("message", (message) => {
      clearTimeout(timeout);
      resolve(message as T);
    });
    worker.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    worker.once("exit", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error("No se pudo procesar el catálogo"));
      }
    });
  });
}
