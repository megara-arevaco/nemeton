import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LibraryStore } from "../packages/core/src/library/store";
import {
  resolveLocalGameAssets,
  completeMissingLocalAssets,
} from "../apps/desktop/src/main/local-game-assets";
import { LocalFolderImportService } from "../apps/desktop/src/main/local-folder-import";

const artwork = {
  coverUrl: "https://example.com/cover.jpg",
  heroUrl: "https://example.com/hero.jpg",
};

test("local assets resolve the catalog identity and current Steam cover and background", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        "10": {
          success: true,
          data: { header_image: artwork.coverUrl, background: artwork.heroUrl },
        },
      }),
    );
  try {
    const assets = await resolveLocalGameAssets("My Game", {
      match: async () => ({ name: "My Game", steamAppId: "10", files: [] }),
    });
    expect(assets).toEqual({
      ...artwork,
      steamAppId: "10",
      ludusaviGameName: "My Game",
    });
  } finally {
    globalThis.fetch = original;
  }
});

test("asset lookup uses an exact unique title and leaves ambiguous matches for manual selection", async () => {
  const original = globalThis.fetch;
  let ambiguous = false;
  globalThis.fetch = async (input) => {
    const url = String(input);

    if (url.includes("storesearch")) {
      return new Response(
        JSON.stringify({
          items: [
            { id: 11, name: "My Game Deluxe" },
            { id: 10, name: "My Game" },
            ...(ambiguous ? [{ id: 12, name: "My Game" }] : []),
          ],
        }),
      );
    }
    if (url.includes("appdetails")) {
      return new Response(
        JSON.stringify({
          "10": {
            success: true,
            data: { header_image: artwork.coverUrl, background: artwork.heroUrl },
          },
        }),
      );
    }
    return new Response(JSON.stringify({}));
  };
  try {
    expect(
      await resolveLocalGameAssets("My Game", { match: async () => null }),
    ).toMatchObject({ ...artwork, steamAppId: "10" });
    ambiguous = true;
    const result = await resolveLocalGameAssets("My Game", { match: async () => null });
    expect(result.coverUrl).toBeUndefined();
    expect(result.steamAppId).toBeUndefined();
  } finally {
    globalThis.fetch = original;
  }
});

test("repair fills missing local artwork while preserving custom and concurrently changed covers", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nemeton-local-assets-"));

  try {
    const store = new LibraryStore(path.join(directory, "library.json"));
    await store.addLocalBatch([
      { title: "Missing", executablePath: "" },
      {
        title: "Partial",
        executablePath: "",
        coverUrl: "https://example.com/custom.jpg",
      },
      { title: "Custom", executablePath: "", coverPath: "custom.png" },
      { title: "Complete", executablePath: "", ...artwork },
      { title: "Changed", executablePath: "" },
    ]);
    const called: string[] = [];
    const result = await completeMissingLocalAssets(store, async (title) => {
      called.push(title);
      if (title === "Changed") {
        const changed = (await store.read()).games.find(
          (game) => game.title === title,
        )!;
        await store.setRemoteArtwork(changed.id, {
          coverUrl: "https://example.com/new-custom.jpg",
          heroUrl: "https://example.com/new-custom-hero.jpg",
        });
      }
      return { ...artwork, steamAppId: "10" };
    });
    expect(called.sort()).toEqual(["Changed", "Missing", "Partial"]);
    expect(result.games.find((game) => game.title === "Missing")).toMatchObject(
      artwork,
    );
    expect(result.games.find((game) => game.title === "Partial")).toMatchObject({
      coverUrl: "https://example.com/custom.jpg",
      heroUrl: artwork.heroUrl,
    });
    expect(result.games.find((game) => game.title === "Custom")?.coverPath).toBe(
      "custom.png",
    );
    expect(result.games.find((game) => game.title === "Changed")?.coverUrl).toBe(
      "https://example.com/new-custom.jpg",
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("confirmed folder imports persist artwork and tolerate unavailable metadata", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nemeton-import-assets-"));

  try {
    const root = path.join(directory, "games");

    for (const name of ["Alpha", "Beta"]) {
      await fs.mkdir(path.join(root, name), { recursive: true });
      await fs.writeFile(path.join(root, name, `${name}.exe`), "fixture");
    }

    const store = new LibraryStore(path.join(directory, "library.json"));
    const service = new LocalFolderImportService(store, async (input) => {
      if (input.title === "Beta") {
        throw new Error("offline");
      }
      return { ...artwork, steamAppId: "10", ludusaviGameName: "Alpha" };
    });
    const scan = await service.scan(root);
    const result = await service.import(
      scan.scanId,
      scan.candidates.map((candidate) => ({
        candidateId: candidate.id,
        title: candidate.title,
        executablePath: candidate.executables[0]!,
      })),
    );
    expect(result.addedCount).toBe(2);
    expect(result.artworkMissingCount).toBe(1);
    expect(result.snapshot.games.find((game) => game.title === "Alpha")).toMatchObject({
      ...artwork,
      steamAppId: "10",
      ludusaviGameName: "Alpha",
    });
    expect(
      result.snapshot.games.find((game) => game.title === "Beta")?.coverUrl,
    ).toBeNull();
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
