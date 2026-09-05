import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  AchievementCatalogue,
  mergeAchievementCatalogue,
} from "./achievement-catalogue.js";
import { AchievementService } from "./achievements.js";
import type { LibraryGame } from "@launcher/core";

const entries = [
  {
    name: "THEONCEANDFUTUREKING",
    displayName: "The Once and Future King",
    description: "Description",
    icon: "https://example.com/icon.png",
    icongray: "https://example.com/locked.png",
    hidden: 0,
  },
  { name: "OTHER", displayName: "Other", hidden: 1 },
];

const local = {
  total: 1,
  unlocked: 1,
  totalKnown: false,
  items: [
    {
      id: "theOnceAndFutureKing",
      name: "theOnceAndFutureKing",
      description: "",
      imageUrl: null,
      achieved: true,
      unlockedAt: "2026-09-04T20:33:34.000Z",
      globalPercentage: null,
      hidden: false,
    },
  ],
};

test("catalogue adds locked achievements and metadata without changing local IDs or unlock times", () => {
  const result = mergeAchievementCatalogue(local, entries);
  assert.equal(result.total, 2);
  assert.equal(result.unlocked, 1);
  assert.equal(result.totalKnown, true);
  assert.equal(result.items[0].id, local.items[0].id);
  assert.equal(result.items[0].name, "The Once and Future King");
  assert.equal(result.items[0].unlockedAt, local.items[0].unlockedAt);
  assert.equal(result.items[0].imageUrl, entries[0].icon);
  assert.equal(result.items[1].achieved, false);
  assert.equal(result.items[1].hidden, true);
});

test("unmatched local unlocks survive an incomplete catalogue", () => {
  const result = mergeAchievementCatalogue(local, [entries[1]]);
  assert.equal(result.totalKnown, false);
  assert.equal(result.unlocked, 1);
  assert.equal(result.items[0].id, local.items[0].id);
});

test("catalogue deduplicates requests and persists across service instances without persisting credentials", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nemeton-catalogue-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let requests = 0;
  const fetcher: typeof fetch = async (url, init) => {
    requests++;
    assert.ok(!String(url).includes("secret"));
    assert.equal(new Headers(init?.headers).get("x-webapi-key"), "secret");
    return Response.json({ game: { availableGameStats: { achievements: entries } } });
  };
  const service = new AchievementCatalogue(directory, async () => "secret", fetcher);
  const result = await Promise.all([service.get("1466060"), service.get("1466060")]);
  assert.deepEqual(result[0], entries);
  assert.equal(requests, 1);
  const offline = new AchievementCatalogue(
    directory,
    async () => {
      throw Error("Should use cache");
    },
    fetcher,
  );
  assert.deepEqual(await offline.get("1466060"), entries);
  assert.equal(requests, 1);
  const file = path.join(directory, "1466060-spanish.json");
  assert.ok(!(await fs.readFile(file, "utf8")).includes("secret"));
  await fs.writeFile(file, JSON.stringify({ fetchedAt: 0, entries }));
  let failures = 0;
  const failing = new AchievementCatalogue(
    directory,
    async () => "secret",
    async () => {
      failures++;
      return new Response(null, { status: 403 });
    },
  );
  assert.deepEqual(await failing.get("1466060"), entries);
  assert.deepEqual(await failing.get("1466060"), entries);
  assert.equal(failures, 1);
});

test("missing credentials and malformed Steam responses retain local progress", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nemeton-catalogue-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const missing = new AchievementCatalogue(
    directory,
    async () => null,
    async () => {
      throw Error("No request expected");
    },
  );
  assert.equal(await missing.get("1466060"), null);
  const malformed = new AchievementCatalogue(
    directory,
    async () => "secret",
    async () =>
      Response.json({
        game: { availableGameStats: { achievements: [{ name: 123 }] } },
      }),
  );
  assert.equal(await malformed.get("1466060"), null);
  assert.equal(await malformed.get("../bad"), null);
});

test("history enrichment preserves detection date and does not duplicate unlocked achievements", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nemeton-history-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const service = new AchievementService(path.join(directory, "history.json"));
  const game = { sourceId: "local-game" } as LibraryGame;
  await service.record(game, local);
  const original = await service.readHistory();
  await service.record(game, mergeAchievementCatalogue(local, entries));
  const updated = await service.readHistory();
  assert.equal(updated.length, 1);
  assert.equal(updated[0].name, "The Once and Future King");
  assert.equal(updated[0].detectedAt, original[0].detectedAt);
  assert.equal(updated[0].unlockedAt, original[0].unlockedAt);
});
