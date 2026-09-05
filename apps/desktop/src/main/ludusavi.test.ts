import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { LudusaviCatalog } from "./ludusavi.js";
import { parseManifest } from "./ludusavi-parser.js";
import { fetchLimitedText } from "./network.js";

test("returns stale cached games while a single refresh remains pending", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "nemeton-catalog-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const cache = path.join(root, "catalog.json");
  await fs.writeFile(
    cache,
    JSON.stringify({
      updatedAt: "2000-01-01T00:00:00.000Z",
      games: [{ name: "Cached Game", steamAppId: "1", files: [] }],
    }),
  );
  let downloads = 0;
  const catalog = new LudusaviCatalog(
    cache,
    () => {
      downloads++;
      return new Promise(() => {});
    },
    async (text) => parseManifest(text),
  );
  assert.equal(downloads, 0);
  const results = await Promise.all([
    catalog.search("Cached"),
    catalog.find("Cached Game"),
  ]);
  assert.equal(results[0][0]?.name, "Cached Game");
  assert.equal(results[1]?.name, "Cached Game");
  assert.equal(downloads, 1);
});

test("parses quoted titles, AppIDs and save/config tags", () => {
  const result = parseManifest(
    '"Example: Game":\n  steam:\n    id: 123\n  files:\n    "<home>/save":\n      tags: [save, config]\n',
  );
  assert.deepEqual(result, [
    {
      name: "Example: Game",
      steamAppId: "123",
      files: [{ path: "<home>/save", tags: ["save", "config"] }],
    },
  ]);
  assert.throws(() => parseManifest("- invalid\n"));
});

test("bounds a download without trusting Content-Length", async () => {
  await assert.rejects(
    () =>
      fetchLimitedText("https://example.com", async () => new Response("oversized"), 4),
    /tamaño/,
  );
});
