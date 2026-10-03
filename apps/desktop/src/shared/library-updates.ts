import type { LibraryGame, LibrarySnapshot, GameSession } from "@launcher/core";

export type PublishedLibrary = LibrarySnapshot & { revision: number };

export interface LibraryChange {
  revision: number;
  baseRevision: number;
  games: LibraryGame[];
  removedGameIds: string[];
  sessions: GameSession[];
  removedSessionIds: string[];
  sessionOrder?: string[];
  excludedGameKeys: string[];
}

function changes<T extends { id: string }>(previous: T[], next: T[]) {
  const before = new Map(previous.map((item) => [item.id, JSON.stringify(item)]));
  const changed: T[] = [];

  for (const item of next) {
    if (before.get(item.id) !== JSON.stringify(item)) {
      changed.push(item);
    }
    before.delete(item.id);
  }
  return { changed, removed: [...before.keys()] };
}

export function libraryChange(
  previous: PublishedLibrary,
  next: LibrarySnapshot,
): LibraryChange | null {
  const games = changes(previous.games, next.games);
  const sessions = changes(previous.sessions, next.sessions);
  const excludedGameKeys = next.excludedGameKeys ?? [];
  const removed = new Set(sessions.removed);
  const existingIds = new Set(previous.sessions.map((session) => session.id));
  const expectedOrder = [
    ...previous.sessions
      .filter((session) => !removed.has(session.id))
      .map((session) => session.id),
    ...sessions.changed
      .filter((session) => !existingIds.has(session.id))
      .map((session) => session.id),
  ];
  const nextOrder = next.sessions.map((session) => session.id);
  const sessionOrder = expectedOrder.some((id, index) => id !== nextOrder[index])
    ? nextOrder
    : undefined;

  if (
    !sessionOrder &&
    !games.changed.length &&
    !games.removed.length &&
    !sessions.changed.length &&
    !sessions.removed.length &&
    JSON.stringify(previous.excludedGameKeys ?? []) === JSON.stringify(excludedGameKeys)
  ) {
    return null;
  }
  return {
    revision: previous.revision + 1,
    baseRevision: previous.revision,
    games: games.changed,
    removedGameIds: games.removed,
    sessions: sessions.changed,
    removedSessionIds: sessions.removed,
    sessionOrder,
    excludedGameKeys,
  };
}

export function applyLibraryChange(
  previous: LibrarySnapshot & { revision?: number },
  change: LibraryChange,
): PublishedLibrary | null {
  if (previous.revision !== change.baseRevision) {
    return null;
  }

  const games = new Map(previous.games.map((game) => [game.id, game]));
  const sessions = new Map(previous.sessions.map((session) => [session.id, session]));

  for (const id of change.removedGameIds) {
    games.delete(id);
  }
  for (const id of change.removedSessionIds) {
    sessions.delete(id);
  }
  for (const game of change.games) {
    games.set(game.id, game);
  }
  for (const session of change.sessions) {
    sessions.set(session.id, session);
  }
  return {
    version: 1,
    revision: change.revision,
    games:
      change.games.length || change.removedGameIds.length
        ? [...games.values()].sort((a, b) => a.title.localeCompare(b.title))
        : previous.games,
    sessions: change.sessionOrder
      ? change.sessionOrder.map((id) => sessions.get(id)!).filter(Boolean)
      : change.sessions.length || change.removedSessionIds.length
        ? [...sessions.values()]
        : previous.sessions,
    excludedGameKeys: change.excludedGameKeys,
  };
}
