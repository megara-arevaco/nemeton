import type { LibraryGame, LibrarySnapshot } from "@launcher/core";
import { FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { Plus } from "@phosphor-icons/react/Plus";
import { X } from "@phosphor-icons/react/X";
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
    <div
      className={
        "modal-backdrop [position:fixed] [z-index:50] [inset:0] [display:grid] [place-items:center] [padding:28px] [background:#050609c7] [backdrop-filter:blur(12px)] [-webkit-app-region:no-drag]"
      }
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className={
          "edit-game-modal [width:min(650px,_94vw)] [overflow:hidden] [border:1px_solid_#ffffff17] [border-radius:22px] [background:#12131b] [box-shadow:0_30px_100px_#0000008a] [&_>_header]:[display:flex] [&_>_header]:[justify-content:space-between] [&_>_header]:[align-items:center] [&_>_header]:[padding:22px_24px] [&_>_header]:[border-bottom:1px_solid_#ffffff0d] [&_>_header_>_div]:[display:flex] [&_>_header_>_div]:[align-items:center] [&_>_header_>_div]:[gap:12px] [&_>_header_small]:[display:block] [&_>_header_small]:[margin:0] [&_>_header_h2]:[display:block] [&_>_header_h2]:[margin:0] [&_>_header_small]:[color:#696c78] [&_>_header_small]:[font-size:9px] [&_>_header_small]:[font-weight:700] [&_>_header_small]:[letter-spacing:1.3px] [&_>_header_h2]:[margin-top:3px] [&_>_header_h2]:[font-size:18px] [&_>_header_>_button]:[display:grid] [&_>_header_>_button]:[place-items:center] [&_>_header_>_button]:[width:34px] [&_>_header_>_button]:[height:34px] [&_>_header_>_button]:[border:0] [&_>_header_>_button]:[border-radius:9px] [&_>_header_>_button]:[background:#ffffff08] [&_>_header_>_button]:[color:#8b8e99] [&_>_header_>_button]:[cursor:pointer] [&_.file-field]:[grid-template-columns:minmax(0,_1fr)_auto_auto] [&_>_footer]:[display:flex] [&_>_footer]:[justify-content:flex-end] [&_>_footer]:[gap:9px] [&_>_footer]:[height:auto] [&_>_footer]:[padding:17px_24px] [&_>_footer]:[border-top:1px_solid_#ffffff0d] [&_>_footer]:[color:inherit]"
        }
        role="dialog"
        aria-modal="true"
      >
        <header>
          <div>
            <span
              className={
                "section-icon [display:grid] [place-items:center] [width:38px] [height:38px] [border-radius:11px] [background:#a9fb7615] [color:#a9fb76]"
              }
            >
              <PencilSimple />
            </span>
            <span>
              <small>JUEGO LOCAL</small>
              <h2>Editar ficha</h2>
            </span>
          </div>
          <button onClick={onClose}>
            <X />
          </button>
        </header>
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
                "file-field [display:grid] [grid-template-columns:minmax(0,_1fr)_auto] [gap:8px] [&_button]:[display:flex] [&_button]:[align-items:center] [&_button]:[gap:7px] [&_button]:[border:1px_solid_#ffffff16] [&_button]:[border-radius:10px] [&_button]:[padding:0_13px] [&_button]:[background:#ffffff08] [&_button]:[cursor:pointer]"
              }
            >
              <input
                readOnly
                value={executablePath}
                placeholder="Sin ejecutable configurado"
              />
              <button onClick={() => chooseExecutable()}>
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
                        {item.steamAppId
                          ? `Steam ${item.steamAppId}`
                          : "Ludusavi"}
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
              onChange={(event) =>
                setSteamAppId(event.target.value.replace(/\D/g, ""))
              }
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
            La asociación de Ludusavi localiza las partidas; el AppID permite
            leer logros locales.
          </p>
        </div>
        {error && (
          <div
            className={
              "modal-error [margin:0_24px_16px] [padding:10px_12px] [border-radius:9px] [background:#ff6f7912] [color:#ff9299] [font-size:12px]"
            }
          >
            {error}
          </div>
        )}
        <footer>
          <button
            className={
              "cancel-button [border:1px_solid_#ffffff14] [border-radius:11px] [padding:11px_17px] [background:transparent] [color:#a2a4ad] [cursor:pointer]"
            }
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className={
              "play [background:linear-gradient(135deg,_var(--accent-a),_var(--accent-b))] [color:var(--accent-ink)] [box-shadow:0_12px_40px_color-mix(in_srgb,_var(--accent-a)_15%,_transparent)] [&:disabled]:[filter:grayscale(1)] [&:disabled]:[opacity:.45] [&:disabled]:[cursor:default] [&.running]:[filter:none] [&.running]:[opacity:1] [&.running]:[background:#a9fb7617] [&.running]:[color:#a9fb76] [&.running]:[box-shadow:inset_0_0_0_1px_#a9fb7640,_0_0_30px_#83ef8412] [&.running:disabled]:[filter:none] [&.running:disabled]:[opacity:1] [&.running:disabled]:[background:#a9fb7617] [&.running:disabled]:[color:#a9fb76] [&.running:disabled]:[box-shadow:inset_0_0_0_1px_#a9fb7640,_0_0_30px_#83ef8412] [&.running]:[background:color-mix(in_srgb,_var(--accent-a)_9%,_transparent)] [&.running]:[color:var(--accent-a)] [&.running]:[box-shadow:inset_0_0_0_1px_color-mix(in_srgb,_var(--accent-a)_25%,_transparent)] [&.running:disabled]:[background:color-mix(in_srgb,_var(--accent-a)_9%,_transparent)] [&.running:disabled]:[color:var(--accent-a)] [&.running:disabled]:[box-shadow:inset_0_0_0_1px_color-mix(in_srgb,_var(--accent-a)_25%,_transparent)]"
            }
            disabled={saving}
            onClick={() => save()}
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </footer>
      </section>
    </div>
  );
}
