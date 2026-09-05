import { Button } from "../Button";
import { Modal } from "../Modal";
import type { LibraryGame, LibrarySnapshot } from "@launcher/core";
import { FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { Image } from "@phosphor-icons/react/Image";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
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
    saving,
    error,
    applySuggestion,
    uploadArtwork,
  } = useArtworkModal({ game, onClose, onUpdated });

  return (
    <Modal
      title={`Arte para ${game.title}`}
      subtitle="PERSONALIZACIÓN"
      icon={<Image weight="fill" />}
      busy={saving}
      size="wide"
      tone="neutral"
      onClose={onClose}
      actions={
        <>
          <Button disabled={saving} onClick={onClose} variant="secondary">
            Cerrar
          </Button>
          <Button disabled={saving} onClick={uploadArtwork} variant="primary">
            <FolderOpen />
            {saving ? "Aplicando…" : "Usar archivo"}
          </Button>
        </>
      }
    >
      <div
        className={
          "artwork-search [display:grid] [grid-template-columns:auto_minmax(0,_1fr)] [align-items:center] [gap:10px] [margin:20px_24px] [padding-left:12px] [border:1px_solid_#ffffff12] [border-radius:11px] [background:#090a0f99] [color:#6f727e] [&_input]:[height:44px] [&_input]:[border:0] [&_input]:[outline:0] [&_input]:[background:transparent] [&_input]:[color:white]"
        }
      >
        <MagnifyingGlass />
        <input
          aria-label="Buscar un juego"
          disabled={saving}
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar un juego"
        />
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
              disabled={saving}
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
    </Modal>
  );
}
