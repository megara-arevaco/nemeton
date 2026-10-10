import { NemetonMark } from "../NemetonMark";
import { useTranslation } from "react-i18next";
import "./LoadingState.css";

export function LoadingState({
  variant = "view",
  label,
}: Readonly<{
  variant?: "view" | "panel" | "overlay" | "startup";
  label?: string;
}>) {
  const { t } = useTranslation();
  return (
    <div
      className={`nemeton-loading nemeton-loading--${variant}`}
      role="status"
      aria-live="polite"
    >
      <div className="nemeton-loading__content">
        <div className="nemeton-loading__emblem" aria-hidden="true">
          <span className="nemeton-loading__orbit" />
          <span className="nemeton-loading__core">
            <NemetonMark />
          </span>
        </div>
        <div className="nemeton-loading__copy">
          <span className="nemeton-loading__eyebrow">
            {variant === "startup" ? "NEMETON" : t("loading.wait")}
          </span>
          <span className="nemeton-loading__label">{label ?? t("loading.default")}</span>
        </div>
      </div>
    </div>
  );
}
