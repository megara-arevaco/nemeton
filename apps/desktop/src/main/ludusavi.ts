import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const MANIFEST_URL =
  "https://raw.githubusercontent.com/mtkennerly/ludusavi-manifest/master/data/manifest.yaml";
const MAX_CACHE_AGE = 24 * 60 * 60 * 1_000;

interface ManifestGame {
  steam?: { id?: number | string };
  files?: Record<string, { tags?: string[] }>;
}
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
  private loading: Promise<LudusaviGame[]> | null = null;

  constructor(
    private readonly cachePath: string,
    private readonly fetchText: (url: string) => Promise<string>,
  ) {}

  private async readCache() {
    const raw = await fs.promises.readFile(this.cachePath, "utf8").catch(() => null);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CacheFile;
    } catch {
      return null;
    }
  }

  private async load(): Promise<LudusaviGame[]> {
    if (this.games) return this.games;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const cached = await this.readCache();
      const fresh =
        cached && Date.now() - new Date(cached.updatedAt).getTime() < MAX_CACHE_AGE;
      if (fresh)
        return (this.games = cached.games.map((game) => ({
          ...game,
          files: (game.files ?? []).map((file) =>
            typeof file === "string" ? { path: file, tags: [] } : file,
          ),
        })));
      try {
        const document = parse(await this.fetchText(MANIFEST_URL)) as Record<
          string,
          ManifestGame
        >;
        const games = Object.entries(document).map(([name, game]) => ({
          name,
          steamAppId: game?.steam?.id == null ? null : String(game.steam.id),
          files: Object.entries(game?.files ?? {}).map(([filePath, metadata]) => ({
            path: filePath,
            tags: metadata?.tags ?? [],
          })),
        }));
        await fs.promises.mkdir(path.dirname(this.cachePath), { recursive: true });
        await fs.promises.writeFile(
          this.cachePath,
          JSON.stringify({
            updatedAt: new Date().toISOString(),
            games,
          } satisfies CacheFile),
        );
        return (this.games = games);
      } catch (error) {
        if (cached)
          return (this.games = cached.games.map((game) => ({
            ...game,
            files: (game.files ?? []).map((file) =>
              typeof file === "string" ? { path: file, tags: [] } : file,
            ),
          })));
        throw error;
      }
    })().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  async search(query: string): Promise<LudusaviGame[]> {
    const wanted = normalize(query);
    if (wanted.length < 2) return [];
    const words = wanted.split(" ");
    return (await this.load())
      .map((game) => {
        const candidate = normalize(game.name);
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
      .slice(0, 8)
      .map(({ game }) => game);
  }

  async find(name: string) {
    return (await this.load()).find((game) => game.name === name) ?? null;
  }

  async match(title: string, steamAppId?: string | null) {
    const games = await this.load();
    if (steamAppId) {
      const byId = games.find((game) => game.steamAppId === steamAppId);
      if (byId) return byId;
    }
    const wanted = normalize(title);
    return games.find((game) => normalize(game.name) === wanted) ?? null;
  }
}
