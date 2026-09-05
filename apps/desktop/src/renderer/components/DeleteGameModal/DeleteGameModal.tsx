import { Button } from "../Button";
import { Modal } from "../Modal";
import type { LibraryGame } from "@launcher/core";
import { Trash } from "@phosphor-icons/react/Trash";
import { Warning } from "@phosphor-icons/react/Warning";
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
  const { confirmation, setConfirmation, confirmed, confirmDeletion, submitDeletion } =
    useDeleteGameModal(game.title, onConfirm, deleting);

  return (
    <Modal
      title="Eliminar para siempre"
      subtitle="ACCIÓN IRREVERSIBLE"
      icon={<Trash weight="fill" />}
      busy={deleting}
      size="compact"
      tone="danger"
      onClose={onClose}
      actions={
        <>
          <Button disabled={deleting} onClick={onClose} variant="secondary">
            Cancelar
          </Button>
          <Button
            disabled={!confirmed || deleting}
            onClick={confirmDeletion}
            variant="danger"
          >
            {deleting ? "Eliminando…" : "Eliminar definitivamente"}
          </Button>
        </>
      }
    >
      <form
        className={
          "[display:grid] [gap:17px] [padding:24px] [&_p]:[margin:0] [&_p]:[color:#9a9ca6] [&_p]:[font-size:12px] [&_p]:[line-height:1.55] [&_strong]:[color:#f0f1f3] [&_label_>_span]:[display:block] [&_label_>_span]:[margin-bottom:8px] [&_label_>_span]:[color:#a6a8b0] [&_label_>_span]:[font-size:11px] [&_input]:[width:100%] [&_input]:[height:44px] [&_input]:[border:1px_solid_#ffffff18] [&_input]:[border-radius:10px] [&_input]:[outline:none] [&_input]:[padding:0_12px] [&_input]:[background:#090a0fa3] [&_input]:[color:white] [&_input:focus]:[border-color:#ff747c75] [&_input:focus]:[box-shadow:0_0_0_3px_#ff747c12]"
        }
        onSubmit={submitDeletion}
      >
        <div
          className={
            "[display:grid] [grid-template-columns:34px_minmax(0,_1fr)] [gap:11px] [padding:13px] [border:1px_solid_#ff747c20] [border-radius:12px] [background:#ff747c0a] [color:#ff9299] [&_svg]:[width:22px] [&_svg]:[height:22px]"
          }
        >
          <Warning weight="fill" />
          <p>
            Se borrarán de Nemeton la ficha, estadísticas, sesiones, logros, carátulas y
            copias de partidas. No se eliminarán la instalación ni las partidas
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
            role="alert"
            className={
              "[padding:10px_12px] [border-radius:9px] [background:#ff6f7912] [color:#ff9299] [font-size:12px]"
            }
          >
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
