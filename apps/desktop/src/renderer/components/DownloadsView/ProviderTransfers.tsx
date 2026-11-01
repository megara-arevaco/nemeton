import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "../Button";

export function ProviderTransfers({ hidden = false }: { hidden?: boolean }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const status = useQuery({
    queryKey: ["providers", "status"],
    queryFn: window.launcher.getProviderStates,
    refetchInterval: 2000,
  });
  const operations =
    status.data?.filter(
      (state) => state.operation && state.operation.action !== "launch",
    ) ?? [];

  if (hidden || !operations.length) {
    return null;
  }
  return (
    <section className="downloads-group">
      <h2>{t("providers.transfers")}</h2>
      {error && <p role="alert">{error}</p>}
      {operations.map((state) => (
        <article key={state.provider} className="downloads-job">
          <div className="downloads-row-heading">
            <h3>{t(`stores.${state.provider}`)}</h3>
            <span>{t(`providers.action.${state.operation!.action}`)}</span>
          </div>
          <progress
            max={100}
            value={state.operation!.progress ?? undefined}
            aria-label={t("providers.transferProgress", {
              store: t(`stores.${state.provider}`),
            })}
          />
          <div className="downloads-actions">
            <Button
              size="small"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await window.launcher.cancelProviderTransfer(state.provider);
                  await client.invalidateQueries({ queryKey: ["providers", "status"] });
                } catch {
                  setError(t("providers.failed"));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("downloads.cancel")}
            </Button>
          </div>
        </article>
      ))}
    </section>
  );
}
