import { Component, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../Button";

function Recovery() {
  const { t } = useTranslation();
  return (
    <main className="app-recovery">
      <h1>{t("recovery.interfaceTitle")}</h1>
      <p>{t("recovery.interfaceHelp")}</p>
      <div>
        <Button variant="primary" onClick={() => window.location.reload()}>
          {t("recovery.reload")}
        </Button>
        <Button
          onClick={() =>
            void window.launcher.exportDiagnostics().catch(() => undefined)
          }
        >
          {t("diagnostics.export")}
        </Button>
      </div>
    </main>
  );
}

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <Recovery /> : this.props.children;
  }
}
