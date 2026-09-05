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
  private loading: Promise<LudusaviGame[]> | null = null;

  constructor(
    private readonly cachePath: string,
    private readonly fetchText: (url: string) => Promise<string>,
    private readonly parseManifest: (
      text: string,
    ) => Promise<LudusaviGame[]> = parseInWorker,
  ) {}

  private setGames(games: LudusaviGame[]) {
    this.games = games;
    this.searchIndex = games.map((game) => ({
      game,
      normalizedName: normalize(game.name),
    }));
    return games;
  }

  private async readCache() {
    const info = await fs.promises.stat(this.cachePath).catch(() => null);

    if (!info || info.size > 32 * 1024 * 1024) {
      return null;
    }

    const raw = await fs.promises.readFile(this.cachePath, "utf8").catch(() => null);

    if (!raw) {
      return null;
    }
    try {
      const cached = JSON.parse(raw) as CacheFile;

      if (
        !Array.isArray(cached.games) ||
        !Number.isFinite(Date.parse(cached.updatedAt))
      ) {
        return null;
      }

      const games = cached.games.map((game) => ({
        ...game,
        files: (game.files ?? []).map((file) =>
          typeof file === "string" ? { path: file, tags: [] } : file,
        ),
      }));

      if (
        !games.every(
          (game) =>
            typeof game.name === "string" &&
            game.files.every(
              (file) => typeof file.path === "string" && Array.isArray(file.tags),
            ),
        )
      ) {
        return null;
      }
      return { ...cached, games };
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
        const games = this.setGames(cached.games);

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
    return (this.searchIndex ?? [])
      .map(({ game, normalizedName: candidate }) => {
        const score =
          candidate === wanted
            ? 1000
            : candidate.startsWith(wanted)
              ? 700
              : candidate.includes(wanted)
                ? 500
                : words.every((word) => candidate.includes(word))
                  ? 300
                  : 0;
        return { game, score: score - Math.abs(candidate.length - wanted.length) };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.game.name.localeCompare(b.game.name))
      .slice(0, 30)
      .map(({ game }) => game);
  }

  async warmup() {
    await this.load();
  }

  async find(name: string) {
    return (await this.load()).find((game) => game.name === name) ?? null;
  }

  async match(title: string, steamAppId?: string | null) {
    const games = await this.load();

    if (steamAppId) {
      const byId = games.find((game) => game.steamAppId === steamAppId);

      if (byId) {
        return byId;
      }
    }

    const wanted = normalize(title);
    return games.find((game) => normalize(game.name) === wanted) ?? null;
  }
}

function parseInWorker(text: string): Promise<LudusaviGame[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./ludusavi-worker.js", import.meta.url), {
      workerData: text,
      resourceLimits: { maxOldGenerationSizeMb: 512 },
    });
    const timeout = setTimeout(() => {
      reject(new Error("El catálogo tardó demasiado en procesarse"));
      worker.terminate().catch(reject);
    }, 30_000);
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error("No se pudo procesar el catálogo"));
      }
    });
  });
}
