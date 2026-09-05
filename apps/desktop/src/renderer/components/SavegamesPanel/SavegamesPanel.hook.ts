import { useState } from "react";
import type { LibraryGame } from "@launcher/core";
import {
  useBackupSavegamesMutation,
  useChooseSavegameFolderMutation,
  useRestoreSavegamesMutation,
  useSavegamesQuery,
} from "../../queries/game.queries";

export function useSavegamesPanel(game: LibraryGame) {
  const [status, setStatus] = useState("");
  const savegamesQuery = useSavegamesQuery(game.id);
  const backupMutation = useBackupSavegamesMutation(game.id);
  const chooseFolderMutation = useChooseSavegameFolderMutation(game.id);
  const restoreMutation = useRestoreSavegamesMutation(game.id);
  const data = savegamesQuery.data ?? null;
  const busy =
    backupMutation.isPending ||
    chooseFolderMutation.isPending ||
    restoreMutation.isPending;

  const run = async (action: () => Promise<unknown>, successMessage: string) => {
    setStatus("");

    try {
      await action();
      setStatus(successMessage);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "No se pudo completar la operación",
      );
    }
  };

  const errorMessage = savegamesQuery.error
    ? savegamesQuery.error instanceof Error
      ? savegamesQuery.error.message
      : "No se pudieron cargar las partidas"
    : "";

  const copy = !data
    ? {
        title: "Comprobando partidas…",
        detail: "Revisando las rutas y la última copia.",
        tone: "checking",
      }
    : data.syncState === "synced"
      ? {
          title: "Partidas sincronizadas",
          detail: `Todo está protegido · última copia ${new Date(data.versions[0]!.createdAt).toLocaleString("es-ES")}`,
          tone: "ok",
        }
      : data.syncState === "conflict"
        ? {
            title: "Conflicto entre dispositivos",
            detail:
              "Las partidas locales y la última copia remota son diferentes. Elige qué versión quieres continuar.",
            tone: "warning",
          }
        : data.syncState === "unconfigured"
          ? {
              title: "Sincronización sin configurar",
              detail:
                "Elige una carpeta de Google Drive u otro servicio desde Ajustes.",
              tone: "warning",
            }
          : data.syncState === "path-missing"
            ? {
                title: "No se encuentra la carpeta de partidas",
                detail:
                  data.missingPaths[0] ?? "La ubicación configurada ya no existe.",
                tone: "error",
              }
            : data.syncState === "not-detected"
              ? {
                  title: "No se localizaron las partidas",
                  detail:
                    "Juega una vez para que Nemeton intente detectarlas o indica su carpeta.",
                  tone: "warning",
                }
              : data.syncState === "waiting-backup"
                ? {
                    title: "Preparado para sincronizar",
                    detail:
                      "La carpeta de partidas está detectada; falta crear la primera copia.",
                    tone: "warning",
                  }
                : {
                    title: "Hay cambios pendientes",
                    detail:
                      "Las partidas actuales son más recientes que la última copia.",
                    tone: "warning",
                  };
  const conflictCopy = data?.conflict
    ? `La última copia es de ${data.conflict.deviceName} (${new Date(data.conflict.createdAt).toLocaleString("es-ES")}).`
    : "";
  const chooseFolder = () => chooseFolderMutation.mutateAsync(data?.missingPaths ?? []);

  const backup = () => backupMutation.mutateAsync();

  const restoreLatest = () => {
    if (!data?.conflict) {
      return Promise.resolve(null);
    }

    return restoreMutation.mutateAsync(data.conflict.id);
  };

  return {
    loading: savegamesQuery.isPending,
    data,
    busy,
    status: status || errorMessage,
    copy,
    conflictCopy,
    run,
    chooseFolder,
    backup,
    restoreLatest,
  };
}
