import { BrowserWindow, dialog, type WebContents } from "electron";
import type { MainContext } from "./context.js";
import { savegameStorageKey } from "../shared/game-identity.js";
import { getSavegamePathContext, toLinuxPath } from "./platform.js";

type RestoreContext = Pick<
  MainContext,
  | "awaitStartupRecovery"
  | "store"
  | "settingsStore"
  | "savegameManager"
  | "broadcastSavegameChanged"
>;

/** Share destination review and the safety backup between manual and pre-launch restore. */
export async function restoreSavegameWithReview(
  context: RestoreContext,
  sender: WebContents,
  gameId: string,
  versionId: string,
  requireLatest = false,
) {
  const { savegameManager: manager } = context;
  await context.awaitStartupRecovery();
  const game = await context.store.getGame(gameId);
  const settings = await context.settingsStore.read();

  if (!game || !settings.syncFolderPath) {
    throw new Error("No se puede restaurar esta copia");
  }

  const syncFolder = settings.syncFolderPath;
  const sourceId = savegameStorageKey(game);
  manager.setPathContext(gameId, await getSavegamePathContext(game));
  const version = (await manager.listVersions(syncFolder, sourceId)).find(
    (item) => item.id === versionId,
  );

  if (!version) {
    throw new Error("No se encontró la copia seleccionada");
  }

  const plan = await manager.getRestorePlan(gameId, sourceId, syncFolder, versionId);
  const window = BrowserWindow.fromWebContents(sender)!;
  const selections: Record<string, string> = {};

  for (const entry of plan) {
    if (entry.destination) {
      selections[entry.id] = entry.destination;
      continue;
    }
    if (entry.suggestion) {
      const choice = await dialog.showMessageBox(window, {
        type: "question",
        title: "Destino de las partidas en este equipo",
        message: `¿Usar este destino para ${game.title}?`,
        detail: `${entry.label}\n→ ${entry.suggestion}\nSe creará la carpeta si todavía no existe. Nemeton recordará esta asociación en este equipo.`,
        buttons: ["Cancelar", "Usar este destino", "Elegir otra carpeta"],
        defaultId: 0,
        cancelId: 0,
      });

      if (choice.response === 0) {
        return null;
      }
      if (choice.response === 1) {
        selections[entry.id] = entry.suggestion;
        continue;
      }
    }

    const selected = await dialog.showOpenDialog(window, {
      title: `Destino local para ${game.title}: ${entry.label}`,
      properties: ["openDirectory", "createDirectory"],
    });

    if (selected.canceled || !selected.filePaths[0]) {
      return null;
    }
    selections[entry.id] = toLinuxPath(selected.filePaths[0]);
  }

  const policy = await manager.getPolicy(gameId);
  const response = await dialog.showMessageBox(window, {
    type: "warning",
    buttons: ["Cancelar", "Restaurar"],
    defaultId: 0,
    cancelId: 0,
    title: "Restaurar partidas",
    message: `¿Restaurar esta versión de ${game.title}?`,
    detail: `${version.fileCount} archivos · creada ${new Date(version.createdAt).toLocaleString("es-ES")} · ${version.deviceName}.\n${plan.map((entry) => `${entry.label} → ${selections[entry.id]}`).join("\n")}\nAntes se copiará el estado presente.${policy.exactRestore ? " Se eliminarán los archivos adicionales en los destinos de esta copia." : " Los archivos adicionales se conservarán."}`,
  });

  if (response.response !== 1) {
    return null;
  }
  try {
    if (
      requireLatest &&
      (await manager.listVersions(syncFolder, sourceId))[0]?.id !== versionId
    ) {
      throw new Error(
        "Ha llegado otra copia mientras elegías el destino. Vuelve a comprobar las partidas antes de jugar.",
      );
    }
    await manager.bindRestoreDestinations(
      gameId,
      sourceId,
      syncFolder,
      versionId,
      selections,
    );
    const safety = await manager.backupWithOutcome(
      gameId,
      sourceId,
      syncFolder,
      versionId,
    );
    const restored = await manager.restore(gameId, sourceId, syncFolder, versionId);

    if (requireLatest) {
      const latest = (await manager.listVersions(syncFolder, sourceId)).find(
        (entry) => entry.id !== safety?.id,
      );

      if (latest && latest.id !== versionId) {
        throw new Error(
          "Ha llegado otra copia durante la restauración. Comprueba las partidas antes de jugar; se conserva la copia del estado anterior.",
        );
      }
    }
    return restored;
  } finally {
    context.broadcastSavegameChanged(gameId);
  }
}
