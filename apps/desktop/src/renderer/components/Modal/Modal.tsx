import type { ReactNode } from "react";
import { X } from "@phosphor-icons/react/X";
import { Button } from "../Button";
import { useModal } from "./Modal.hook";

interface ModalProps {
  title: string;
  subtitle: string;
  icon: ReactNode;
  children: ReactNode;
  actions: ReactNode;
  onClose: () => void;
  busy?: boolean;
  size?: "compact" | "standard" | "wide";
  tone?: "neutral" | "danger";
}

export function Modal({
  title,
  subtitle,
  icon,
  children,
  actions,
  onClose,
  busy = false,
  size = "standard",
  tone = "neutral",
}: Readonly<ModalProps>) {
  const { dialogRef, titleId, cancel, dismissBackdrop } = useModal(busy, onClose);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-busy={busy}
      closedby={busy ? "none" : "closerequest"}
      data-size={size}
      data-tone={tone}
      className="modal [margin:auto] [padding:0] [width:650px] [max-width:calc(100vw_-_48px)] [max-height:calc(100dvh_-_48px)] [overflow:hidden] [border:1px_solid_var(--border-default)] [border-radius:22px] [background:var(--surface-card)] [color:var(--text-primary)] [box-shadow:0_30px_100px_#0000008a] [-webkit-app-region:no-drag] [&[open]]:[display:flex] [flex-direction:column] [&[data-size=compact]]:[width:520px] [&[data-size=wide]]:[width:820px] [&[data-tone=danger]]:[border-color:#ff747c2e] [&::backdrop]:[background:#050609d9]"
      onCancel={cancel}
      onMouseDown={dismissBackdrop}
    >
      <header className="[display:flex] [flex-shrink:0] [justify-content:space-between] [align-items:center] [gap:16px] [padding:22px_24px] [border-bottom:1px_solid_var(--border-subtle)]">
        <div className="[display:flex] [align-items:center] [gap:12px] [min-width:0]">
          <span
            data-tone={tone}
            className="[display:grid] [place-items:center] [flex-shrink:0] [width:38px] [height:38px] [border-radius:11px] [background:color-mix(in_srgb,_var(--accent-a)_10%,_transparent)] [color:var(--accent-a)] [&[data-tone=danger]]:[background:#ff727d14] [&[data-tone=danger]]:[color:#ff858d] [&_svg]:[width:20px] [&_svg]:[height:20px]"
          >
            {icon}
          </span>
          <div className="[min-width:0]">
            <small className="[display:block] [margin:0_0_3px] [color:var(--text-muted)] [font-size:9px] [font-weight:700] [letter-spacing:1.3px]">
              {subtitle}
            </small>
            <h2
              id={titleId}
              className="[margin:0] [font-size:18px] [overflow-wrap:anywhere]"
            >
              {title}
            </h2>
          </div>
        </div>
        <Button
          aria-label="Cerrar"
          disabled={busy}
          onClick={onClose}
          variant="ghost"
          size="small"
          className="[flex-shrink:0] [width:36px] [padding:0]"
        >
          <X />
        </Button>
      </header>
      <div className="modal-content [min-height:0] [overflow-y:auto] [overscroll-behavior:contain]">
        {children}
      </div>
      <footer className="modal-actions [display:flex] [flex-shrink:0] [flex-wrap:wrap] [justify-content:flex-end] [align-items:center] [gap:9px] [height:auto] [padding:24px_16px] [border-top:1px_solid_var(--border-subtle)] [color:inherit] [&_button]:[min-height:44px]">
        {actions}
      </footer>
    </dialog>
  );
}
