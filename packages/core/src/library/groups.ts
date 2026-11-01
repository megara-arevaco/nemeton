import type { LibraryGame, GameSession } from "../shared/types.js";

export const copyPlaytimeSeconds = (game: LibraryGame): number =>
  Math.max(0, game.playtimeMinutes * 60 + (game.playtimeSecondsRemainder ?? 0));

/** Reconcile provider increments against locally recorded time before adding history. */
export function reconcilePlatformPlaytime(
  game: LibraryGame | undefined,
  minutes: number,
) {
  const previous = game?.platformPlaytimeMinutes ?? 0;
  const platformMinutes = Math.max(
    previous,
    Number.isFinite(minutes) ? Math.max(0, minutes) : 0,
  );
  const tracked = game?.trackedPlaytimeSeconds ?? 0;
  const credited =
    game?.platformCreditedSeconds ??
    Math.max(
      0,
      tracked - Math.max(0, (game ? copyPlaytimeSeconds(game) : 0) - previous * 60),
    );
  const increase = (platformMinutes - previous) * 60;
  const newlyCredited = Math.min(Math.max(0, tracked - credited), increase);
  const platformCreditedSeconds = credited + newlyCredited;
  const totalSeconds = Math.max(
    game ? copyPlaytimeSeconds(game) : 0,
    platformMinutes * 60 + Math.max(0, tracked - platformCreditedSeconds),
  );
  return {
    platformPlaytimeMinutes: platformMinutes,
    platformCreditedSeconds,
    playtimeMinutes: Math.floor(totalSeconds / 60),
    playtimeSecondsRemainder: totalSeconds % 60,
    playtimeOverlapUnknown:
      game?.playtimeOverlapUnknown === true ||
      (game?.platformPlaytimeMinutes === null && tracked > 0),
    externalSeconds:
      game && game.platformPlaytimeMinutes !== null
        ? Math.max(0, totalSeconds - copyPlaytimeSeconds(game))
        : 0,
  };
}

export interface GameGroup {
  id: string;
  game: LibraryGame;
  copies: LibraryGame[];
  totalSeconds: number;
  historyComplete: boolean;
}

/** Copies are grouped only by an explicit identity, never a fuzzy title match. */
export function groupLibraryGames(games: LibraryGame[]): GameGroup[] {
  const groups = new Map<string, LibraryGame[]>();

  for (const game of games) {
    if (game.hiddenFromLibrary) {
      continue;
    }

    const key = game.canonicalId ?? game.id;
    const copies = groups.get(key) ?? [];
    copies.push(game);
    groups.set(key, copies);
  }
  return [...groups.entries()]
    .map(([id, copies]) => {
      const ordered = [...copies].sort(
        (a, b) => a.importedAt.localeCompare(b.importedAt) || a.id.localeCompare(b.id),
      );
      const representative = ordered[0]!;
      const totalSeconds = copies.reduce(
        (total, copy) => total + copyPlaytimeSeconds(copy),
        0,
      );
      const lastPlayedAt =
        copies
          .map((copy) => copy.lastPlayedAt)
          .filter((date): date is string => Boolean(date))
          .sort()
          .at(-1) ?? null;
      return {
        id,
        copies: ordered,
        totalSeconds,
        historyComplete: copies.every(
          (copy) =>
            copy.source === "local" ||
            (copy.platformPlaytimeMinutes !== null && !copy.playtimeOverlapUnknown),
        ),
        game: {
          ...representative,
          installed: copies.some((copy) => copy.installed),
          playtimeMinutes: Math.floor(totalSeconds / 60),
          playtimeSecondsRemainder: totalSeconds % 60,
          platformPlaytimeMinutes: null,
          lastPlayedAt,
          favorite: copies.some((copy) => copy.favorite),
          tags: [...new Set(copies.flatMap((copy) => copy.tags ?? []))],
          collections: [...new Set(copies.flatMap((copy) => copy.collections ?? []))],
        },
      };
    })
    .sort((a, b) => a.game.title.localeCompare(b.game.title));
}

export function groupLibrarySessions(
  groups: GameGroup[],
  sessions: GameSession[],
): GameSession[] {
  const identities = new Map(
    groups.flatMap((group) =>
      group.copies.map((copy) => [copy.id, group.game.id] as const),
    ),
  );
  return sessions.map((session) => ({
    ...session,
    copyId: session.copyId ?? session.gameId,
    gameId: identities.get(session.gameId) ?? session.gameId,
  }));
}
