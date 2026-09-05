import { Modal } from "../Modal";
import type { LibraryGame, LibrarySnapshot } from "@launcher/core";
import { FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { Plus } from "@phosphor-icons/react/Plus";
import { X } from "@phosphor-icons/react/X";
import { Button } from "../Button";
import { useEditGameModal } from "./EditGameModal.hook";

export function EditGameModal({
  game,
  onClose,
  onUpdated,
}: Readonly<{
  game: LibraryGame;
  onClose: () => void;
  onUpdated: (snapshot: LibrarySnapshot) => void;
}>) {
  const {
    title,
    setTitle,
    executablePath,
    setExecutablePath,
    hours,
    setHours,
    steamAppId,
    setSteamAppId,
    ludusaviName,
    setLudusaviName,
    ludusaviMatches,
    saving,
    error,
    chooseExecutable,
    chooseLudusavi,
    save,
  } = useEditGameModal({ game, onClose, onUpdated });

  return (
    <Modal
      title="Editar ficha"
      subtitle="JUEGO LOCAL"
      icon={<PencilSimple />}
      busy={saving}
      size="standard"
      tone="neutral"
      onClose={onClose}
      actions={
        <>
          <Button disabled={saving} onClick={onClose} variant="secondary">
            Cancelar
          </Button>
          <Button disabled={saving} onClick={save} variant="primary">
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </>
      }
    >
      <div
        className={
          "edit-game-fields [display:grid] [gap:18px] [padding:25px_24px] [&_label_em]:[margin-left:5px] [&_label_em]:[color:#626571] [&_label_em]:[font-size:9px] [&_label_em]:[font-style:normal] [&_label_em]:[font-weight:500] [&_label_em]:[text-transform:uppercase] [&_label_>_span]:[display:block] [&_label_>_span]:[margin:0_0_8px_2px] [&_label_>_span]:[color:#989ba5] [&_label_>_span]:[font-size:11px] [&_label_>_span]:[font-weight:600] [&_input]:[width:100%] [&_input]:[height:44px] [&_input]:[border:1px_solid_#ffffff14] [&_input]:[border-radius:10px] [&_input]:[outline:none] [&_input]:[padding:0_12px] [&_input]:[background:#090a0fa3] [&_input]:[color:white] [&_input:focus]:[border-color:#a9fb766b] [&_input:focus]:[box-shadow:0_0_0_3px_#a9fb760d] [&_>_p]:[margin:-4px_0_0] [&_>_p]:[color:#696c77] [&_>_p]:[font-size:11px] [&_>_p]:[line-height:1.5] [&_input:focus]:[border-color:color-mix(in_srgb,_var(--accent-a)_42%,_transparent)] [&_input:focus]:[box-shadow:0_0_0_3px_color-mix(in_srgb,_var(--accent-a)_5%,_transparent)]"
        }
      >
        <label>
          <span>Nombre</span>
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          <span>
            Ejecutable <em>Opcional</em>
          </span>
          <div
            className={
              "file-field [display:grid] [grid-template-columns:minmax(0,_1fr)_auto_auto] [gap:8px] [&_button]:[display:flex] [&_button]:[align-items:center] [&_button]:[gap:7px] [&_button]:[border:1px_solid_#ffffff16] [&_button]:[border-radius:10px] [&_button]:[padding:0_13px] [&_button]:[background:#ffffff08] [&_button]:[cursor:pointer]"
            }
          >
            <input
              readOnly
              value={executablePath}
              placeholder="Sin ejecutable configurado"
            />
            <button onClick={chooseExecutable}>
              <FolderOpen /> Examinar
            </button>
            {executablePath && (
              <button
                className={"clear-file [color:#e49096]"}
                onClick={() => setExecutablePath("")}
              >
                <X /> Quitar
              </button>
            )}
          </div>
        </label>
        <label className={"game-name-field [position:relative]"}>
          <span>
            Juego en Ludusavi <em>Opcional</em>
          </span>
          <input
            value={ludusaviName}
            onChange={(event) => setLudusaviName(event.target.value)}
            placeholder="Buscar asociación o dejar vacío"
          />
          {ludusaviMatches.length > 0 && (
            <div
              className={
                "ludusavi-results [position:absolute] [z-index:8] [top:72px] [right:0] [left:0] [overflow:auto] [max-height:240px] [border:1px_solid_#ffffff18] [border-radius:11px] [padding:6px] [background:#171821] [box-shadow:0_18px_45px_#0009] [&_>_small]:[display:block] [&_>_small]:[padding:10px] [&_>_small]:[color:#737783] [&_>_small]:[font-size:10px] [&_>_button]:[cursor:pointer] [&_>_button:hover]:[background:#a9fb760d] [&_>_button:hover]:[color:#a9fb76] [&_b]:[display:block] [&_small]:[display:block] [&_b]:[font-size:10px] [&_small]:[margin-top:3px] [&_small]:[color:#6f737e] [&_small]:[font-size:8px] [&_>_button:hover]:[color:var(--accent-a)]"
              }
            >
              {ludusaviMatches.map((item) => (
                <button
                  type="button"
                  key={item.name}
                  onClick={() => chooseLudusavi(item)}
                >
                  <span>
                    <b>{item.name}</b>
                    <small>
                      {item.steamAppId ? `Steam ${item.steamAppId}` : "Ludusavi"}
                    </small>
                  </span>
                  <Plus />
                </button>
              ))}
            </div>
          )}
        </label>
        <label>
          <span>
            Steam AppID <em>Para logros locales</em>
          </span>
          <input
            inputMode="numeric"
            value={steamAppId}
            onChange={(event) => setSteamAppId(event.target.value.replace(/\D/g, ""))}
            placeholder="Ej. 1238840"
          />
        </label>
        <label>
          <span>Horas acumuladas</span>
          <div
            className={
              "hours-field [position:relative] [&_input]:[padding-right:65px] [&_b]:[position:absolute] [&_b]:[right:13px] [&_b]:[top:14px] [&_b]:[color:#6e717c] [&_b]:[font-size:11px] [&_b]:[font-weight:500]"
            }
          >
            <input
              inputMode="decimal"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
            />
            <b>horas</b>
          </div>
        </label>
        <p>
          La asociación de Ludusavi localiza las partidas; el AppID permite leer logros
          locales.
        </p>
      </div>
      {error && (
        <div
          role="alert"
          className={
            "modal-error [margin:0_24px_16px] [padding:10px_12px] [border-radius:9px] [background:#ff6f7912] [color:#ff9299] [font-size:12px]"
          }
        >
          {error}
        </div>
      )}
    </Modal>
  );
}
