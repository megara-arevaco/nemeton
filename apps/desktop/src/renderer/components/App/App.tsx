import { ChartDonut } from "@phosphor-icons/react/ChartDonut";
import { Gear } from "@phosphor-icons/react/Gear";
import { Image } from "@phosphor-icons/react/Image";
import { LockKey } from "@phosphor-icons/react/LockKey";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { Minus } from "@phosphor-icons/react/Minus";
import { PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { Play } from "@phosphor-icons/react/Play";
import { Square } from "@phosphor-icons/react/Square";
import { SteamLogo } from "@phosphor-icons/react/SteamLogo";
import { Trophy } from "@phosphor-icons/react/Trophy";
import { X } from "@phosphor-icons/react/X";
import {
  formatLastPlayed,
  formatPlaytime,
  gameHeroUrl,
} from "../../shared/presentation";
import { AddGameModal } from "../AddGameModal";
import { ArtworkModal } from "../ArtworkModal";
import { EditGameModal } from "../EditGameModal";
import { LibraryCollection } from "../LibraryCollection";
import { SavegamesPanel } from "../SavegamesPanel";
import { SettingsView } from "../SettingsView";
import { Sidebar } from "../Sidebar";
import { StatisticsView } from "../StatisticsView";
import { useApp } from "./App.hook";

export function App() {
  const {
    games,
    setGames,
    sessions,
    setSessions,
    selectedId,
    message,
    setMessage,
    steamSettings,
    setSteamSettings,
    syncSettings,
    setSyncSettings,
    runningGameIds,
    query,
    setQuery,
    scanning,
    achievements,
    view,
    showAddGame,
    artworkGame,
    editGame,
    gameMenu,
    accentTheme,
    setAccentTheme,
    libraryGames,
    visibleGames,
    selected,
    openLibrary,
    openStatistics,
    openSettings,
    addGame,
    selectGame,
    openGameMenu,
    updateQuery,
    minimizeWindow,
    maximizeWindow,
    closeWindow,
    updateLibrary,
    connectSteam,
    syncLibrary,
    openEditor,
    closeAddGame,
    closeArtwork,
    closeEditor,
    closeGameMenu,
    closeGameMenuFromContext,
    stopPropagation,
    hideBrokenImage,
    importSteam,
    onLocalGameCreated,
    launchSelected,
    chooseCover,
    removeGame,
  } = useApp();

  return (
    <main
      className={
        "app-shell [height:100vh] [display:grid] [grid-template-columns:270px_1fr] [background:radial-gradient(circle_at_76%_0%,_#222135_0,_#0b0c12_38%)]"
      }
    >
      <Sidebar
        games={visibleGames}
        totalCount={libraryGames.length}
        selectedId={selectedId}
        runningGameIds={runningGameIds}
        view={view}
        onOpenLibrary={openLibrary}
        onOpenStatistics={openStatistics}
        onOpenSettings={openSettings}
        onAddGame={addGame}
        onSelect={selectGame}
        onContextMenu={openGameMenu}
      />

      <section
        className={
          "content [min-width:0] [min-height:0] [height:100vh] [display:grid] [grid-template-rows:80px_minmax(0,_1fr)_42px] [overflow:hidden]"
        }
      >
        <header
          className={
            "topbar [position:relative] [display:flex] [justify-content:space-between] [align-items:center] [padding:20px_150px_12px_34px] [-webkit-app-region:drag]"
          }
        >
          {view === "library" ? (
            <label
              className={
                "search [display:flex] [align-items:center] [gap:9px] [width:min(390px,_44vw)] [padding:10px_13px] [border:1px_solid_#ffffff10] [border-radius:11px] [background:#ffffff08] [color:#777a87] [-webkit-app-region:no-drag] [&_input]:[width:100%] [&_input]:[border:0] [&_input]:[outline:0] [&_input]:[background:transparent] [&_input]:[color:white]"
              }
            >
              <MagnifyingGlass />
              <input
                value={query}
                onChange={updateQuery}
                placeholder="Buscar en tu biblioteca"
              />
            </label>
          ) : (
            <span
              className={
                "topbar-title [display:flex] [align-items:center] [gap:9px] [color:#a4a7b1] [font-size:13px] [font-weight:600]"
              }
            >
              {view === "statistics" ? (
                <>
                  <ChartDonut /> Estadísticas
                </>
              ) : (
                <>
                  <Gear /> Ajustes
                </>
              )}
            </span>
          )}
          {view === "library" && (
            <button
              className={
                "steam-import [display:flex] [align-items:center] [gap:8px] [border:1px_solid_#ffffff18] [padding:9px_14px] [border-radius:10px] [background:#ffffff0b] [cursor:pointer] [-webkit-app-region:no-drag] [&:disabled]:[opacity:.55]"
              }
              disabled={scanning}
              onClick={() => importSteam()}
            >
              <SteamLogo />
              {scanning ? "Buscando…" : "Importar Steam"}
            </button>
          )}
          <div
            className={
              "window-controls [position:absolute] [top:0] [right:0] [display:flex] [height:44px] [-webkit-app-region:no-drag] [&_button]:[display:grid] [&_button]:[place-items:center] [&_button]:[width:46px] [&_button]:[border:0] [&_button]:[background:transparent] [&_button]:[color:#8c8f99] [&_button]:[cursor:pointer] [&_button:hover]:[background:#ffffff0b] [&_button:hover]:[color:white] [&_button.window-close:hover]:[background:#d94b55] [&_button.window-close:hover]:[color:white] [&_svg]:[width:15px] [&_svg]:[height:15px]"
            }
          >
            <button aria-label="Minimizar" onClick={minimizeWindow}>
              <Minus />
            </button>
            <button aria-label="Maximizar" onClick={maximizeWindow}>
              <Square />
            </button>
            <button
              className={"window-close"}
              aria-label="Cerrar"
              onClick={closeWindow}
            >
              <X />
            </button>
          </div>
        </header>

        {view === "statistics" ? (
          <StatisticsView games={games} sessions={sessions} />
        ) : view === "settings" ? (
          <SettingsView
            settings={steamSettings}
            syncSettings={syncSettings}
            accentTheme={accentTheme}
            onAccentThemeChange={setAccentTheme}
            onLibraryUpdated={updateLibrary}
            onConnected={connectSteam}
            onSynced={syncLibrary}
          />
        ) : selected ? (
          <div
            className={
              "game-view [min-width:0] [min-height:0] [overflow-x:hidden] [overflow-y:auto] [overscroll-behavior:contain] [padding-bottom:30px] [scrollbar-gutter:stable]"
            }
          >
            <section
              className={
                'game-hero [position:relative] [overflow:hidden] [height:min(510px,_62vh)] [min-height:410px] [margin:0_34px] [border:1px_solid_#ffffff10] [border-radius:24px] [background:linear-gradient(120deg,_#11131c_8%,_#171a27_55%,_#20253a)] [&:not(:has(.hero-art))_.ambient::after]:[content:""] [&:not(:has(.hero-art))_.ambient::after]:[position:absolute] [&:not(:has(.hero-art))_.ambient::after]:[width:380px] [&:not(:has(.hero-art))_.ambient::after]:[height:380px] [&:not(:has(.hero-art))_.ambient::after]:[right:10%] [&:not(:has(.hero-art))_.ambient::after]:[top:13%] [&:not(:has(.hero-art))_.ambient::after]:[border:1px_solid_#adff8f28] [&:not(:has(.hero-art))_.ambient::after]:[border-radius:42%_58%_67%_33%] [&:not(:has(.hero-art))_.ambient::after]:[transform:rotate(18deg)] [&:not(:has(.hero-art))_.ambient::after]:[box-shadow:0_0_90px_#7eff6815,_inset_0_0_80px_#6caaff0d]'
              }
            >
              <div
                className={
                  "ambient [position:absolute] [inset:0] [background:radial-gradient(circle_at_77%_32%,_#94ff7430,_transparent_27%),_radial-gradient(circle_at_90%_82%,_#596bff24,_transparent_35%)] [background-position:center] [background-size:cover]"
                }
              />
              {gameHeroUrl(selected) && (
                <img
                  className={
                    "hero-art [position:absolute] [inset:0] [width:100%] [height:100%] [object-fit:cover] [object-position:center]"
                  }
                  src={gameHeroUrl(selected)!}
                  alt={`Arte de ${selected.title}`}
                  onError={hideBrokenImage}
                />
              )}
              <div
                className={
                  "hero-shade [position:absolute] [inset:0] [background:linear-gradient(90deg,_#10121b_3%,_#10121bf2_32%,_#10121b8f_58%,_#10121b17_100%),_linear-gradient(0deg,_#0d0f17a8,_transparent_45%)]"
                }
              />
              <div
                className={
                  "hero-copy [position:relative] [z-index:1] [display:flex] [flex-direction:column] [justify-content:center] [width:60%] [height:100%] [padding:64px] [&_>_p]:[color:#7e818e] [&_>_p]:[overflow:hidden] [&_>_p]:[text-overflow:ellipsis] [&_>_p]:[white-space:nowrap]"
                }
              >
                <span
                  className={
                    "eyebrow [color:#a3f982] [font-size:11px] [font-weight:700] [letter-spacing:1.7px]"
                  }
                >
                  {runningGameIds.has(selected.id)
                    ? "● JUGANDO AHORA"
                    : selected.source === "steam"
                      ? `STEAM · ${selected.installed ? "INSTALADO" : "EN TU CUENTA"}`
                      : "JUEGO LOCAL"}
                </span>
                <h1>{selected.title}</h1>
                <p>{selected.installPath}</p>
                <div
                  className={
                    "stats [display:flex] [gap:32px] [margin:24px_0_32px] [color:#777a86] [font-size:12px] [&_b]:[display:block] [&_b]:[color:white] [&_b]:[font-size:17px] [&_b]:[margin-bottom:4px]"
                  }
                >
                  <span>
                    <b>
                      {formatPlaytime(
                        selected.platformPlaytimeMinutes ??
                          selected.playtimeMinutes,
                      )}
                    </b>{" "}
                    {selected.source === "steam" ? "en Steam" : "tiempo total"}
                  </span>
                  <span>
                    <b>{formatLastPlayed(selected.lastPlayedAt)}</b> última
                    partida
                  </span>
                </div>
                <div className={"hero-actions [display:flex] [gap:10px]"}>
                  <button
                    className={`play [background:linear-gradient(135deg,_var(--accent-a),_var(--accent-b))] [color:var(--accent-ink)] [box-shadow:0_12px_40px_color-mix(in_srgb,_var(--accent-a)_15%,_transparent)] [&:disabled]:[filter:grayscale(1)] [&:disabled]:[opacity:.45] [&:disabled]:[cursor:default] [&.running]:[filter:none] [&.running]:[opacity:1] [&.running]:[background:#a9fb7617] [&.running]:[color:#a9fb76] [&.running]:[box-shadow:inset_0_0_0_1px_#a9fb7640,_0_0_30px_#83ef8412] [&.running:disabled]:[filter:none] [&.running:disabled]:[opacity:1] [&.running:disabled]:[background:#a9fb7617] [&.running:disabled]:[color:#a9fb76] [&.running:disabled]:[box-shadow:inset_0_0_0_1px_#a9fb7640,_0_0_30px_#83ef8412] [&.running]:[background:color-mix(in_srgb,_var(--accent-a)_9%,_transparent)] [&.running]:[color:var(--accent-a)] [&.running]:[box-shadow:inset_0_0_0_1px_color-mix(in_srgb,_var(--accent-a)_25%,_transparent)] [&.running:disabled]:[background:color-mix(in_srgb,_var(--accent-a)_9%,_transparent)] [&.running:disabled]:[color:var(--accent-a)] [&.running:disabled]:[box-shadow:inset_0_0_0_1px_color-mix(in_srgb,_var(--accent-a)_25%,_transparent)] ${runningGameIds.has(selected.id) ? "running" : ""}`}
                    disabled={
                      runningGameIds.has(selected.id) ||
                      (selected.source === "local" && !selected.installPath)
                    }
                    onClick={() => launchSelected()}
                  >
                    <Play weight="fill" />{" "}
                    {runningGameIds.has(selected.id)
                      ? "Jugando"
                      : selected.source === "local" && !selected.installPath
                        ? "Sin ejecutable"
                        : selected.installed
                          ? "Jugar"
                          : "Instalar"}
                  </button>
                  {selected.source === "local" && (
                    <button
                      className={
                        "cover-button [display:flex] [align-items:center] [gap:8px] [border:1px_solid_#ffffff18] [border-radius:12px] [padding:12px_16px] [background:#ffffff0b] [cursor:pointer]"
                      }
                      onClick={openEditor}
                    >
                      <PencilSimple /> Editar
                    </button>
                  )}
                  <button
                    className={
                      "cover-button [display:flex] [align-items:center] [gap:8px] [border:1px_solid_#ffffff18] [border-radius:12px] [padding:12px_16px] [background:#ffffff0b] [cursor:pointer]"
                    }
                    onClick={() => chooseCover()}
                  >
                    <Image /> Carátula
                  </button>
                </div>
              </div>
            </section>
            {selected.source === "local" &&
              achievements &&
              achievements.total === 0 && (
                <section
                  className={
                    "achievements-section [margin:24px_34px_0] [padding:24px] [border:1px_solid_#ffffff0d] [border-radius:20px] [background:#101119] achievement-diagnostic [&_p]:[margin:15px_0_0] [&_p]:[color:#747884] [&_p]:[font-size:11px] [&_p]:[line-height:1.55]"
                  }
                >
                  <div
                    className={
                      "achievements-heading [justify-content:space-between] [&_>_div]:[gap:12px] [&_small]:[display:block] [&_strong]:[display:block] [&_small]:[margin-bottom:3px] [&_small]:[color:#696c78] [&_small]:[font-size:9px] [&_small]:[font-weight:700] [&_small]:[letter-spacing:1.4px] [&_strong]:[font-size:14px] [&_>_b]:[color:#a9fb76] [&_>_b]:[font-size:20px]"
                    }
                  >
                    <div>
                      <span
                        className={
                          "section-icon [display:grid] [place-items:center] [width:38px] [height:38px] [border-radius:11px] [background:#a9fb7615] [color:#a9fb76]"
                        }
                      >
                        <Trophy />
                      </span>
                      <span>
                        <small>LOGROS LOCALES</small>
                        <strong>
                          {achievements.status === "missing-app-id"
                            ? "Falta identificar el juego"
                            : achievements.status === "parse-error"
                              ? "El archivo de logros no se pudo interpretar"
                              : "Todavía no se encontró un estado local"}
                        </strong>
                      </span>
                    </div>
                  </div>
                  <p>
                    {achievements.status === "missing-app-id"
                      ? "Asocia el juego con Ludusavi o añade su Steam AppID desde Editar."
                      : achievements.status === "parse-error"
                        ? `${achievements.source ?? "Formato desconocido"} · ${achievements.statePath ?? "ruta no disponible"}`
                        : "Nemeton volverá a buscar mientras juegas. Algunos juegos no generan un archivo de logros compatible."}
                  </p>
                </section>
              )}
            {achievements && achievements.total > 0 && (
              <section
                className={
                  "achievements-section [margin:24px_34px_0] [padding:24px] [border:1px_solid_#ffffff0d] [border-radius:20px] [background:#101119]"
                }
              >
                <div
                  className={
                    "achievements-heading [justify-content:space-between] [&_>_div]:[gap:12px] [&_small]:[display:block] [&_strong]:[display:block] [&_small]:[margin-bottom:3px] [&_small]:[color:#696c78] [&_small]:[font-size:9px] [&_small]:[font-weight:700] [&_small]:[letter-spacing:1.4px] [&_strong]:[font-size:14px] [&_>_b]:[color:#a9fb76] [&_>_b]:[font-size:20px]"
                  }
                >
                  <div>
                    <span
                      className={
                        "section-icon [display:grid] [place-items:center] [width:38px] [height:38px] [border-radius:11px] [background:#a9fb7615] [color:#a9fb76]"
                      }
                    >
                      <Trophy weight="fill" />
                    </span>
                    <span>
                      <small>
                        LOGROS
                        {achievements.source
                          ? ` · ${achievements.source.toLocaleUpperCase()}`
                          : ""}
                      </small>
                      <strong>
                        {achievements.unlocked} de {achievements.total}{" "}
                        desbloqueados
                      </strong>
                    </span>
                  </div>
                  <b>
                    {Math.round(
                      (achievements.unlocked / achievements.total) * 100,
                    )}
                    %
                  </b>
                </div>
                <div
                  className={
                    "achievement-progress [height:4px] [margin:17px_0_20px] [overflow:hidden] [border-radius:10px] [background:#ffffff0a] [&_span]:[display:block] [&_span]:[height:100%] [&_span]:[border-radius:inherit] [&_span]:[background:linear-gradient(90deg,_#a9fb76,_#70e4a7)] [&_span]:[background:linear-gradient(90deg,_var(--accent-a),_var(--accent-b))]"
                  }
                >
                  <span
                    style={{
                      width: `${(achievements.unlocked / achievements.total) * 100}%`,
                    }}
                  />
                </div>
                <div
                  className={
                    "achievement-grid [display:grid] [grid-template-columns:repeat(2,_minmax(0,_1fr))] [gap:10px]"
                  }
                >
                  {achievements.items.slice(0, 8).map((achievement) => (
                    <article
                      key={achievement.id}
                      className={`achievement [display:grid] [grid-template-columns:54px_1fr] [gap:12px] [min-width:0] [padding:10px] [border-radius:13px] [background:#ffffff06] [&.locked]:[opacity:.55] [&_strong]:[display:block] [&_strong]:[overflow:hidden] [&_strong]:[text-overflow:ellipsis] [&_strong]:[white-space:nowrap] [&_p]:[display:block] [&_p]:[overflow:hidden] [&_p]:[text-overflow:ellipsis] [&_p]:[white-space:nowrap] [&_small]:[display:block] [&_small]:[overflow:hidden] [&_small]:[text-overflow:ellipsis] [&_small]:[white-space:nowrap] [&_strong]:[margin-top:1px] [&_strong]:[font-size:13px] [&_p]:[margin:4px_0] [&_p]:[color:#777a86] [&_p]:[font-size:11px] [&_small]:[color:#a2a5af] [&_small]:[font-size:10px] ${achievement.achieved ? "unlocked" : "locked"}`}
                    >
                      <div
                        className={
                          "achievement-image [position:relative] [display:grid] [place-items:center] [width:54px] [height:54px] [overflow:hidden] [border-radius:10px] [background:#20222d] [color:#858997] [&_>_img]:[width:100%] [&_>_img]:[height:100%] [&_>_img]:[object-fit:cover] [&_>_span]:[position:absolute] [&_>_span]:[inset:0] [&_>_span]:[display:grid] [&_>_span]:[place-items:center] [&_>_span]:[background:#090a0fa8]"
                        }
                      >
                        {achievement.imageUrl ? (
                          <img src={achievement.imageUrl} alt="" />
                        ) : (
                          <Trophy />
                        )}
                        {!achievement.achieved && (
                          <span>
                            <LockKey weight="fill" />
                          </span>
                        )}
                      </div>
                      <div>
                        <strong>
                          {achievement.hidden && !achievement.achieved
                            ? "Logro oculto"
                            : achievement.name}
                        </strong>
                        <p>
                          {achievement.hidden && !achievement.achieved
                            ? "Sigue jugando para descubrirlo."
                            : achievement.description}
                        </p>
                        <small>
                          {achievement.achieved && achievement.unlockedAt
                            ? new Date(
                                achievement.unlockedAt,
                              ).toLocaleDateString("es-ES")
                            : achievement.globalPercentage !== null
                              ? `${achievement.globalPercentage.toFixed(1)}% de jugadores`
                              : "Bloqueado"}
                        </small>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
            {selected.source === "local" && (
              <SavegamesPanel key={selected.id} game={selected} />
            )}
          </div>
        ) : visibleGames.length > 0 ? (
          <LibraryCollection
            games={visibleGames}
            runningGameIds={runningGameIds}
            onSelect={selectGame}
          />
        ) : (
          <section
            className={
              "empty-state [display:grid] [place-items:center] [align-content:center] [margin:0_34px] [padding:40px] [border:1px_dashed_#ffffff17] [border-radius:24px] [background:#ffffff04] [text-align:center] [&_h1]:[font-size:38px] [&_h1]:[letter-spacing:-1.8px] [&_p]:[max-width:470px] [&_p]:[margin:0_0_26px] [&_p]:[color:#898c97] [&_p]:[line-height:1.6]"
            }
          >
            <span
              className={
                "empty-icon [display:grid] [place-items:center] [width:76px] [height:76px] [border-radius:24px] [background:#ffffff08] [color:#a8f982] [&_svg]:[width:38px] [&_svg]:[height:38px]"
              }
            >
              <SteamLogo weight="fill" />
            </span>
            <h1>Tu biblioteca, sin ruido</h1>
            <p>
              Importa los juegos instalados en Steam. Se guardarán únicamente en
              este ordenador.
            </p>
            <button
              className={
                "play [background:linear-gradient(135deg,_var(--accent-a),_var(--accent-b))] [color:var(--accent-ink)] [box-shadow:0_12px_40px_color-mix(in_srgb,_var(--accent-a)_15%,_transparent)] [&:disabled]:[filter:grayscale(1)] [&:disabled]:[opacity:.45] [&:disabled]:[cursor:default] [&.running]:[filter:none] [&.running]:[opacity:1] [&.running]:[background:#a9fb7617] [&.running]:[color:#a9fb76] [&.running]:[box-shadow:inset_0_0_0_1px_#a9fb7640,_0_0_30px_#83ef8412] [&.running:disabled]:[filter:none] [&.running:disabled]:[opacity:1] [&.running:disabled]:[background:#a9fb7617] [&.running:disabled]:[color:#a9fb76] [&.running:disabled]:[box-shadow:inset_0_0_0_1px_#a9fb7640,_0_0_30px_#83ef8412] [&.running]:[background:color-mix(in_srgb,_var(--accent-a)_9%,_transparent)] [&.running]:[color:var(--accent-a)] [&.running]:[box-shadow:inset_0_0_0_1px_color-mix(in_srgb,_var(--accent-a)_25%,_transparent)] [&.running:disabled]:[background:color-mix(in_srgb,_var(--accent-a)_9%,_transparent)] [&.running:disabled]:[color:var(--accent-a)] [&.running:disabled]:[box-shadow:inset_0_0_0_1px_color-mix(in_srgb,_var(--accent-a)_25%,_transparent)]"
              }
              disabled={scanning}
              onClick={() => importSteam()}
            >
              <SteamLogo /> Importar desde Steam
            </button>
          </section>
        )}
        <footer>
          {message}
          <span>
            {syncSettings?.folderPath
              ? "Sincronización automática activa"
              : "Sin sincronización"}
          </span>
        </footer>
      </section>
      {showAddGame && (
        <AddGameModal onClose={closeAddGame} onCreated={onLocalGameCreated} />
      )}
      {artworkGame && (
        <ArtworkModal
          game={artworkGame}
          onClose={closeArtwork}
          onUpdated={updateLibrary}
        />
      )}
      {editGame && (
        <EditGameModal
          game={editGame}
          onClose={closeEditor}
          onUpdated={(snapshot) => setGames(snapshot.games)}
        />
      )}
      {gameMenu && (
        <div
          className={
            "game-context-backdrop [position:fixed] [z-index:80] [inset:0] [-webkit-app-region:no-drag]"
          }
          onMouseDown={closeGameMenu}
          onContextMenu={closeGameMenuFromContext}
        >
          <div
            className={
              "game-context-menu [position:fixed] [width:218px] [overflow:hidden] [border:1px_solid_#ffffff18] [border-radius:12px] [padding:6px] [background:#171820f5] [box-shadow:0_18px_55px_#00000080] [backdrop-filter:blur(18px)] [&_>_small]:[display:block] [&_>_small]:[overflow:hidden] [&_>_small]:[padding:7px_9px_9px] [&_>_small]:[color:#777a86] [&_>_small]:[font-size:9px] [&_>_small]:[text-overflow:ellipsis] [&_>_small]:[white-space:nowrap] [&_>_button]:[display:flex] [&_>_button]:[align-items:center] [&_>_button]:[gap:9px] [&_>_button]:[width:100%] [&_>_button]:[border:0] [&_>_button]:[border-radius:8px] [&_>_button]:[padding:10px] [&_>_button]:[background:transparent] [&_>_button]:[color:#ee959b] [&_>_button]:[font-size:12px] [&_>_button]:[text-align:left] [&_>_button]:[cursor:pointer] [&_>_button:hover]:[background:#ff727d12] [&_>_button_svg]:[width:16px] [&_>_button_svg]:[height:16px]"
            }
            style={{ left: gameMenu.x, top: gameMenu.y }}
            onMouseDown={stopPropagation}
          >
            <small>{gameMenu.game.title}</small>
            <button onClick={() => removeGame()}>
              <X weight="bold" />
              {gameMenu.game.source === "steam" && gameMenu.game.installed
                ? "Desinstalar"
                : "Quitar de la biblioteca"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
