import type { LibraryGame, LibrarySnapshot } from "@launcher/core";
import { FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { Image } from "@phosphor-icons/react/Image";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { X } from "@phosphor-icons/react/X";
import { useArtworkModal } from "./ArtworkModal.hook";

export function ArtworkModal({
  game,
  onClose,
  onUpdated,
}: Readonly<{
  game: LibraryGame;
  onClose: () => void;
  onUpdated: (snapshot: LibrarySnapshot) => void;
}>) {
  const {
    query,
    setQuery,
    suggestions,
    loading,
    error,
    applySuggestion,
    uploadArtwork,
  } = useArtworkModal({ game, onClose, onUpdated });

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
          "artwork-modal [width:min(820px,_94vw)] [max-height:min(720px,_90vh)] [overflow:hidden] [border:1px_solid_#ffffff17] [border-radius:22px] [background:#12131b] [box-shadow:0_30px_100px_#0000008a] [&_>_header]:[display:flex] [&_>_header]:[justify-content:space-between] [&_>_header]:[align-items:center] [&_>_header]:[padding:22px_24px] [&_>_header]:[border-bottom:1px_solid_#ffffff0d] [&_>_header_>_div]:[display:flex] [&_>_header_>_div]:[align-items:center] [&_>_header_>_div]:[gap:12px] [&_>_header_small]:[display:block] [&_>_header_small]:[margin:0] [&_>_header_h2]:[display:block] [&_>_header_h2]:[margin:0] [&_>_header_small]:[color:#696c78] [&_>_header_small]:[font-size:9px] [&_>_header_small]:[font-weight:700] [&_>_header_small]:[letter-spacing:1.3px] [&_>_header_h2]:[margin-top:3px] [&_>_header_h2]:[font-size:17px] [&_>_header_>_button]:[display:grid] [&_>_header_>_button]:[place-items:center] [&_>_header_>_button]:[width:34px] [&_>_header_>_button]:[height:34px] [&_>_header_>_button]:[border:0] [&_>_header_>_button]:[border-radius:9px] [&_>_header_>_button]:[background:#ffffff08] [&_>_header_>_button]:[color:#8b8e99] [&_>_header_>_button]:[cursor:pointer]"
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
              <Image weight="fill" />
            </span>
            <span>
              <small>PERSONALIZACIÓN</small>
              <h2>Arte para {game.title}</h2>
            </span>
          </div>
          <button onClick={onClose}>
            <X />
          </button>
        </header>
        <div
          className={
            "artwork-search [display:grid] [grid-template-columns:auto_minmax(0,_1fr)_auto] [align-items:center] [gap:10px] [margin:20px_24px] [padding-left:12px] [border:1px_solid_#ffffff12] [border-radius:11px] [background:#090a0f99] [color:#6f727e] [&_input]:[height:44px] [&_input]:[border:0] [&_input]:[outline:0] [&_input]:[background:transparent] [&_input]:[color:white] [&_button]:[align-self:stretch] [&_button]:[display:flex] [&_button]:[align-items:center] [&_button]:[gap:7px] [&_button]:[border:0] [&_button]:[border-left:1px_solid_#ffffff12] [&_button]:[padding:0_14px] [&_button]:[background:#ffffff06] [&_button]:[cursor:pointer]"
          }
        >
          <MagnifyingGlass />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar un juego"
          />
          <button onClick={() => uploadArtwork()}>
            <FolderOpen /> Usar archivo
          </button>
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
        <div
          className={
            "artwork-results [min-height:290px] [max-height:470px] [overflow-y:auto] [display:grid] [grid-template-columns:repeat(4,_minmax(0,_1fr))] [gap:11px] [padding:4px_24px_24px] [&_>_button]:[overflow:hidden] [&_>_button]:[border:1px_solid_#ffffff0d] [&_>_button]:[border-radius:13px] [&_>_button]:[padding:0] [&_>_button]:[background:#0a0b10] [&_>_button]:[text-align:left] [&_>_button]:[cursor:pointer] [&_>_button:hover]:[border-color:#a9fb7666] [&_>_button:hover]:[transform:translateY(-2px)] [&_img]:[display:block] [&_img]:[width:100%] [&_img]:[aspect-ratio:2_/_2.75] [&_img]:[object-fit:cover] [&_button_span]:[display:block] [&_button_span]:[padding:10px] [&_strong]:[display:block] [&_strong]:[overflow:hidden] [&_strong]:[text-overflow:ellipsis] [&_strong]:[white-space:nowrap] [&_small]:[display:block] [&_small]:[overflow:hidden] [&_small]:[text-overflow:ellipsis] [&_small]:[white-space:nowrap] [&_strong]:[font-size:11px] [&_small]:[margin-top:4px] [&_small]:[color:#696c77] [&_small]:[font-size:9px]"
          }
        >
          {loading ? (
            <div
              className={
                "artwork-loading [grid-column:1_/_-1] [display:grid] [place-items:center] [color:#737681] [font-size:12px]"
              }
            >
              Buscando arte…
            </div>
          ) : (
            suggestions.map((suggestion) => (
              <button
                key={`${suggestion.provider}:${suggestion.providerId}`}
                onClick={() => applySuggestion(suggestion)}
              >
                <img src={suggestion.coverUrl} alt="" />
                <span>
                  <strong>{suggestion.title}</strong>
                  <small>
                    {suggestion.provider === "steam"
                      ? "Steam · portada y hero"
                      : "Wikipedia · imagen principal"}
                  </small>
                </span>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
