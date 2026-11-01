import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { SteamAccountSettings } from "@launcher/core";
import { Button } from "../Button";
import { queryKeys } from "../../queries/queryKeys";

export function SteamAccountTools({
  settings,
  onChoose,
}: {
  settings: SteamAccountSettings | null;
  onChoose: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="steam-account-tools">
      {Boolean(settings?.accounts?.length) && (
        <label>
          {t("steam.localAccount")}
          <select
            defaultValue=""
            onChange={(event) => {
              if (event.target.value) {
                onChoose(event.target.value);
              }
            }}
          >
            <option value="">{t("steam.chooseAccount")}</option>
            {settings?.accounts?.map((account) => (
              <option key={account.steamId} value={account.steamId}>
                {account.name} · {account.steamId}
              </option>
            ))}
          </select>
        </label>
      )}
      {settings?.lastSyncedAt && (
        <p>
          {t("providers.lastSync", {
            date: new Date(settings.lastSyncedAt).toLocaleString(i18n.language),
          })}
        </p>
      )}
      {settings?.hasApiKey && settings.persistentApiKey === false && (
        <p>{t("providers.sessionOnly")}</p>
      )}
      {settings?.hasApiKey && (
        <Button
          size="small"
          variant="ghost"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const result = await window.launcher.disconnectSteam();
              client.setQueryData(queryKeys.steamSettings, result);
            } catch {
              setError(t("providers.failed"));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("steam.disconnect")}
        </Button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
