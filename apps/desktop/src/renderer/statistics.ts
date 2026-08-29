import type { GameSession, LibraryGame } from "@launcher/core";

export interface MonthlyActivity {
  month: number;
  entries: Array<{ game: LibraryGame; seconds: number }>;
}

export function buildMonthlyActivity(games: LibraryGame[], sessions: GameSession[], year: number): MonthlyActivity[] {
  const gamesById = new Map(games.map((game) => [game.id, game]));
  const activityByMonth = Array.from({ length: 12 }, () => new Map<string, { launcherSeconds: number; steamSeconds: number }>());

  for (const session of sessions) {
    const date = new Date(session.endedAt);
    if (date.getFullYear() !== year) continue;
    const activity = activityByMonth[date.getMonth()]!;
    const previous = activity.get(session.gameId) ?? { launcherSeconds: 0, steamSeconds: 0 };
    if (session.origin === "steam-sync") previous.steamSeconds += session.durationSeconds;
    else previous.launcherSeconds += session.durationSeconds;
    activity.set(session.gameId, previous);
  }

  for (const game of games) {
    if (!game.lastPlayedAt) continue;
    const date = new Date(game.lastPlayedAt);
    if (date.getFullYear() === year && !activityByMonth[date.getMonth()]!.has(game.id)) {
      activityByMonth[date.getMonth()]!.set(game.id, { launcherSeconds: 0, steamSeconds: 0 });
    }
  }

  return activityByMonth.map((activity, month) => ({
    month,
    entries: [...activity.entries()]
      .flatMap(([gameId, data]) => {
        const game = gamesById.get(gameId);
        return game ? [{ game, seconds: Math.max(data.launcherSeconds, data.steamSeconds) }] : [];
      })
      .sort((a, b) => b.seconds - a.seconds || a.game.title.localeCompare(b.game.title)),
  }));
}
