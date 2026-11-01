import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { LibraryGame } from "@launcher/core";
import type { ProviderOperation } from "../../../shared/providers";
import { Button } from "../Button";

export function ProviderActions({ game }: { game: LibraryGame }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const status = useQuery({
    queryKey: ["providers", "status"],
    queryFn: window.launcher.getProviderStates,
    refetchInterval: 2000,
  });
  const state = status.data?.find((item) => item.provider === game.source);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (action: ProviderOperation | "import") => {
    setBusy(true);
    setError("");
    try {
      if (action === "import") {
        await window.launcher.importProviderInstallation(game.id);
      } else {
        await window.launcher.operateProviderGame(game.id, action);
      }
      await client.invalidateQueries({ queryKey: ["providers", "status"] });
    } catch {
      setError(t("providers.failed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="game-copies provider-game-actions">
      <h2>{t("providers.installation")}</h2>
      {!state?.connected && <p>{t("providers.connectInSettings")}</p>}
      <div className="provider-actions">
        {game.installed ? (
          <>
            <Button
              disabled={busy || Boolean(state?.operation) || !state?.connected}
              onClick={() => void run("update")}
            >
              {t("providers.action.update")}
            </Button>
            <Button
              disabled={busy || Boolean(state?.operation) || !state?.connected}
              onClick={() => void run("verify")}
            >
              {t("providers.action.verify")}
            </Button>
          </>
        ) : (
          <Button
            disabled={busy || Boolean(state?.operation) || !state?.helperPath}
            onClick={() => void run("import")}
          >
            {t("providers.importInstalled")}
          </Button>
        )}
      </div>
      {state?.operation?.gameId === game.id && (
        <p role="status">
          {t(`providers.action.${state.operation.action}`)}
          {state.operation.progress !== null &&
            ` · ${Math.floor(state.operation.progress)} %`}
        </p>
      )}
      {(error || state?.error) && <p role="alert">{error || t("providers.failed")}</p>}
    </section>
  );
}
