import {
  fetchSteamStoreArtwork,
  searchSteamArtwork,
  steamFallbackArtwork,
} from "@launcher/core";
import type { LocalGameAssets, LibraryStore } from "@launcher/core";
import { hookshotGame, type LudusaviCatalog } from "./ludusavi.js";

const normalizeTitle = (title: string) =>
  title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function findNintendoArtwork(title: string, ludusaviGameName?: string | null) {
  if (ludusaviGameName === hookshotGame.name) {
    return {
      coverUrl:
        "https://assets.nintendo.com/image/upload/f_auto,q_auto,c_scale,w_746/ncom/My%20Nintendo%20Store/EN-US/Nintendo%20Switch%202/Software/The%20Legend%20of%20Zelda%20Ocarina%20of%20Time/125697-nintendo-the-legend-of-zelda-ocarina-of-time-2000x2000",
      heroUrl:
        "https://www.nintendo.com/eu/media/images/assets/nintendo_switch_2_games/thelegendofzeldaocarinaoftime/banners/16x9_PDP_NSwitch2_TloZOcarinaOfTime_AnniLogo_image1280w.jpg",
    };
  }

  if (
    normalizeTitle(title).replace(/^the /, "") === "legend of zelda breath of the wild"
  ) {
    return {
      coverUrl:
        "https://assets.nintendo.com/image/upload/f_auto,q_auto,c_scale,w_746/store/software/switch/70010000000025/7137262b5a64d921e193653f8aa0b722925abc5680380ca0e18a5cfd91697f58",
      heroUrl:
        "https://www.nintendo.com/eu/media/images/10_share_images/games_15/wiiu_14/SI_WiiU_TheLegendOfZeldaBreathOfTheWild_image1280w.jpg",
    };
  }

  return null;
}

export async function resolveLocalGameAssets(
  title: string,
  catalog: Pick<LudusaviCatalog, "match">,
  steamAppId?: string | null,
  linkedGameName?: string | null,
): Promise<LocalGameAssets> {
  const nintendoArtwork = steamAppId
    ? null
    : findNintendoArtwork(title, linkedGameName);

  if (nintendoArtwork) {
    return nintendoArtwork;
  }

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
  resolve: (
    title: string,
    steamAppId?: string | null,
    ludusaviGameName?: string | null,
  ) => Promise<LocalGameAssets>,
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
          game.ludusaviGameName,
        ).catch(() => ({}));

        if (assets.coverUrl || assets.heroUrl) {
          updates.push({ gameId: game.id, assets });
        }
      }
    }),
  );
  return updates.length ? store.fillLocalGameAssets(updates) : snapshot;
}
