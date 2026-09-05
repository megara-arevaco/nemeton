import { handle } from "./handle.js";
import {
  fetchSteamStoreArtwork,
  searchSteamArtwork,
  type ArtworkSuggestion,
} from "@launcher/core";
import type { MainContext } from "../context.js";

export const registerArtworkHandlers = ({
  ludusaviCatalog,
  scheduleAutoSync,
  store,
}: MainContext) => {
  handle("artwork:search", (_event, query: string) => searchSteamArtwork(query));
  handle("ludusavi:search", (_event, query: string) => ludusaviCatalog.search(query));
  handle("ludusavi:auto-associate", async () => {
    const snapshot = await store.read();
    const updates = [];

    for (const game of snapshot.games.filter(
      (item) => item.source === "local" && !item.ludusaviGameName,
    )) {
      const match = await ludusaviCatalog.match(game.title, game.steamAppId);

      if (!match) {
        continue;
      }
      updates.push({
        gameId: game.id,
        input: {
          title: game.title,
          executablePath: game.installPath,
          playtimeMinutes: game.trackedPlaytimeSeconds / 60,
          steamAppId: game.steamAppId ?? match.steamAppId,
          ludusaviGameName: match.name,
        },
      });
    }
    return { snapshot: await store.updateLocalGames(updates), count: updates.length };
  });
  handle(
    "library:set-remote-artwork",
    async (_event, gameId: string, artwork: ArtworkSuggestion) => {
      const resolvedArtwork =
        artwork.provider === "steam"
          ? await fetchSteamStoreArtwork(artwork.providerId).catch(() => artwork)
          : artwork;
      const snapshot = await store.setRemoteArtwork(gameId, {
        ...resolvedArtwork,
        steamAppId: artwork.provider === "steam" ? artwork.providerId : null,
      });
      scheduleAutoSync();
      return snapshot;
    },
  );
};
