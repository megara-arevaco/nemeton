import type { LibrarySnapshot } from "@launcher/core";
import { FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { GameController } from "@phosphor-icons/react/GameController";
import { Plus } from "@phosphor-icons/react/Plus";
import { X } from "@phosphor-icons/react/X";
import { Button } from "../Button";
import { LudusaviSuggestions } from "../LudusaviSuggestions";
import { useAddGameModal } from "./AddGameModal.hook";

export function AddGameModal({
  onClose,
  onCreated,
}: Readonly<{
  onClose: () => void;
  onCreated: (snapshot: LibrarySnapshot) => void;
}>) {
  const {
    title,
    executablePath,
    ludusaviSuggestions,
    selectedLudusavi,
    automaticArtwork,
    searchingLudusavi,
    saving,
    error,
    chooseExecutable,
    chooseLudusaviSuggestion,
    clearLudusavi,
    updateTitle,
    createGame,
  } = useAddGameModal({ onClose, onCreated });

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
          "add-game-modal [width:min(780px,_94vw)] [overflow:hidden] [border:1px_solid_#ffffff17] [border-radius:22px] [background:#12131b] [box-shadow:0_30px_100px_#0000008a] [&_>_header]:[display:flex] [&_>_header]:[justify-content:space-between] [&_>_header]:[align-items:center] [&_>_header]:[padding:22px_24px] [&_>_header]:[border-bottom:1px_solid_#ffffff0d] [&_>_header_>_div]:[display:flex] [&_>_header_>_div]:[align-items:center] [&_>_header_>_div]:[gap:12px] [&_>_header_small]:[display:block] [&_>_header_small]:[margin:0] [&_>_header_h2]:[display:block] [&_>_header_h2]:[margin:0] [&_>_header_small]:[margin-bottom:3px] [&_>_header_small]:[color:#696c78] [&_>_header_small]:[font-size:9px] [&_>_header_small]:[font-weight:700] [&_>_header_small]:[letter-spacing:1.3px] [&_>_header_h2]:[font-size:18px] [&_>_header_>_button]:[display:grid] [&_>_header_>_button]:[place-items:center] [&_>_header_>_button]:[width:34px] [&_>_header_>_button]:[height:34px] [&_>_header_>_button]:[border:0] [&_>_header_>_button]:[border-radius:9px] [&_>_header_>_button]:[background:#ffffff08] [&_>_header_>_button]:[color:#8b8e99] [&_>_header_>_button]:[cursor:pointer] [&_>_footer]:[display:flex] [&_>_footer]:[justify-content:flex-end] [&_>_footer]:[gap:9px] [&_>_footer]:[height:auto] [&_>_footer]:[padding:17px_24px] [&_>_footer]:[border-top:1px_solid_#ffffff0d] [&_>_footer]:[color:inherit]"
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-game-title"
      >
        <header>
          <div>
            <span
              className={
                "section-icon [display:grid] [place-items:center] [width:38px] [height:38px] [border-radius:11px] [background:#a9fb7615] [color:#a9fb76]"
              }
            >
              <Plus weight="bold" />
            </span>
            <span>
              <small>BIBLIOTECA LOCAL</small>
              <h2 id="add-game-title">Añadir un juego</h2>
            </span>
          </div>
          <button onClick={onClose} aria-label="Cerrar">
            <X />
          </button>
        </header>
        <div className={"add-game-body [padding:26px_24px]"}>
          <div
            className={
              "game-fields [display:flex] [flex-direction:column] [gap:18px] [padding-top:8px] [&_label_>_span]:[display:block] [&_label_>_span]:[margin:0_0_8px_2px] [&_label_>_span]:[color:#989ba5] [&_label_>_span]:[font-size:11px] [&_label_>_span]:[font-weight:600] [&_label_em]:[margin-left:5px] [&_label_em]:[color:#626571] [&_label_em]:[font-size:9px] [&_label_em]:[font-style:normal] [&_label_em]:[font-weight:500] [&_label_em]:[text-transform:uppercase] [&_input]:[width:100%] [&_input]:[height:44px] [&_input]:[border:1px_solid_#ffffff14] [&_input]:[border-radius:10px] [&_input]:[outline:none] [&_input]:[padding:0_12px] [&_input]:[background:#090a0fa3] [&_input]:[color:white] [&_input:focus]:[border-color:#a9fb766b] [&_input:focus]:[box-shadow:0_0_0_3px_#a9fb760d] [&_input:focus]:[border-color:color-mix(in_srgb,_var(--accent-a)_42%,_transparent)] [&_input:focus]:[box-shadow:0_0_0_3px_color-mix(in_srgb,_var(--accent-a)_5%,_transparent)]"
            }
          >
            <label className={"game-name-field [position:relative]"}>
              <span>Nombre del juego</span>
              <input
                autoFocus
                value={title}
                onChange={(event) => updateTitle(event.target.value)}
                placeholder="Por ejemplo, Hollow Knight"
              />
              {selectedLudusavi ? (
                <div
                  className={
                    "ludusavi-selected [margin-top:7px] [border:1px_solid_#a9fb7625] [background:#a9fb7608] [&_b]:[display:block] [&_small]:[display:block] [&_b]:[font-size:10px] [&_small]:[margin-top:3px] [&_small]:[color:#6f737e] [&_small]:[font-size:8px] [&_>_img]:[width:32px] [&_>_img]:[height:42px] [&_>_img]:[margin-right:9px] [&_>_img]:[border-radius:6px] [&_>_img]:[object-fit:cover] [&_>_button]:[display:grid] [&_>_button]:[place-items:center] [&_>_button]:[border:0] [&_>_button]:[background:transparent] [&_>_button]:[color:#777b85] [&_>_button]:[cursor:pointer]"
                  }
                >
                  {automaticArtwork && <img src={automaticArtwork.coverUrl} alt="" />}
                  <span>
                    <b>{selectedLudusavi.name}</b>
                    <small>
                      {selectedLudusavi.steamAppId
                        ? `Ludusavi · Steam ${selectedLudusavi.steamAppId}`
                        : "Asociado con Ludusavi"}
                      {automaticArtwork ? " · arte completado" : ""}
                    </small>
                  </span>
                  <button type="button" onClick={clearLudusavi}>
                    <X />
                  </button>
                </div>
              ) : searchingLudusavi || ludusaviSuggestions.length > 0 ? (
                <div
                  className={
                    "ludusavi-results [position:absolute] [z-index:8] [top:72px] [right:0] [left:0] [overflow:auto] [max-height:240px] [border:1px_solid_#ffffff18] [border-radius:11px] [padding:6px] [background:#171821] [box-shadow:0_18px_45px_#0009] [&_>_small]:[display:block] [&_>_small]:[padding:10px] [&_>_small]:[color:#737783] [&_>_small]:[font-size:10px] [&_>_button]:[cursor:pointer] [&_>_button:hover]:[background:#a9fb760d] [&_>_button:hover]:[color:#a9fb76] [&_b]:[display:block] [&_small]:[display:block] [&_b]:[font-size:10px] [&_small]:[margin-top:3px] [&_small]:[color:#6f737e] [&_small]:[font-size:8px] [&_>_button:hover]:[color:var(--accent-a)]"
                  }
                >
                  <LudusaviSuggestions
                    items={ludusaviSuggestions}
                    loading={searchingLudusavi}
                    onSelect={chooseLudusaviSuggestion}
                  />
                </div>
              ) : null}
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
                  placeholder="Puedes configurarlo más adelante"
                />
                <button onClick={() => chooseExecutable()}>
                  <FolderOpen /> Examinar
                </button>
              </div>
            </label>
            <div
              className={
                "modal-hint [display:flex] [align-items:flex-start] [gap:9px] [margin-top:auto] [padding:12px] [border-radius:10px] [background:#ffffff05] [color:#737682] [font-size:11px] [line-height:1.45] [&_svg]:[flex:0_0_auto] [&_svg]:[width:17px] [&_svg]:[height:17px] [&_svg]:[color:#a9fb76] [&_svg]:[color:var(--accent-a)]"
              }
            >
              <GameController />
              <span>
                La carátula, el ejecutable y otros datos se pueden completar después
                desde la ficha del juego.
              </span>
            </div>
          </div>
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
          <Button onClick={onClose} variant="secondary">
            Cancelar
          </Button>
          <Button
            disabled={saving || !title.trim()}
            onClick={() => createGame()}
            variant="primary"
          >
            {saving ? "Añadiendo…" : "Añadir a la biblioteca"}
          </Button>
        </footer>
      </section>
    </div>
  );
}
