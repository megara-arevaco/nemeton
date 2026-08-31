import { memo } from "react";
import type { LibraryGame } from "@launcher/core";
import { ChartDonut } from "@phosphor-icons/react/ChartDonut";
import { GameController } from "@phosphor-icons/react/GameController";
import { Gear } from "@phosphor-icons/react/Gear";
import { Plus } from "@phosphor-icons/react/Plus";
import { Button } from "../Button";
import { formatPlaytime, gameCoverUrl } from "../../shared/presentation";
import { NemetonMark } from "../NemetonMark";

export const Sidebar = memo(function Sidebar({
  games,
  totalCount,
  selectedId,
  runningGameIds,
  onOpenLibrary,
  onOpenStatistics,
  onOpenSettings,
  onAddGame,
  onSelect,
  onContextMenu,
  view,
}: Readonly<{
  games: LibraryGame[];
  totalCount: number;
  selectedId: string | null;
  runningGameIds: Set<string>;
  view: "library" | "statistics" | "settings";
  onOpenLibrary: () => void;
  onOpenStatistics: () => void;
  onOpenSettings: () => void;
  onAddGame: () => void;
  onSelect: (gameId: string) => void;
  onContextMenu: (game: LibraryGame, x: number, y: number) => void;
}>) {
  return (
    <aside
      className={
        "sidebar [min-height:0] [display:grid] [grid-template-rows:54px_auto_auto_minmax(0,_1fr)] [padding:26px_14px_14px] [background:rgba(10,_11,_17,_.9)] [border-right:1px_solid_#ffffff0d] [overflow:hidden] [-webkit-app-region:drag]"
      }
    >
      <div
        className={
          "brand [height:54px] [display:flex] [align-items:center] [gap:11px] [padding:0_10px] [font-size:18px] [font-weight:600] [letter-spacing:-.5px]"
        }
      >
        <span
          className={
            "brand-mark [--mark-cut:#101015] [display:grid] [place-items:center] [width:34px] [height:34px] [border-radius:11px] [color:var(--accent-ink)] [background:linear-gradient(135deg,_var(--accent-a),_var(--accent-b))] [box-shadow:0_8px_24px_color-mix(in_srgb,_var(--accent-a)_18%,_transparent)] [&_svg]:[width:25px] [&_svg]:[height:25px]"
          }
        >
          <NemetonMark />
        </span>
        <span>Nemeton</span>
      </div>
      <nav className={"primary-nav [display:grid] [gap:4px] [margin:20px_0_24px]"}>
        <button
          className={`nav-item [&_svg]:[width:19px] [&.active]:[background:#ffffff0c] [&.active]:[color:white] ${view === "library" && !selectedId ? "active" : ""}`}
          onClick={onOpenLibrary}
        >
          <GameController /> Biblioteca
        </button>
        <button
          className={`nav-item [&_svg]:[width:19px] [&.active]:[background:#ffffff0c] [&.active]:[color:white] ${view === "statistics" ? "active" : ""}`}
          onClick={onOpenStatistics}
        >
          <ChartDonut /> Estadísticas
        </button>
        <button
          className={`nav-item [&_svg]:[width:19px] [&.active]:[background:#ffffff0c] [&.active]:[color:white] ${view === "settings" ? "active" : ""}`}
          onClick={onOpenSettings}
        >
          <Gear /> Ajustes
        </button>
        <Button
          className="[justify-content:flex-start] [width:100%]"
          onClick={onAddGame}
          size="small"
          variant="secondary"
        >
          <Plus /> Añadir juego
        </Button>
      </nav>
      <div
        className={
          "library-heading [display:flex] [justify-content:space-between] [padding:0_11px_10px] [color:#666976] [font-size:10px] [font-weight:700] [letter-spacing:1.4px]"
        }
      >
        <span>JUEGOS</span>
        <span>{totalCount}</span>
      </div>
      <div
        className={
          "game-list [min-height:0] [overflow-x:hidden] [overflow-y:auto] [display:grid] [align-content:start] [gap:3px]"
        }
      >
        {games.map((game) => {
          const cover = gameCoverUrl(game);
          return (
            <button
              key={game.id}
              className={`game-row [display:grid] [grid-template-columns:36px_minmax(0,_1fr)] [align-items:center] [gap:10px] [width:100%] [border:0] [background:transparent] [padding:7px] [border-radius:10px] [text-align:left] [cursor:pointer] [&_>_span:last-child]:[min-width:0] [&:hover]:[background:#ffffff0b] [&.selected]:[background:#ffffff0b] [&.selected]:[box-shadow:inset_2px_0_#9df37b] [&_strong]:[display:block] [&_strong]:[overflow:hidden] [&_strong]:[text-overflow:ellipsis] [&_strong]:[white-space:nowrap] [&_small]:[display:block] [&_small]:[overflow:hidden] [&_small]:[text-overflow:ellipsis] [&_small]:[white-space:nowrap] [&_strong]:[margin-top:1px] [&_strong]:[font-size:13px] [&_strong]:[font-weight:500] [&_small]:[margin-top:3px] [&_small]:[color:#686b77] [&_small]:[font-size:11px] [&.running]:[background:#a9fb760b] [&.running]:[box-shadow:inset_2px_0_#9df37b] [&.running_.game-avatar]:[overflow:visible] [&.running_.game-avatar]:[box-shadow:0_0_0_1px_#9df37b55] [&.running_.game-avatar_img]:[border-radius:8px] [&.running_.game-avatar::after]:[content:""] [&.running_.game-avatar::after]:[position:absolute] [&.running_.game-avatar::after]:[z-index:2] [&.running_.game-avatar::after]:[right:-3px] [&.running_.game-avatar::after]:[bottom:-3px] [&.running_.game-avatar::after]:[width:9px] [&.running_.game-avatar::after]:[height:9px] [&.running_.game-avatar::after]:[border:2px_solid_#11121a] [&.running_.game-avatar::after]:[border-radius:50%] [&.running_.game-avatar::after]:[background:#9df37b] [&.running_.game-avatar::after]:[box-shadow:0_0_10px_#9df37b] [&.running_.game-avatar::after]:[animation:running-pulse_1.6s_ease-in-out_infinite] [&.running_small]:[color:#9df37b] [&.running_small]:[font-weight:600] [&.selected]:[box-shadow:inset_2px_0_var(--accent-a)] [&.running]:[box-shadow:inset_2px_0_var(--accent-a)] [&.running]:[background:color-mix(in_srgb,_var(--accent-a)_5%,_transparent)] [&.running_.game-avatar]:[box-shadow:0_0_0_1px_color-mix(in_srgb,_var(--accent-a)_34%,_transparent)] [&.running_.game-avatar::after]:[background:var(--accent-a)] [&.running_.game-avatar::after]:[box-shadow:0_0_10px_var(--accent-a)] ${selectedId === game.id ? "selected" : ""} ${runningGameIds.has(game.id) ? "running" : ""}`}
              onClick={() => onSelect(game.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                onContextMenu(game, event.clientX, event.clientY);
              }}
            >
              <span
                className={
                  "game-avatar [position:relative] [display:grid] [place-items:center] [width:36px] [height:36px] [overflow:hidden] [border-radius:8px] [background:#242630] [color:#8c8f99] [font-size:12px] [font-weight:700] [&_img]:[position:absolute] [&_img]:[inset:0] [&_img]:[width:100%] [&_img]:[height:100%] [&_img]:[object-fit:cover]"
                }
              >
                {game.title.slice(0, 1).toUpperCase()}
                {cover ? (
                  <img
                    src={cover}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={(event) => event.currentTarget.remove()}
                  />
                ) : null}
              </span>
              <span>
                <strong>{game.title}</strong>
                <small>
                  {runningGameIds.has(game.id)
                    ? "Jugando ahora"
                    : game.installed
                      ? formatPlaytime(
                          game.platformPlaytimeMinutes ?? game.playtimeMinutes,
                        )
                      : "No instalado"}
                </small>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
});
