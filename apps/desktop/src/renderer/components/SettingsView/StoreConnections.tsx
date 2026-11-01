import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { StoreProvider } from "../../../shared/providers";
import { Button } from "../Button";

export function StoreConnections() {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const states = useQuery({
    queryKey: ["providers", "status"],
    queryFn: window.launcher.getProviderStates,
    refetchInterval: 2000,
  });
  const [codes, setCodes] = useState<Record<StoreProvider, string>>({
    epic: "",
    gog: "",
  });
  const [busy, setBusy] = useState<StoreProvider | null>(null);
  const [error, setError] = useState<{
    provider: StoreProvider;
    message: string;
  } | null>(null);
  const run = async (provider: StoreProvider, operation: () => Promise<unknown>) => {
    setBusy(provider);
    setError(null);
    try {
      await operation();
      await client.invalidateQueries({ queryKey: ["providers", "status"] });
    } catch {
      setError({ provider, message: t("providers.failed") });
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      {states.data?.map((state) => (
        <section className="settings-card store-connection" key={state.provider}>
          <header>
            <div>
              <h2>{t(`stores.${state.provider}`)}</h2>
              <p>{t("providers.description")}</p>
            </div>
            <span>
              {state.connected
                ? (state.username ?? t("settings.connected"))
                : t("settings.notConfigured")}
            </span>
          </header>
          {!state.helperPath ? (
            <div className="provider-setup">
              <p>
                {t("providers.helperRequired", {
                  helper: state.provider === "epic" ? "Legendary" : "gogdl",
                })}
              </p>
              <div className="provider-actions">
                <Button
                  onClick={() =>
                    void run(state.provider, () =>
                      window.launcher.openProviderHelperSite(state.provider),
                    )
                  }
                >
                  {t("providers.getHelper")}
                </Button>
                <Button
                  onClick={() =>
                    void run(state.provider, () =>
                      window.launcher.chooseProviderHelper(state.provider),
                    )
                  }
                >
                  {t("providers.chooseHelper")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {!state.connected ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(state.provider, async () => {
                      const code = codes[state.provider];
                      setCodes((current) => ({ ...current, [state.provider]: "" }));
                      await window.launcher.connectProvider(state.provider, code);
                    });
                  }}
                >
                  <p>{t("providers.loginHelp")}</p>
                  <div className="provider-actions">
                    <Button
                      disabled={busy === state.provider}
                      onClick={() =>
                        void run(state.provider, () =>
                          window.launcher.openProviderLogin(state.provider),
                        )
                      }
                    >
                      {t("providers.openLogin")}
                    </Button>
                    <label>
                      {t("providers.code")}
                      <input
                        type="password"
                        autoComplete="off"
                        value={codes[state.provider]}
                        onChange={(event) =>
                          setCodes((current) => ({
                            ...current,
                            [state.provider]: event.target.value,
                          }))
                        }
                        required
                      />
                    </label>
                    <Button
                      type="submit"
                      variant="primary"
                      loading={busy === state.provider}
                      disabled={!codes[state.provider].trim()}
                    >
                      {t("downloads.connect")}
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="provider-actions">
                    <Button
                      loading={busy === state.provider}
                      disabled={Boolean(state.operation)}
                      onClick={() =>
                        void run(state.provider, () =>
                          window.launcher.refreshProvider(state.provider),
                        )
                      }
                    >
                      {t("providers.refresh")}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy === state.provider || Boolean(state.operation)}
                      onClick={() =>
                        void run(state.provider, () =>
                          window.launcher.disconnectProvider(state.provider),
                        )
                      }
                    >
                      {t("downloads.disconnect")}
                    </Button>
                  </div>
                  {!state.persistentCredentials && (
                    <p className="downloads-hint">{t("providers.sessionOnly")}</p>
                  )}
                </>
              )}
              <details>
                <summary>{t("providers.helperSettings")}</summary>
                <p className="provider-helper-path">{state.helperPath}</p>
                <Button
                  size="small"
                  onClick={() =>
                    void run(state.provider, () =>
                      window.launcher.chooseProviderHelper(state.provider),
                    )
                  }
                >
                  {t("providers.chooseHelper")}
                </Button>
              </details>
            </>
          )}
          {state.lastSyncedAt && (
            <p>
              {t("providers.lastSync", {
                date: new Date(state.lastSyncedAt).toLocaleString(i18n.language),
              })}
            </p>
          )}
          {state.operation && (
            <p role="status">
              {t(`providers.action.${state.operation.action}`)}
              {state.operation.progress !== null &&
                ` · ${Math.floor(state.operation.progress)} %`}
            </p>
          )}
          {(state.error || error?.provider === state.provider) && (
            <p role="alert">
              {error?.provider === state.provider
                ? error.message
                : t(`providers.error.${state.error}`, {
                    defaultValue: t("providers.failed"),
                  })}
            </p>
          )}
        </section>
      ))}
    </>
  );
}
