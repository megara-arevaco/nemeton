import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppUpdateState } from "../../../shared/app-updates";
import { Button } from "../Button";

export function AppUpdates() {
  const { t } = useTranslation();
  const [state, setState] = useState<AppUpdateState | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const unsubscribe = window.launcher.onAppUpdateChanged((next) => {
      receivedEvent = true;
      if (active) {
        setState(next);
      }
    });
    void window.launcher
      .getAppUpdateState()
      .then((next) => {
        if (active && !receivedEvent) {
          setState(next);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
        }
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError(false);
    try {
      await operation();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const working =
    busy || state?.status === "checking" || state?.status === "downloading";
  return (
    <section className="settings-card [max-width:850px] [margin-top:16px]">
      <h2>{t("updates.title")}</h2>
      <p>{t("updates.description")}</p>
      {state && <p>{t("updates.version", { version: state.currentVersion })}</p>}
      <p aria-live="polite" aria-atomic="true">
        {error
          ? t("updates.error")
          : state
            ? t(`updates.${state.status}`, {
                version: state.availableVersion,
                progress: state.progress,
              })
            : t("updates.loading")}
      </p>
      {state?.reason && <p>{t(`updates.reason.${state.reason}`)}</p>}
      <div className="[display:flex] [flex-wrap:wrap] [gap:12px]">
        {state && !state.reason && state.status !== "downloaded" && (
          <Button
            variant="secondary"
            disabled={working}
            onClick={() => void run(() => window.launcher.checkAppUpdates())}
          >
            {t("updates.check")}
          </Button>
        )}
        {state?.status === "available" && (
          <Button
            variant="primary"
            disabled={working}
            onClick={() => void run(() => window.launcher.downloadAppUpdate())}
          >
            {t("updates.download")}
          </Button>
        )}
        {state?.status === "downloaded" && (
          <Button
            variant="primary"
            disabled={working}
            onClick={() => void run(() => window.launcher.installAppUpdate())}
          >
            {t("updates.install")}
          </Button>
        )}
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void run(() => window.launcher.openAppRelease())}
        >
          {t("updates.releases")}
        </Button>
      </div>
    </section>
  );
}
