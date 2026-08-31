import assert from "node:assert/strict";
import test from "node:test";
import { parseSteamGameMetadata } from "./steam.js";
test("parses the public Steam metadata response", () => {
  const metadata = parseSteamGameMetadata("123", {
    123: {
      success: true,
      data: {
        short_description: "Una aventura cooperativa.",
        genres: [{ description: "Acción" }, { description: "Aventura" }],
        developers: ["Estudio Uno"],
        publishers: ["Editora Dos"],
        release_date: { date: "16 OCT 2024" },
        website: "https://example.com/game",
      },
    },
  });

  assert.deepEqual(metadata, {
    appId: "123",
    description: "Una aventura cooperativa.",
    genres: ["Acción", "Aventura"],
    developers: ["Estudio Uno"],
    publishers: ["Editora Dos"],
    releaseDate: "16 OCT 2024",
    website: "https://example.com/game",
  });
});
test("returns null when Steam does not provide a game", () => {
  assert.equal(parseSteamGameMetadata("123", { 123: { success: false } }), null);
});
