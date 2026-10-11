import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LibraryStore } from "../packages/core/src/library/store";
import {
  fetchSteamStoreArtwork,
  steamFallbackArtwork,
} from "../packages/core/src/artwork/steam";
import { gameLibraryCoverUrl } from "../apps/desktop/src/renderer/shared/presentation";

const current = {
  coverUrl:
    "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2807960/hash/header.jpg",
  heroUrl:
    "https://store.akamai.steamstatic.com/images/storepagebackground/app/2807960",
};

test("Steam artwork uses the current header rather than the tiny capsule", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        "2807960": {
          success: true,
          data: {
            header_image: current.coverUrl,
            capsule_image: "https://example.com/tiny.jpg",
            background: current.heroUrl,
          },
        },
      }),
    );
  try {
    expect(await fetchSteamStoreArtwork("2807960")).toEqual(current);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ "2807960": { success: false } }));
    expect(await fetchSteamStoreArtwork("2807960")).toEqual(
      steamFallbackArtwork("2807960"),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("Steam synchronization repairs old artwork and preserves custom covers", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nemeton-artwork-"));

  try {
    const store = new LibraryStore(path.join(directory, "library.json"));
    await store.importSteamAccount([
      {
        appId: "2807960",
        title: "Battlefield 6",
        playtimeMinutes: 10,
        lastPlayedAt: null,
      },
      { appId: "1867240", title: "WARDOGS", playtimeMinutes: 20, lastPlayedAt: null },
    ]);
    const resolved = await store.resolveSteamArtwork(
      new Map([
        ["2807960", current],
        ["1867240", current],
      ]),
    );

    for (const game of resolved.games) {
      expect(game.coverUrl).toBe(current.coverUrl);
      expect(gameLibraryCoverUrl(game)).toBe(current.coverUrl);
    }

    const bf = resolved.games.find((game) => game.sourceId === "2807960")!;
    const custom = {
      coverUrl: "https://example.com/custom.jpg",
      heroUrl: "https://example.com/hero.jpg",
    };
    await store.setRemoteArtwork(bf.id, custom);
    await store.resolveSteamArtwork(new Map([["2807960", current]]));
    expect((await store.read()).games.find((game) => game.id === bf.id)?.coverUrl).toBe(
      custom.coverUrl,
    );
    await store.setCover(bf.id, "custom.png");
    const snapshot = await store.resolveSteamArtwork(new Map([["2807960", current]]));
    expect(
      gameLibraryCoverUrl(snapshot.games.find((game) => game.id === bf.id)!),
    ).toContain("custom.png");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
