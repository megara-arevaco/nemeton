import { memo } from "react";
import type { LibraryGame } from "@launcher/core";
import type { SyntheticEvent } from "react";
import { GameController } from "@phosphor-icons/react/GameController";
import { PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { Play } from "@phosphor-icons/react/Play";
import { SteamLogo } from "@phosphor-icons/react/SteamLogo";
import {
  formatPlaytime,
  gameCoverUrl,
  gameHeroUrl,
  gameLibraryCoverUrl,
} from "../../shared/presentation";
import { GameCoverImage } from "../GameCoverImage";

export const LibraryCollection = memo(function LibraryCollection({
  games,
  runningGameIds,
  onSelect,
}: Readonly<{
  games: LibraryGame[];
  runningGameIds: Set<string>;
  onSelect: (gameId: string) => void;
}>) {
  const useFallbackImage = (
    event: SyntheticEvent<HTMLImageElement>,
    fallback: string | null,
  ) => {
    if (!fallback || event.currentTarget.src === fallback) {
      event.currentTarget.remove();
      return;
    }
    event.currentTarget.src = fallback;
  };

  return (
    <div
      className={
        "library-collection-view [min-height:0] [overflow-y:auto] [padding:0_34px_34px]"
      }
    >
      <section
        className={
          "installed-section [padding:24px] [border:1px_solid_#ffffff0d] [border-radius:20px] [background:#101119]"
        }
      >
        <div
          className={
            "installed-heading [display:flex] [justify-content:space-between] [align-items:end] [margin-bottom:19px] [&_small]:[color:#6e717c] [&_small]:[font-size:9px] [&_small]:[font-weight:700] [&_small]:[letter-spacing:1.35px] [&_h2]:[margin:5px_0_0] [&_h2]:[font-size:21px] [&_h2]:[letter-spacing:-.5px] [&_>_span]:[color:#666975] [&_>_span]:[font-size:11px]"
          }
        >
          <div>
            <small>TU COLECCIÓN</small>
            <h2>Juegos en tu biblioteca</h2>
          </div>
          <span>
            {games.length} {games.length === 1 ? "juego" : "juegos"}
          </span>
        </div>
        <div
          className={
            "installed-grid [display:grid] [grid-template-columns:repeat(auto-fill,_minmax(190px,_1fr))] [gap:14px]"
          }
        >
          {games.map((game) => {
            const cover = gameCoverUrl(game);
            const hero = gameHeroUrl(game);
            const libraryCover = gameLibraryCoverUrl(game);
            const libraryHero =
              game.source === "steam" && !game.coverPath
                ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.sourceId}/library_hero.jpg`
                : hero;
            return (
              <button
                className={`installed-card [content-visibility:auto] [contain-intrinsic-size:auto_248px] [position:relative] [min-width:0] [overflow:hidden] [border:1px_solid_#ffffff0d] [border-radius:17px] [padding:0] [background:#151720] [color:white] [text-align:left] [cursor:pointer] [transition:transform_.18s_ease,_border-color_.18s_ease,_box-shadow_.18s_ease] [&:hover]:[z-index:1] [&:hover]:[border-color:#a9fb7652] [&:hover]:[transform:translateY(-4px)] [&:hover]:[box-shadow:0_18px_38px_#00000055] [&.selected]:[border-color:#a9fb7645] [&.selected]:[box-shadow:inset_0_0_0_1px_#a9fb761b] [&.unavailable_.installed-play]:[background:#777b87] [&.unavailable_.installed-play]:[color:#15161d] [&:hover_.installed-cover]:[transform:scale(1.035)] [&:hover_.installed-play]:[opacity:1] [&:hover_.installed-play]:[transform:translateY(0)] [&.selected_.installed-play]:[opacity:1] [&.selected_.installed-play]:[transform:translateY(0)] [&.running]:[border-color:#a9fb765c] [&.running]:[box-shadow:inset_0_0_0_1px_#a9fb761a,_0_12px_35px_#68ee8110] [&.running::after]:[content:"JUGANDO"] [&.running::after]:[position:absolute] [&.running::after]:[z-index:4] [&.running::after]:[top:12px] [&.running::after]:[left:12px] [&.running::after]:[padding:5px_8px] [&.running::after]:[border-radius:20px] [&.running::after]:[background:#10150de8] [&.running::after]:[color:#a9fb76] [&.running::after]:[font-size:8px] [&.running::after]:[font-weight:800] [&.running::after]:[letter-spacing:1px] [&.running::after]:[box-shadow:0_0_0_1px_#a9fb7640] [&.running_.installed-copy_small]:[color:#9df37b] [&:hover]:[border-color:color-mix(in_srgb,_var(--accent-a)_34%,_transparent)] [&.selected]:[border-color:color-mix(in_srgb,_var(--accent-a)_34%,_transparent)] [&.running]:[border-color:color-mix(in_srgb,_var(--accent-a)_34%,_transparent)] ${!game.installed ? "unavailable" : ""} ${runningGameIds.has(game.id) ? "running" : ""}`}
                key={game.id}
                onClick={() => onSelect(game.id)}
              >
                <span
                  className={
                    'installed-art [position:relative] [display:grid] [place-items:center] [height:185px] [overflow:hidden] [background:linear-gradient(135deg,_#252936,_#141620)] [&::after]:[content:""] [&::after]:[position:absolute] [&::after]:[inset:0] [&::after]:[background:linear-gradient(0deg,_#151720_0,_transparent_48%)] [&_>_b]:[position:relative] [&_>_b]:[z-index:1] [&_>_b]:[color:#a9fb76] [&_>_b]:[font-size:42px] [&_>_i]:[position:absolute] [&_>_i]:[z-index:2] [&_>_i]:[top:11px] [&_>_i]:[right:11px] [&_>_i]:[display:grid] [&_>_i]:[place-items:center] [&_>_i]:[width:28px] [&_>_i]:[height:28px] [&_>_i]:[border-radius:9px] [&_>_i]:[background:#090a0fc7] [&_>_i]:[color:#c7cad2] [&_>_i]:[font-style:normal] [&_>_i]:[backdrop-filter:blur(8px)] [&_>_i_svg]:[width:15px] [&_>_i_svg]:[height:15px]'
                  }
                >
                  {libraryHero && (
                    <img
                      className={
                        "installed-backdrop [position:absolute] [inset:-12px] [width:calc(100%_+_24px)] [height:calc(100%_+_24px)] [object-fit:cover] [filter:brightness(.38)] [transform:scale(1.08)]"
                      }
                      src={libraryHero}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      onError={(event) => useFallbackImage(event, hero)}
                    />
                  )}
                  {libraryCover ? (
                    <GameCoverImage
                      game={game}
                      className={
                        "installed-cover [position:relative] [z-index:1] [height:148px] [max-width:74%] [border-radius:9px] [object-fit:cover] [box-shadow:0_14px_35px_#0000008a] [transition:transform_.2s_ease]"
                      }
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <b>{game.title.slice(0, 1).toUpperCase()}</b>
                  )}
                  <i>
                    {game.source === "steam" ? (
                      <SteamLogo weight="fill" />
                    ) : (
                      <GameController weight="fill" />
                    )}
                  </i>
                </span>
                <span
                  className={
                    "installed-copy [display:block] [min-width:0] [padding:14px_48px_15px_15px] [&_strong]:[display:block] [&_strong]:[overflow:hidden] [&_strong]:[text-overflow:ellipsis] [&_strong]:[white-space:nowrap] [&_small]:[display:block] [&_small]:[overflow:hidden] [&_small]:[text-overflow:ellipsis] [&_small]:[white-space:nowrap] [&_strong]:[font-size:13px] [&_small]:[margin-top:5px] [&_small]:[color:#747783] [&_small]:[font-size:10px]"
                  }
                >
                  <strong>{game.title}</strong>
                  <small>
                    {runningGameIds.has(game.id)
                      ? "Jugando ahora"
                      : `${formatPlaytime(game.platformPlaytimeMinutes ?? game.playtimeMinutes)}${!game.installed ? " · Sin ejecutable" : ""}`}
                  </small>
                </span>
                <span
                  className={
                    "installed-play [position:absolute] [right:14px] [bottom:18px] [display:grid] [place-items:center] [width:28px] [height:28px] [border-radius:50%] [background:#a9fb76] [color:#11150e] [opacity:0] [transform:translateY(5px)] [transition:opacity_.18s_ease,_transform_.18s_ease] [&_svg]:[width:12px] [&_svg]:[height:12px]"
                  }
                >
                  {game.installed ? (
                    <Play weight="fill" />
                  ) : (
                    <PencilSimple weight="bold" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
});
