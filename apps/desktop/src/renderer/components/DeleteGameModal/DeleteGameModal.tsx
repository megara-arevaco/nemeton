import type { LibraryGame } from "@launcher/core";
import { Trash } from "@phosphor-icons/react/Trash";
import { Warning } from "@phosphor-icons/react/Warning";
import { X } from "@phosphor-icons/react/X";
import { useDeleteGameModal } from "./DeleteGameModal.hook";

export function DeleteGameModal({
  game,
  deleting,
  error,
  onClose,
  onConfirm,
}: Readonly<{
  game: LibraryGame;
  deleting: boolean;
  error: string;
  onClose: () => void;
  onConfirm: (confirmation: string) => void;
}>) {
  const { confirmation, setConfirmation, confirmed, confirmDeletion } =
    useDeleteGameModal(game.title, onConfirm);

  return (
    <div
      className={
        "modal-backdrop [position:fixed] [z-index:90] [inset:0] [display:grid] [place-items:center] [padding:28px] [background:#050609d9] [backdrop-filter:blur(12px)] [-webkit-app-region:no-drag]"
      }
      onMouseDown={(event) => {
        if (!deleting && event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <section
        aria-labelledby="delete-game-title"
        aria-modal="true"
        className={
          "delete-game-modal [width:min(520px,_94vw)] [overflow:hidden] [border:1px_solid_#ff747c2e] [border-radius:22px] [background:#13131b] [box-shadow:0_30px_100px_#000000a3] [&_>_header]:[display:flex] [&_>_header]:[justify-content:space-between] [&_>_header]:[align-items:center] [&_>_header]:[padding:22px_24px] [&_>_header]:[border-bottom:1px_solid_#ffffff0d] [&_>_header_>_div]:[display:flex] [&_>_header_>_div]:[align-items:center] [&_>_header_>_div]:[gap:12px] [&_>_header_small]:[display:block] [&_>_header_small]:[color:#e5838a] [&_>_header_small]:[font-size:9px] [&_>_header_small]:[font-weight:750] [&_>_header_small]:[letter-spacing:1.3px] [&_>_header_h2]:[margin:3px_0_0] [&_>_header_h2]:[font-size:18px] [&_>_header_>_button]:[display:grid] [&_>_header_>_button]:[place-items:center] [&_>_header_>_button]:[width:34px] [&_>_header_>_button]:[height:34px] [&_>_header_>_button]:[border:0] [&_>_header_>_button]:[border-radius:9px] [&_>_header_>_button]:[background:#ffffff08] [&_>_header_>_button]:[color:#8b8e99] [&_>_header_>_button]:[cursor:pointer] [&_>_footer]:[display:flex] [&_>_footer]:[justify-content:flex-end] [&_>_footer]:[gap:9px] [&_>_footer]:[padding:17px_24px] [&_>_footer]:[border-top:1px_solid_#ffffff0d]"
        }
        role="dialog"
      >
        <header>
          <div>
            <span
              className={
                "[display:grid] [place-items:center] [width:38px] [height:38px] [border-radius:11px] [background:#ff727d14] [color:#ff858d] [&_svg]:[width:20px] [&_svg]:[height:20px]"
              }
            >
              <Trash weight="fill" />
            </span>
            <span>
              <small>ACCIÓN IRREVERSIBLE</small>
              <h2 id="delete-game-title">Eliminar para siempre</h2>
            </span>
          </div>
          <button aria-label="Cerrar" disabled={deleting} onClick={onClose}>
            <X />
          </button>
        </header>
        <form
          className={
            "[display:grid] [gap:17px] [padding:24px] [&_p]:[margin:0] [&_p]:[color:#9a9ca6] [&_p]:[font-size:12px] [&_p]:[line-height:1.55] [&_strong]:[color:#f0f1f3] [&_label_>_span]:[display:block] [&_label_>_span]:[margin-bottom:8px] [&_label_>_span]:[color:#a6a8b0] [&_label_>_span]:[font-size:11px] [&_input]:[width:100%] [&_input]:[height:44px] [&_input]:[border:1px_solid_#ffffff18] [&_input]:[border-radius:10px] [&_input]:[outline:none] [&_input]:[padding:0_12px] [&_input]:[background:#090a0fa3] [&_input]:[color:white] [&_input:focus]:[border-color:#ff747c75] [&_input:focus]:[box-shadow:0_0_0_3px_#ff747c12]"
          }
          onSubmit={(event) => {
            event.preventDefault();
            confirmDeletion();
          }}
        >
          <div
            className={
              "[display:grid] [grid-template-columns:34px_minmax(0,_1fr)] [gap:11px] [padding:13px] [border:1px_solid_#ff747c20] [border-radius:12px] [background:#ff747c0a] [color:#ff9299] [&_svg]:[width:22px] [&_svg]:[height:22px]"
            }
          >
            <Warning weight="fill" />
            <p>
              Se borrarán de Nemeton la ficha, estadísticas, sesiones, logros, carátulas
              y copias de partidas. No se eliminarán la instalación ni las partidas
              originales.
            </p>
          </div>
          <p>
            Escribe <strong>{game.title}</strong> para confirmar.
          </p>
          <label>
            <span>Nombre del juego</span>
            <input
              autoFocus
              autoComplete="off"
              disabled={deleting}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
          {error && (
            <div
              className={
                "[padding:10px_12px] [border-radius:9px] [background:#ff6f7912] [color:#ff9299] [font-size:12px]"
              }
            >
              {error}
            </div>
          )}
        </form>
        <footer>
          <button
            className={
              "[border:1px_solid_#ffffff14] [border-radius:11px] [padding:11px_17px] [background:transparent] [color:#a2a4ad] [cursor:pointer]"
            }
            disabled={deleting}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className={
              "[border:0] [border-radius:11px] [padding:11px_17px] [background:#e85f68] [color:white] [font-weight:700] [cursor:pointer] [&:disabled]:[opacity:.4] [&:disabled]:[cursor:default]"
            }
            disabled={!confirmed || deleting}
            onClick={confirmDeletion}
          >
            {deleting ? "Eliminando…" : "Eliminar definitivamente"}
          </button>
        </footer>
      </section>
    </div>
  );
}
