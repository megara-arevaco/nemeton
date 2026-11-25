import { handle } from "./handle.js";
import {
  fetchSteamStoreArtwork,
  searchSteamArtwork,
  type ArtworkSuggestion,
} from "@launcher/core";
import { hookshotGame, isOcarinaOfTimeAlias } from "../ludusavi.js";
import { findHookshotInstallation } from "../platform.js";
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
      (item) =>
        item.source === "local" &&
        (!item.ludusaviGameName || isOcarinaOfTimeAlias(item.ludusaviGameName)),
    )) {
      const isHookshot = await findHookshotInstallation(game.installPath);
      const match = isHookshot
        ? hookshotGame
        : game.ludusaviGameName
          ? null
          : await ludusaviCatalog.match(game.title, game.steamAppId);

      if (!match) {
        continue;
      }
      updates.push({
        gameId: game.id,
        installPath: game.installPath,
        previousName: game.ludusaviGameName,
        name: match.name,
        steamAppId: match.steamAppId,
      });
    }
    return store.linkLocalGamesToLudusavi(updates);
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
