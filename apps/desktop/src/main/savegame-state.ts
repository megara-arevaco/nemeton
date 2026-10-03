import fs from "node:fs/promises";
import type { MainContext } from "./context.js";
import type { SavegameState } from "../shared/savegames.js";

const resolveSavegameSyncState = ({
  syncConfigured,
  hasMissingPaths,
  hasPaths,
  hasVersions,
  synchronized,
  hasConflict,
}: {
  syncConfigured: boolean;
  hasMissingPaths: boolean;
  hasPaths: boolean;
  hasVersions: boolean;
  synchronized: boolean;
  hasConflict: boolean;
}) => {
  if (!syncConfigured) {
    return "unconfigured";
  }
  if (hasMissingPaths) {
    return "path-missing";
  }
  if (!hasPaths) {
    return "not-detected";
  }
  if (!hasVersions) {
    return "waiting-backup";
  }
  if (synchronized) {
    return "synced";
  }
  return hasConflict ? "conflict" : "pending";
};

export async function readSavegameState(
  {
    store,
    settingsStore,
    savegameManager,
    ludusaviCatalog,
  }: Pick<
    MainContext,
    "store" | "settingsStore" | "savegameManager" | "ludusaviCatalog"
  >,
  gameId: string,
  discover = false,
  getRoamingAppData: () => Promise<string> = async () =>
    (await import("./platform.js")).getRoamingAppData(),
): Promise<SavegameState> {
  const game = await store.getGame(gameId);

  if (!game || game.source !== "local") {
    throw new Error(
      "Las partidas sincronizadas solo están disponibles para juegos manuales",
    );
  }

  const settings = await settingsStore.read();
  let paths = discover
    ? await savegameManager.removeInstallRoot(gameId, game.installPath)
    : await savegameManager.getPaths(gameId);
  const ludusavi =
    discover && game.ludusaviGameName
      ? await ludusaviCatalog.find(game.ludusaviGameName)
      : null;
  const policy = await savegameManager.getPolicy(gameId);
  const suggestions = discover
    ? await savegameManager.suggestPaths(
        game.title,
        await getRoamingAppData(),
        game.installPath,
        game.steamAppId,
        ludusavi,
        policy.includeConfig,
        false,
      )
    : [];

  for (const suggestion of suggestions.filter(
    (item) => item.confidence === "high" && !paths.includes(item.path),
  )) {
    paths = await savegameManager.addPath(gameId, suggestion.path);
  }

  const versions = settings.syncFolderPath
    ? await savegameManager.listVersions(settings.syncFolderPath, game.sourceId)
    : [];
  const missingPaths = (
    await Promise.all(
      paths.map(async (folderPath) => ({
        folderPath,
        exists: Boolean((await fs.stat(folderPath).catch(() => null))?.isDirectory()),
      })),
    )
  )
    .filter((item) => !item.exists)
    .map((item) => item.folderPath);
  const synchronized = false;
  const conflict = null;
  const syncState = resolveSavegameSyncState({
    syncConfigured: Boolean(settings.syncFolderPath),
    hasMissingPaths: missingPaths.length > 0,
    hasPaths: paths.length > 0,
    hasVersions: versions.length > 0,
    synchronized,
    hasConflict: Boolean(conflict),
  });
  return {
    paths,
    suggestions: suggestions.filter((item) => !paths.includes(item.path)),
    versions,
    policy,
    syncConfigured: Boolean(settings.syncFolderPath),
    syncState: syncState === "pending" ? "checking" : syncState,
    missingPaths,
    conflict: null,
  };
}
