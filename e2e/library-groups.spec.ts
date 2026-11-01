import { buildCurrentActivity } from "../apps/desktop/src/renderer/components/StatisticsView/StatisticsView.hook";
import { groupLibrarySessions } from "../packages/core/src/library/groups";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { LibraryStore } from "../packages/core/src/library/store";
import {
  groupLibraryGames,
  reconcilePlatformPlaytime,
} from "../packages/core/src/library/groups";
import { fetchOwnedSteamGames } from "../packages/core/src/steam/account";

async function temporaryStore(action: (store: LibraryStore) => Promise<void>) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nemeton-copies-"));

  try {
    await action(new LibraryStore(path.join(directory, "library.json")));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test("store totals sum across explicit copies and grouping is reversible", async () => {
  await temporaryStore(async (store) => {
    await store.importSteamAccount([
      { appId: "10", title: "Game", playtimeMinutes: 1200, lastPlayedAt: null },
    ]);
    await store.importProviderGames("epic", [
      {
        id: "epic_game",
        title: "Game Deluxe",
        installPath: "",
        coverUrl: null,
        playtimeMinutes: 480,
      },
    ]);
    const snapshot = await store.importProviderGames("gog", [
      {
        id: "123",
        title: "Game",
        installPath: "",
        coverUrl: null,
        playtimeMinutes: 300,
      },
    ]);
    expect(groupLibraryGames(snapshot.games)).toHaveLength(3);
    const ids = snapshot.games.map((game) => game.id);
    const linked = await store.linkCopies(ids, ids[0]);
    const group = groupLibraryGames(linked.games)[0];
    expect(group.copies).toHaveLength(3);
    expect(group.totalSeconds).toBe(33 * 3600);
    expect(group.historyComplete).toBe(true);
    expect(linked.games).toHaveLength(3);
    const separated = await store.linkCopies([ids[1]], null);
    expect(groupLibraryGames(separated.games)).toHaveLength(2);
    expect(separated.games.reduce((sum, game) => sum + game.playtimeMinutes, 0)).toBe(
      33 * 60,
    );
  });
});

test("provider refresh acknowledges locally tracked sessions without adding them twice", async () => {
  await temporaryStore(async (store) => {
    let snapshot = await store.importSteamAccount([
      { appId: "10", title: "Game", playtimeMinutes: 100, lastPlayedAt: null },
    ]);
    const id = snapshot.games[0].id;
    await store.addPlaytime(id, 300);
    snapshot = await store.importSteamAccount([
      { appId: "10", title: "Game", playtimeMinutes: 105, lastPlayedAt: null },
    ]);
    expect(snapshot.games[0].playtimeMinutes).toBe(105);
    expect(snapshot.sessions).toHaveLength(1);
    expect(snapshot.games[0].platformCreditedSeconds).toBe(300);
    snapshot = await store.importSteamAccount([
      { appId: "10", title: "Game", playtimeMinutes: 106, lastPlayedAt: null },
    ]);
    expect(snapshot.games[0].playtimeMinutes).toBe(106);
    expect(snapshot.sessions).toHaveLength(2);
    expect(snapshot.sessions[1].durationSeconds).toBe(60);
    const repeated = await store.importSteamAccount([
      { appId: "10", title: "Game", playtimeMinutes: 106, lastPlayedAt: null },
    ]);
    expect(repeated.sessions).toHaveLength(2);
    expect(repeated.games[0].playtimeMinutes).toBe(106);
    expect(reconcilePlatformPlaytime(repeated.games[0], 90).playtimeMinutes).toBe(106);
  });
});

test("unknown store history stays explicitly partial and refresh preserves copy identity", async () => {
  await temporaryStore(async (store) => {
    let snapshot = await store.importProviderGames("epic", [
      { id: "one", title: "Same title", installPath: "", coverUrl: null },
      { id: "two", title: "Same title", installPath: "", coverUrl: null },
    ]);
    expect(groupLibraryGames(snapshot.games)).toHaveLength(2);
    await store.linkCopies(
      snapshot.games.map((game) => game.id),
      snapshot.games[0].id,
    );
    await store.organizeGame(snapshot.games[0].id, {
      tags: ["RPG"],
      collections: ["Weekend"],
    });
    snapshot = await store.importProviderGames("epic", [
      { id: "one", title: "Same title", installPath: "", coverUrl: null },
    ]);
    const group = groupLibraryGames(snapshot.games)[0];
    expect(group.copies).toHaveLength(2);
    expect(group.historyComplete).toBe(false);
    expect(snapshot.games.find((game) => game.sourceId === "one")?.tags).toEqual([
      "RPG",
    ]);
  });
});

test("Steam privacy failures are distinct from explicitly empty libraries", async () => {
  const original = globalThis.fetch;

  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ response: {} }));
    await expect(
      fetchOwnedSteamGames("a".repeat(32), "76561198000000000"),
    ).rejects.toThrow(/privacidad/);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ response: { game_count: 0 } }));
    expect(await fetchOwnedSteamGames("a".repeat(32), "76561198000000000")).toEqual([]);
  } finally {
    globalThis.fetch = original;
  }
});

test("period statistics add distinct store copies while reconciling legacy overlap within each copy", async () => {
  await temporaryStore(async (store) => {
    let snapshot = await store.importSteamAccount([
      { appId: "10", title: "Game", playtimeMinutes: 100, lastPlayedAt: null },
    ]);
    snapshot = await store.importProviderGames("epic", [
      { id: "epic", title: "Game", installPath: "", coverUrl: null },
    ]);
    const steam = snapshot.games.find((game) => game.source === "steam")!;
    const epic = snapshot.games.find((game) => game.source === "epic")!;
    snapshot = await store.linkCopies([steam.id, epic.id], steam.id);
    const groups = groupLibraryGames(snapshot.games);
    const endedAt = new Date().toISOString();
    const sessions = groupLibrarySessions(groups, [
      {
        id: "steam-local",
        gameId: steam.id,
        startedAt: endedAt,
        endedAt,
        durationSeconds: 600,
        origin: "launcher",
      },
      {
        id: "steam-legacy",
        gameId: steam.id,
        startedAt: endedAt,
        endedAt,
        durationSeconds: 600,
        origin: "steam-sync",
      },
      {
        id: "steam-external",
        gameId: steam.id,
        startedAt: endedAt,
        endedAt,
        durationSeconds: 60,
        origin: "provider-sync",
      },
      {
        id: "epic-local",
        gameId: epic.id,
        startedAt: endedAt,
        endedAt,
        durationSeconds: 300,
        origin: "launcher",
      },
    ]);
    const activity = buildCurrentActivity(
      groups.map((group) => group.game),
      sessions,
      "week",
      new Date(),
    );
    expect(activity.ranking.reduce((sum, item) => sum + item.seconds, 0)).toBe(960);
  });
});

test("history first discovered after offline tracking stays partial instead of claiming exact overlap", async () => {
  await temporaryStore(async (store) => {
    let snapshot = await store.importProviderGames("gog", [
      { id: "10", title: "Game", installPath: "", coverUrl: null },
    ]);
    await store.addPlaytime(snapshot.games[0].id, 300);
    snapshot = await store.importProviderGames("gog", [
      { id: "10", title: "Game", installPath: "", coverUrl: null, playtimeMinutes: 10 },
    ]);
    const group = groupLibraryGames(snapshot.games)[0];
    expect(group.historyComplete).toBe(false);
    expect(group.game.playtimeMinutes).toBe(10);
    expect(snapshot.sessions).toHaveLength(1);
    expect(snapshot.games[0].playtimeOverlapUnknown).toBe(true);
  });
});
