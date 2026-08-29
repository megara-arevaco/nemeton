import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LibraryStore } from "./library.js";

test("adds a local game only once and keeps a stable id", async (context) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "launcher-library-"));
  context.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const store = new LibraryStore(path.join(directory, "library.json"));
  const input = { title: "Example", executablePath: path.join(directory, "game.exe") };

  const first = await store.addLocal(input);
  const second = await store.addLocal(input);

  assert.equal(second.games.length, 1);
  assert.equal(second.games[0]?.id, first.games[0]?.id);
});

test("carries partial minutes between play sessions", async (context) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "launcher-playtime-"));
  context.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const store = new LibraryStore(path.join(directory, "library.json"));
  const snapshot = await store.addLocal({ title: "Example", executablePath: "/games/example" });
  const gameId = snapshot.games[0]!.id;

  await store.addPlaytime(gameId, 35);
  const result = await store.addPlaytime(gameId, 40);

  assert.equal(result.games[0]?.playtimeMinutes, 1);
  assert.equal(result.games[0]?.playtimeSecondsRemainder, 15);
  assert.ok(result.games[0]?.lastPlayedAt);
});

test("keeps a local placeholder editable without an executable", async (context) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "launcher-placeholder-"));
  context.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const store = new LibraryStore(path.join(directory, "library.json"));
  const created = await store.addLocal({ title: "Backlog game", executablePath: "" });
  const gameId = created.games[0]!.id;

  const updated = await store.updateLocalGame(gameId, {
    title: "Backlog game edited",
    executablePath: "",
    playtimeMinutes: 150,
  });

  assert.equal(updated.games[0]?.installed, false);
  assert.equal(updated.games[0]?.title, "Backlog game edited");
  assert.equal(updated.games[0]?.trackedPlaytimeSeconds, 9_000);
});

test("records only Steam playtime gained after the initial account baseline", async (context) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "launcher-steam-history-"));
  context.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const store = new LibraryStore(path.join(directory, "library.json"));
  const lastPlayedAt = "2026-08-20T18:00:00.000Z";

  const baseline = await store.importSteamAccount([{ appId: "123", title: "Example", playtimeMinutes: 100, lastPlayedAt }]);
  assert.equal(baseline.sessions.length, 0);

  const updated = await store.importSteamAccount([{ appId: "123", title: "Example", playtimeMinutes: 145, lastPlayedAt }]);
  assert.equal(updated.sessions.length, 1);
  assert.equal(updated.sessions[0]?.durationSeconds, 45 * 60);
  assert.equal(updated.sessions[0]?.origin, "steam-sync");

  const unchanged = await store.importSteamAccount([{ appId: "123", title: "Example", playtimeMinutes: 145, lastPlayedAt }]);
  assert.equal(unchanged.sessions.length, 1);
});

test("filters Steamworks redistributables from the library", async (context) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "launcher-steam-filter-"));
  context.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const store = new LibraryStore(path.join(directory, "library.json"));

  const snapshot = await store.importSteamAccount([
    { appId: "228980", title: "Steamworks Common Redistributables", playtimeMinutes: 10, lastPlayedAt: null },
    { appId: "123", title: "Real game", playtimeMinutes: 20, lastPlayedAt: null },
  ]);

  assert.deepEqual(snapshot.games.map((game) => game.sourceId), ["123"]);
});

test("hides a game without deleting its history", async (context) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "launcher-hide-game-"));
  context.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const store = new LibraryStore(path.join(directory, "library.json"));
  const created = await store.addLocal({ title: "Example", executablePath: "/games/example" });
  const gameId = created.games[0]!.id;
  await store.addPlaytime(gameId, 120);

  const hidden = await store.hideFromLibrary(gameId);

  assert.equal(hidden.games[0]?.hiddenFromLibrary, true);
  assert.equal(hidden.games[0]?.trackedPlaytimeSeconds, 120);
  assert.equal(hidden.sessions.length, 1);
  assert.equal(hidden.sessions[0]?.gameId, gameId);
});

test("merges remote manual history without copying another device executable", async (context) => {
  const firstDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "launcher-sync-first-"));
  const secondDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "launcher-sync-second-"));
  context.after(() => Promise.all([firstDirectory, secondDirectory].map((directory) => fs.promises.rm(directory, { recursive: true, force: true }))));
  const first = new LibraryStore(path.join(firstDirectory, "library.json"));
  const second = new LibraryStore(path.join(secondDirectory, "library.json"));
  const created = await first.addLocal({ title: "Example", executablePath: "/first/game.exe", coverUrl: "https://example.com/cover.jpg" });
  await first.addPlaytime(created.games[0]!.id, 90);

  const remote = await first.exportManualHistory();
  assert.equal(remote.games[0]?.installPath, "");
  const merged = await second.mergeRemoteManual(remote);

  assert.equal(merged.games[0]?.title, "Example");
  assert.equal(merged.games[0]?.installPath, "");
  assert.equal(merged.games[0]?.installed, false);
  assert.equal(merged.games[0]?.coverUrl, "https://example.com/cover.jpg");
  assert.equal(merged.sessions.length, 1);
});

test("keeps newer local artwork when an older remote snapshot arrives", async (context) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "launcher-sync-artwork-"));
  context.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const store = new LibraryStore(path.join(directory, "library.json"));
  const created = await store.addLocal({ title: "Example", executablePath: "/games/example" });
  const staleRemote = await store.exportManualHistory();

  await store.setRemoteArtwork(created.games[0]!.id, { coverUrl: "https://example.com/new-cover.jpg", heroUrl: "https://example.com/new-hero.jpg" });
  const merged = await store.mergeRemoteManual(staleRemote);

  assert.equal(merged.games[0]?.coverUrl, "https://example.com/new-cover.jpg");
  assert.equal(merged.games[0]?.heroUrl, "https://example.com/new-hero.jpg");
});
