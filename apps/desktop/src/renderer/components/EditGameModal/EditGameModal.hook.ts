import { useDeferredValue, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { LibraryGame, LibrarySnapshot } from "@launcher/core";
import { useLudusaviQuery } from "../../queries/game.queries";

type LudusaviMatch = Awaited<
  ReturnType<Window["launcher"]["searchLudusavi"]>
>[number];

export interface EditGameModalOptions {
  game: LibraryGame;
  onClose: () => void;
  onUpdated: (snapshot: LibrarySnapshot) => void;
}

export function useEditGameModal({
  game,
  onClose,
  onUpdated,
}: EditGameModalOptions) {
  const [title, setTitle] = useState(game.title);
  const [executablePath, setExecutablePath] = useState(game.installPath);
  const [hours, setHours] = useState(
    String(Math.round((game.trackedPlaytimeSeconds / 3600) * 100) / 100),
  );
  const [steamAppId, setSteamAppId] = useState(game.steamAppId ?? "");
  const [ludusaviName, setLudusaviName] = useState(game.ludusaviGameName ?? "");
  const [error, setError] = useState("");
  const deferredLudusaviName = useDeferredValue(ludusaviName);
  const ludusaviQuery = useLudusaviQuery(
    deferredLudusaviName,
    ludusaviName !== game.ludusaviGameName,
  );
  const updateGameMutation = useMutation({
    mutationFn: (input: Parameters<Window["launcher"]["updateLocalGame"]>[1]) =>
      window.launcher.updateLocalGame(game.id, input),
  });
  const chooseExecutable = async () => {
    const result = await window.launcher.selectExecutable();
    if (result) {
      setExecutablePath(result.path);
    }
  };
  const chooseLudusavi = (item: LudusaviMatch) => {
    setLudusaviName(item.name);

    if (item.steamAppId) {
      setSteamAppId(item.steamAppId);
    }
  };
  const save = async () => {
    const numericHours = Number(hours.replace(",", "."));
    if (!title.trim()) {
      setError("Escribe un nombre");
      return;
    }
    if (!Number.isFinite(numericHours) || numericHours < 0) {
      setError("Introduce unas horas válidas");
      return;
    }

    try {
      const snapshot = await updateGameMutation.mutateAsync({
        title,
        executablePath,
        playtimeMinutes: numericHours * 60,
        steamAppId,
        ludusaviGameName: ludusaviName,
      });
      onUpdated(snapshot);
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "No se pudo actualizar",
      );
    }
  };
  return {
    title,
    setTitle,
    executablePath,
    setExecutablePath,
    hours,
    setHours,
    steamAppId,
    setSteamAppId,
    ludusaviName,
    setLudusaviName,
    ludusaviMatches: ludusaviQuery.data ?? [],
    saving: updateGameMutation.isPending,
    error,
    chooseExecutable,
    chooseLudusavi,
    save,
  };
}
