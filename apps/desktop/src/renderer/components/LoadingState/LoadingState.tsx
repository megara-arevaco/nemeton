import { NemetonMark } from "../NemetonMark";
import "./LoadingState.css";

export function LoadingState({
  variant = "view",
  label = "Preparando tu espacio",
}: Readonly<{
  variant?: "view" | "panel" | "overlay" | "startup";
  label?: string;
}>) {
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
            {variant === "startup" ? "NEMETON" : "UN MOMENTO"}
          </span>
          <span className="nemeton-loading__label">{label}</span>
        </div>
        <div className="nemeton-loading__track" aria-hidden="true">
          <span />
        </div>
      </div>
    </div>
  );
}
