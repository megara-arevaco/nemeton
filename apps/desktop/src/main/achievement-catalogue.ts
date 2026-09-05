import path from "node:path";
import { z } from "zod";
import { readTextIfExists, writeJsonAtomically } from "@launcher/core";
import type { GameAchievements } from "@launcher/core";

const entrySchema = z.object({
  name: z.string().min(1).max(512),
  displayName: z.string().max(2048).optional(),
  description: z.string().max(16384).optional(),
  hidden: z.union([z.boolean(), z.number()]).optional(),
  icon: z.string().max(2048).optional(),
  icongray: z.string().max(2048).optional(),
});

const entriesSchema = z.array(entrySchema).max(10000);

const responseSchema = z.object({
  game: z.object({
    availableGameStats: z.object({ achievements: entriesSchema }),
  }),
});

const cacheSchema = z.object({ fetchedAt: z.number(), entries: entriesSchema });

type Catalogue = z.infer<typeof entriesSchema>;

const lifetime = 7 * 24 * 60 * 60 * 1000;

const imageUrl = (value?: string) => {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
};

export function mergeAchievementCatalogue(
  local: GameAchievements,
  catalogue: Catalogue,
): GameAchievements {
  const states = new Map(local.items.map((item) => [item.id.toLowerCase(), item]));
  const items = catalogue.map((entry) => {
    const state = states.get(entry.name.toLowerCase());
    states.delete(entry.name.toLowerCase());
    return {
      id: state?.id ?? entry.name,
      name: entry.displayName?.trim() || state?.name || entry.name,
      description: entry.description || state?.description || "",
      imageUrl:
        imageUrl(state?.achieved ? entry.icon : entry.icongray) ??
        imageUrl(entry.icon) ??
        state?.imageUrl ??
        null,
      achieved: state?.achieved ?? false,
      unlockedAt: state?.unlockedAt ?? null,
      globalPercentage: state?.globalPercentage ?? null,
      hidden: entry.hidden === 1 || entry.hidden === true,
    };
  });
  // Keep unmatched local progress: an outdated catalogue must never erase a unlock.
  items.push(...states.values());
  items.sort(
    (a, b) =>
      Number(b.achieved) - Number(a.achieved) ||
      (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? ""),
  );
  return {
    ...local,
    items,
    total: Math.max(items.length, local.total),
    unlocked: Math.max(local.unlocked, items.filter((item) => item.achieved).length),
    totalKnown: states.size === 0 && local.total <= items.length,
  };
}

export class AchievementCatalogue {
  private pending = new Map<string, Promise<Catalogue | null>>();
  private retryAfter = new Map<string, number>();

  constructor(
    private readonly directory: string,
    private readonly readApiKey: () => Promise<string | null>,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  get(appId: string): Promise<Catalogue | null> {
    if (!/^\d+$/.test(appId)) {
      return Promise.resolve(null);
    }

    const existing = this.pending.get(appId);

    if (existing) {
      return existing;
    }

    const request = this.load(appId).finally(() => this.pending.delete(appId));
    this.pending.set(appId, request);
    return request;
  }

  private async load(appId: string): Promise<Catalogue | null> {
    const file = path.join(this.directory, `${appId}-spanish.json`);
    const raw = await readTextIfExists(file).catch(() => null);
    let cached: z.infer<typeof cacheSchema> | null = null;

    try {
      cached = cacheSchema.parse(JSON.parse(raw ?? "null"));
    } catch {
      /* Rebuild invalid cache. */
    }
    if (cached && Date.now() - cached.fetchedAt < lifetime) {
      return cached.entries;
    }
    if (Date.now() < (this.retryAfter.get(appId) ?? 0)) {
      return cached?.entries ?? null;
    }
    try {
      const key = await this.readApiKey();

      if (!key) {
        return cached?.entries ?? null;
      }

      const query = new URLSearchParams({ appid: appId, l: "spanish" });
      const response = await this.fetcher(
        `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?${query}`,
        {
          headers: { "x-webapi-key": key, Accept: "application/json" },
          signal: AbortSignal.timeout(6000),
        },
      );

      if (!response.ok || !response.body) {
        throw new Error("Catalogue unavailable");
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;

      try {
        while (true) {
          const { value, done } = await reader.read();

          if (done) {
            break;
          }
          bytes += value.byteLength;
          if (bytes > 4 * 1024 * 1024) {
            throw new Error("Catalogue too large");
          }
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }

      const entries = responseSchema.parse(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
      ).game.availableGameStats.achievements;

      if (
        !entries.length ||
        new Set(entries.map((e) => e.name.toLowerCase())).size !== entries.length
      ) {
        throw new Error("Empty or duplicate catalogue");
      }
      await writeJsonAtomically(file, { fetchedAt: Date.now(), entries });
      this.retryAfter.delete(appId);
      return entries;
    } catch {
      // Never log request errors: authentication details must stay in the main process.
      if (this.retryAfter.size >= 256) {
        this.retryAfter.clear();
      }
      this.retryAfter.set(appId, Date.now() + 60000);
      return cached?.entries ?? null;
    }
  }
}
