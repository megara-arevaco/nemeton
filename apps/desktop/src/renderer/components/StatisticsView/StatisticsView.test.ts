import assert from "node:assert/strict";
import test from "node:test";
import type { GameSession, LibraryGame } from "@launcher/core";
import { buildMonthlyActivity } from "./StatisticsView.hook";

const game = (id: string, title: string): LibraryGame => ({
  id,
  title,
  source: "local",
  sourceId: id,
  installPath: "",
  launchUri: null,
  coverPath: null,
  coverUrl: null,
  heroUrl: null,
  installed: true,
  hiddenFromLibrary: false,
  playtimeMinutes: 0,
  trackedPlaytimeSeconds: 0,
  playtimeSecondsRemainder: 0,
  platformPlaytimeMinutes: null,
  lastPlayedAt: null,
  importedAt: "2026-01-01T00:00:00.000Z",
  steamAppId: null,
  ludusaviGameName: null,
});

test("agrupa las sesiones en una sola estructura mensual y evita sumar fuentes duplicadas", () => {
  const games = [game("a", "A"), game("b", "B")];
  const sessions = [
    {
      gameId: "a",
      origin: "launcher",
      endedAt: "2026-02-01T12:00:00.000Z",
      durationSeconds: 120,
    },
    {
      gameId: "a",
      origin: "steam-sync",
      endedAt: "2026-02-02T12:00:00.000Z",
      durationSeconds: 300,
    },
    {
      gameId: "b",
      origin: "launcher",
      endedAt: "2025-02-01T12:00:00.000Z",
      durationSeconds: 900,
    },
  ] as GameSession[];

  const months = buildMonthlyActivity(games, sessions, 2026);
  assert.equal(months.length, 12);
  assert.deepEqual(
    months[1]!.entries.map(({ game: item, seconds }) => [item.id, seconds]),
    [["a", 300]],
  );
});

test("ignora sesiones cuyo juego ya no existe", () => {
  const sessions = [
    {
      gameId: "missing",
      origin: "launcher",
      endedAt: "2026-01-01T12:00:00.000Z",
      durationSeconds: 60,
    },
  ] as GameSession[];
  assert.deepEqual(buildMonthlyActivity([], sessions, 2026)[0]!.entries, []);
});
