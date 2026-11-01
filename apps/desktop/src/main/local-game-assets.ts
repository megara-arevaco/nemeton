import {
  fetchSteamStoreArtwork,
  searchSteamArtwork,
  steamFallbackArtwork,
} from "@launcher/core";
import type { LocalGameAssets, LibraryStore } from "@launcher/core";
import type { LudusaviCatalog } from "./ludusavi.js";

const normalizeTitle = (title: string) =>
  title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export async function resolveLocalGameAssets(
  title: string,
  catalog: Pick<LudusaviCatalog, "match">,
  steamAppId?: string | null,
): Promise<LocalGameAssets> {
  const match = await catalog.match(title, steamAppId).catch(() => null);
  let appId = steamAppId ?? match?.steamAppId;
  const ludusaviGameName = match?.name ?? null;

  if (!appId) {
    const suggestions = await searchSteamArtwork(title).catch(() => []);
    const exact = suggestions.filter(
      (item) => normalizeTitle(item.title) === normalizeTitle(title),
    );
    const steam = [
      ...new Map(
        exact
          .filter((item) => item.provider === "steam")
          .map((item) => [item.providerId, item]),
      ).values(),
    ];

    if (steam.length === 1) {
      appId = steam[0]!.providerId;
    } else if (steam.length === 0 && exact.length === 1) {
      return {
        ludusaviGameName,
        coverUrl: exact[0]!.coverUrl,
        heroUrl: exact[0]!.heroUrl,
      };
    }
  }
  if (!appId) {
    return { ludusaviGameName };
  }

  const artwork = await fetchSteamStoreArtwork(appId).catch(() =>
    steamFallbackArtwork(appId!),
  );
  return { steamAppId: appId, ludusaviGameName, ...artwork };
}

export async function completeMissingLocalAssets(
  store: Pick<LibraryStore, "read" | "fillLocalGameAssets">,
  resolve: (title: string, steamAppId?: string | null) => Promise<LocalGameAssets>,
) {
  const snapshot = await store.read();
  const pending = snapshot.games
    .filter(
      (game) =>
        game.source === "local" &&
        !game.hiddenFromLibrary &&
        !game.coverPath &&
        (!game.coverUrl || !game.heroUrl),
    )
    .slice(0, 100);
  const updates: Array<{ gameId: string; assets: LocalGameAssets }> = [];
  const deadline = Date.now() + 30_000;
  await Promise.all(
    Array.from({ length: Math.min(3, pending.length) }, async () => {
      while (pending.length && Date.now() < deadline) {
        const game = pending.shift()!;
        const assets: LocalGameAssets = await resolve(
          game.title,
          game.steamAppId,
        ).catch(() => ({}));

        if (assets.coverUrl || assets.heroUrl) {
          updates.push({ gameId: game.id, assets });
        }
      }
    }),
  );
  return updates.length ? store.fillLocalGameAssets(updates) : snapshot;
}
