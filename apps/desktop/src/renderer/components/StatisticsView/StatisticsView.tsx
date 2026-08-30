import type { GameSession, LibraryGame } from "@launcher/core";
import { CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { ChartDonut } from "@phosphor-icons/react/ChartDonut";
import { Clock } from "@phosphor-icons/react/Clock";
import { Trophy } from "@phosphor-icons/react/Trophy";
import { formatPlaytime, gameCoverUrl } from "../../shared/presentation";
import { useStatisticsView } from "./StatisticsView.hook";

export function StatisticsView({
  games,
  sessions,
}: Readonly<{ games: LibraryGame[]; sessions: GameSession[] }>) {
  const {
    period,
    setPeriod,
    summaryPeriod,
    setSummaryPeriod,
    statistics,
    totalHours,
    months,
    annualSeconds,
    annualRanking,
    automaticSummary,
  } = useStatisticsView(games, sessions);

  return (
    <div
      className={
        "statistics-view [min-height:0] [overflow-y:auto] [padding:20px_34px_40px]"
      }
    >
      <div
        className={
          "statistics-intro [&_h1]:[margin:10px_0_7px] [&_h1]:[font-size:46px] [&_h1]:[letter-spacing:-2.3px] [&_p]:[margin:0] [&_p]:[color:#777a87]"
        }
      >
        <span
          className={
            "eyebrow [color:#a3f982] [font-size:11px] [font-weight:700] [letter-spacing:1.7px]"
          }
        >
          TU HISTÓRICO DE JUEGO
        </span>
        <h1>Estadísticas</h1>
        <p>Steam completo y sesiones de los juegos añadidos manualmente.</p>
      </div>
      <section
        className={
          "automatic-summary [border-color:color-mix(in_srgb,_var(--accent-a)_9%,_transparent)] [background:linear-gradient(135deg,_color-mix(in_srgb,_var(--accent-a)_4%,_transparent),_#101119_48%)]"
        }
      >
        <div
          className={
            "card-heading [display:flex] [justify-content:space-between] [align-items:end] [&_small]:[color:#727581] [&_small]:[font-size:9px] [&_small]:[font-weight:700] [&_small]:[letter-spacing:1.3px] [&_h2]:[margin:5px_0_0] [&_h2]:[font-size:20px] [&_>_span]:[color:#5f626e] [&_>_span]:[font-size:11px]"
          }
        >
          <div>
            <small>RESUMEN AUTOMÁTICO</small>
            <h2>Lo más destacado</h2>
          </div>
          <div
            className={
              "summary-period [display:flex] [gap:4px] [border:1px_solid_#ffffff0d] [border-radius:9px] [padding:3px] [background:#090a0f80] [&_button]:[border:0] [&_button]:[border-radius:6px] [&_button]:[padding:7px_11px] [&_button]:[background:transparent] [&_button]:[color:#737783] [&_button]:[font-size:9px] [&_button]:[cursor:pointer] [&_button.active]:[background:#a9fb7615] [&_button.active]:[color:#a9fb76] [&_button.active]:[color:var(--accent-a)] [&_button.active]:[background:color-mix(in_srgb,_var(--accent-a)_9%,_transparent)]"
            }
          >
            <button
              className={summaryPeriod === "week" ? "active" : ""}
              onClick={() => setSummaryPeriod("week")}
            >
              Semana
            </button>
            <button
              className={summaryPeriod === "month" ? "active" : ""}
              onClick={() => setSummaryPeriod("month")}
            >
              Mes
            </button>
          </div>
        </div>
        <div
          className={
            "summary-grid [display:grid] [grid-template-columns:repeat(2,_minmax(0,_1fr))] [gap:9px] [margin-top:18px] [&_article]:[display:grid] [&_article]:[grid-template-columns:34px_minmax(0,_1fr)] [&_article]:[gap:10px] [&_article]:[align-items:center] [&_article]:[min-width:0] [&_article]:[border:1px_solid_#ffffff0b] [&_article]:[border-radius:12px] [&_article]:[padding:13px] [&_article]:[background:#ffffff04] [&_article_>_span]:[display:grid] [&_article_>_span]:[place-items:center] [&_article_>_span]:[width:34px] [&_article_>_span]:[height:34px] [&_article_>_span]:[border-radius:9px] [&_article_>_span]:[background:#a9fb7610] [&_article_>_span]:[color:#a9fb76] [&_article_svg]:[width:17px] [&_article_svg]:[height:17px] [&_small]:[color:#777b86] [&_small]:[font-size:8px] [&_small]:[font-weight:750] [&_small]:[letter-spacing:1.1px] [&_p]:[margin:4px_0_0] [&_p]:[color:#c6c8ce] [&_p]:[font-size:11px] [&_p]:[line-height:1.45] [&_article_>_span]:[color:var(--accent-a)] [&_article_>_span]:[background:color-mix(in_srgb,_var(--accent-a)_9%,_transparent)]"
          }
        >
          {automaticSummary.map((item) => (
            <article key={item.label}>
              <span>
                <ChartDonut weight="fill" />
              </span>
              <div>
                <small>{item.label}</small>
                <p>{item.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <div
        className={
          "statistics-toolbar [display:flex] [justify-content:space-between] [align-items:center] [gap:18px] [margin:28px_0_16px]"
        }
      >
        <div
          className={
            "metric-grid [display:grid] [grid-template-columns:minmax(220px,_320px)] [gap:12px] [margin:0] [&_article]:[display:flex] [&_article]:[align-items:center] [&_article]:[gap:14px] [&_article]:[min-width:0] [&_article]:[padding:18px] [&_article]:[border:1px_solid_#ffffff0d] [&_article]:[border-radius:16px] [&_article]:[background:#ffffff06] [&_article_>_svg]:[flex:0_0_auto] [&_article_>_svg]:[width:24px] [&_article_>_svg]:[height:24px] [&_article_>_svg]:[color:#a9fb76] [&_article_span]:[display:block] [&_article_span]:[min-width:0] [&_article_small]:[display:block] [&_article_small]:[min-width:0] [&_article_strong]:[display:block] [&_article_strong]:[min-width:0] [&_article_small]:[margin-bottom:5px] [&_article_small]:[color:#666a76] [&_article_small]:[font-size:9px] [&_article_small]:[font-weight:700] [&_article_small]:[letter-spacing:1.2px] [&_article_strong]:[overflow:hidden] [&_article_strong]:[color:#f4f5f7] [&_article_strong]:[font-size:18px] [&_article_strong]:[text-overflow:ellipsis] [&_article_strong]:[white-space:nowrap]"
          }
        >
          <article>
            <Clock />
            <span>
              <small>{period === "all" ? "TIEMPO TOTAL" : "TIEMPO EN 2026"}</small>
              <strong>
                {period === "all"
                  ? `${totalHours} h`
                  : formatPlaytime(Math.round(annualSeconds / 60))}
              </strong>
            </span>
          </article>
        </div>
        <label
          className={
            "period-selector [display:flex] [align-items:center] [gap:9px] [min-width:190px] [height:44px] [border:1px_solid_#ffffff14] [border-radius:12px] [padding:0_12px] [background:#ffffff08] [color:#9295a0] [&_svg]:[flex:0_0_auto] [&_svg]:[width:18px] [&_svg]:[height:18px] [&_svg]:[color:#a9fb76] [&_select]:[width:100%] [&_select]:[border:0] [&_select]:[outline:0] [&_select]:[background:transparent] [&_select]:[color:#e5e6e9] [&_select]:[cursor:pointer] [&_option]:[background:#15161e] [&_option]:[color:white]"
          }
        >
          <CalendarBlank />
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value as "all" | "2026")}
          >
            <option value="all">Total histórico</option>
            <option value="2026">Anual · 2026</option>
          </select>
        </label>
      </div>
      {period === "all" && statistics.played.length > 0 && (
        <section
          className={
            "ranking-card [padding:26px] [border:1px_solid_#ffffff0d] [border-radius:20px] [background:#101119]"
          }
        >
          <div
            className={
              "card-heading [display:flex] [justify-content:space-between] [align-items:end] [&_small]:[color:#727581] [&_small]:[font-size:9px] [&_small]:[font-weight:700] [&_small]:[letter-spacing:1.3px] [&_h2]:[margin:5px_0_0] [&_h2]:[font-size:20px] [&_>_span]:[color:#5f626e] [&_>_span]:[font-size:11px]"
            }
          >
            <div>
              <small>CLASIFICACIÓN</small>
              <h2>Tus juegos más jugados</h2>
            </div>
            <span>Ordenados por tiempo total</span>
          </div>
          <div
            className={
              "ranking-podium [display:grid] [grid-template-columns:repeat(3,_minmax(0,_1fr))] [align-items:end] [gap:12px] [max-width:820px] [margin:32px_auto_30px]"
            }
          >
            {statistics.played.slice(0, 3).map((game, index) => {
              const minutes =
                game.source === "steam"
                  ? (game.platformPlaytimeMinutes ?? 0)
                  : game.trackedPlaytimeSeconds / 60;
              const cover = gameCoverUrl(game);
              return (
                <article
                  className={`podium-game [position:relative] [min-width:0] [padding:18px_16px] [border:1px_solid_#ffffff0d] [border-radius:18px] [background:linear-gradient(180deg,_#ffffff09,_#ffffff03)] [text-align:center] [&_>_strong]:[display:block] [&_>_strong]:[overflow:hidden] [&_>_strong]:[text-overflow:ellipsis] [&_>_strong]:[white-space:nowrap] [&_>_span]:[display:block] [&_>_span]:[overflow:hidden] [&_>_span]:[text-overflow:ellipsis] [&_>_span]:[white-space:nowrap] [&_>_small]:[display:block] [&_>_small]:[overflow:hidden] [&_>_small]:[text-overflow:ellipsis] [&_>_small]:[white-space:nowrap] [&_>_strong]:[font-size:14px] [&_>_span]:[margin-top:7px] [&_>_span]:[color:#a9fb76] [&_>_span]:[font-size:18px] [&_>_span]:[font-weight:750] [&_>_small]:[margin-top:4px] [&_>_small]:[color:#686b77] [&_>_small]:[font-size:9px] podium-game-${index + 1}`}
                  key={game.id}
                >
                  <div
                    className={
                      "podium-cover [position:relative] [width:82px] [aspect-ratio:2_/_2.75] [overflow:visible] [margin:0_auto_14px] [border-radius:12px] [background:linear-gradient(135deg,_#292c39,_#171923)] [box-shadow:0_12px_28px_#00000066] [&_img]:[width:100%] [&_img]:[height:100%] [&_img]:[object-fit:cover] [&_img]:[border-radius:inherit] [&_>_span]:[display:grid] [&_>_span]:[place-items:center] [&_>_span]:[width:100%] [&_>_span]:[height:100%] [&_>_span]:[color:#a9fb76] [&_>_span]:[font-size:30px] [&_>_span]:[font-weight:800] [&_b]:[position:absolute] [&_b]:[right:-10px] [&_b]:[bottom:-8px] [&_b]:[display:grid] [&_b]:[place-items:center] [&_b]:[width:30px] [&_b]:[height:30px] [&_b]:[border:3px_solid_#101119] [&_b]:[border-radius:50%] [&_b]:[background:#737783] [&_b]:[color:#15161d] [&_b]:[font-size:13px]"
                    }
                  >
                    {cover ? (
                      <img src={cover} alt="" />
                    ) : (
                      <span>{game.title.slice(0, 1).toUpperCase()}</span>
                    )}
                    <b>{index + 1}</b>
                  </div>
                  <strong>{game.title}</strong>
                  <span>{formatPlaytime(minutes)}</span>
                  <small>
                    {Math.round((minutes / statistics.totalMinutes) * 100)}% de tu
                    tiempo
                  </small>
                </article>
              );
            })}
          </div>
          {statistics.played.length > 3 && (
            <div
              className={
                "ranking-list [overflow:hidden] [border-top:1px_solid_#ffffff0b]"
              }
            >
              {statistics.played.slice(3).map((game, index) => {
                const minutes =
                  game.source === "steam"
                    ? (game.platformPlaytimeMinutes ?? 0)
                    : game.trackedPlaytimeSeconds / 60;
                const cover = gameCoverUrl(game);
                const percentage = Math.round(
                  (minutes / statistics.totalMinutes) * 100,
                );
                return (
                  <div
                    className={
                      "ranking-row [display:grid] [grid-template-columns:28px_38px_minmax(150px,_1fr)_minmax(80px,_.8fr)_78px] [align-items:center] [gap:12px] [min-width:0] [padding:10px_8px] [border-bottom:1px_solid_#ffffff08] [&:hover]:[background:#ffffff04] [&_>_b]:[color:#676a75] [&_>_b]:[font-size:12px] [&_>_b]:[text-align:center]"
                    }
                    key={game.id}
                  >
                    <b>{index + 4}</b>
                    <div
                      className={
                        "ranking-cover [display:grid] [place-items:center] [width:38px] [height:44px] [overflow:hidden] [border-radius:8px] [background:#20222d] [color:#a9fb76] [font-size:13px] [font-weight:700] [&_img]:[width:100%] [&_img]:[height:100%] [&_img]:[object-fit:cover]"
                      }
                    >
                      {cover ? (
                        <img src={cover} alt="" />
                      ) : (
                        <span>{game.title.slice(0, 1).toUpperCase()}</span>
                      )}
                    </div>
                    <span
                      className={
                        "ranking-name [&_strong]:[overflow:hidden] [&_strong]:[font-size:12px] [&_strong]:[text-overflow:ellipsis] [&_strong]:[white-space:nowrap] [&_small]:[margin-top:4px] [&_small]:[color:#626570] [&_small]:[font-size:9px]"
                      }
                    >
                      <strong>{game.title}</strong>
                      <small>
                        {game.source === "steam" ? "Steam" : "Añadido manualmente"}
                      </small>
                    </span>
                    <div
                      className={
                        "ranking-progress [height:4px] [overflow:hidden] [border-radius:5px] [background:#ffffff0b] [&_i]:[display:block] [&_i]:[height:100%] [&_i]:[border-radius:inherit] [&_i]:[background:linear-gradient(90deg,_#a9fb76,_#67e5ae)] [&_i]:[background:linear-gradient(90deg,_var(--accent-a),_var(--accent-b))]"
                      }
                    >
                      <i style={{ width: `${Math.max(percentage, 2)}%` }} />
                    </div>
                    <span
                      className={
                        "ranking-time [text-align:right] [&_strong]:[font-size:12px] [&_small]:[margin-top:3px] [&_small]:[color:#686b76] [&_small]:[font-size:9px]"
                      }
                    >
                      <strong>{formatPlaytime(minutes)}</strong>
                      <small>{percentage}%</small>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
      {period === "all" && statistics.played.length === 0 && (
        <div
          className={
            "statistics-empty [display:grid] [place-items:center] [padding:70px_20px] [color:#686b76] [text-align:center] [&_svg]:[width:42px] [&_svg]:[height:42px] [&_svg]:[margin-bottom:15px] [&_strong]:[color:#d5d6da] [&_span]:[margin-top:6px] [&_span]:[font-size:12px]"
          }
        >
          <ChartDonut />
          <strong>Aún no hay tiempo registrado</strong>
          <span>Importa Steam o inicia un juego local desde el launcher.</span>
        </div>
      )}
      {period === "2026" && (
        <section
          className={
            "annual-card [padding:26px] [border:1px_solid_#ffffff0d] [border-radius:20px] [background:#101119]"
          }
        >
          <div
            className={
              "card-heading [display:flex] [justify-content:space-between] [align-items:end] [&_small]:[color:#727581] [&_small]:[font-size:9px] [&_small]:[font-weight:700] [&_small]:[letter-spacing:1.3px] [&_h2]:[margin:5px_0_0] [&_h2]:[font-size:20px] [&_>_span]:[color:#5f626e] [&_>_span]:[font-size:11px]"
            }
          >
            <div>
              <small>ACTIVIDAD ANUAL</small>
              <h2>Tu año jugando</h2>
            </div>
            <span>2026</span>
          </div>
          {annualRanking.length > 0 && (
            <>
              <div
                className={
                  "annual-ranking-heading [display:flex] [align-items:center] [gap:10px] [margin:25px_0_0] [color:#a9fb76] [&_>_svg]:[width:28px] [&_>_svg]:[height:28px] [&_span]:[display:block] [&_small]:[display:block] [&_strong]:[display:block] [&_small]:[color:#6c6f7a] [&_small]:[font-size:8px] [&_small]:[font-weight:700] [&_small]:[letter-spacing:1.2px] [&_strong]:[margin-top:3px] [&_strong]:[color:#e9eaed] [&_strong]:[font-size:12px]"
                }
              >
                <Trophy weight="fill" />
                <span>
                  <small>TOP DE 2026</small>
                  <strong>Los más jugados del año</strong>
                </span>
              </div>
              <div
                className={
                  "ranking-podium [display:grid] [grid-template-columns:repeat(3,_minmax(0,_1fr))] [align-items:end] [gap:12px] [max-width:820px] [margin:32px_auto_30px] annual-podium [margin-top:24px] [border-bottom:1px_solid_#ffffff0b] [padding-bottom:24px]"
                }
              >
                {annualRanking.map(({ game, seconds }, index) => {
                  const cover = gameCoverUrl(game);
                  return (
                    <article
                      className={`podium-game [position:relative] [min-width:0] [padding:18px_16px] [border:1px_solid_#ffffff0d] [border-radius:18px] [background:linear-gradient(180deg,_#ffffff09,_#ffffff03)] [text-align:center] [&_>_strong]:[display:block] [&_>_strong]:[overflow:hidden] [&_>_strong]:[text-overflow:ellipsis] [&_>_strong]:[white-space:nowrap] [&_>_span]:[display:block] [&_>_span]:[overflow:hidden] [&_>_span]:[text-overflow:ellipsis] [&_>_span]:[white-space:nowrap] [&_>_small]:[display:block] [&_>_small]:[overflow:hidden] [&_>_small]:[text-overflow:ellipsis] [&_>_small]:[white-space:nowrap] [&_>_strong]:[font-size:14px] [&_>_span]:[margin-top:7px] [&_>_span]:[color:#a9fb76] [&_>_span]:[font-size:18px] [&_>_span]:[font-weight:750] [&_>_small]:[margin-top:4px] [&_>_small]:[color:#686b77] [&_>_small]:[font-size:9px] podium-game-${index + 1}`}
                      key={game.id}
                    >
                      <div
                        className={
                          "podium-cover [position:relative] [width:82px] [aspect-ratio:2_/_2.75] [overflow:visible] [margin:0_auto_14px] [border-radius:12px] [background:linear-gradient(135deg,_#292c39,_#171923)] [box-shadow:0_12px_28px_#00000066] [&_img]:[width:100%] [&_img]:[height:100%] [&_img]:[object-fit:cover] [&_img]:[border-radius:inherit] [&_>_span]:[display:grid] [&_>_span]:[place-items:center] [&_>_span]:[width:100%] [&_>_span]:[height:100%] [&_>_span]:[color:#a9fb76] [&_>_span]:[font-size:30px] [&_>_span]:[font-weight:800] [&_b]:[position:absolute] [&_b]:[right:-10px] [&_b]:[bottom:-8px] [&_b]:[display:grid] [&_b]:[place-items:center] [&_b]:[width:30px] [&_b]:[height:30px] [&_b]:[border:3px_solid_#101119] [&_b]:[border-radius:50%] [&_b]:[background:#737783] [&_b]:[color:#15161d] [&_b]:[font-size:13px]"
                        }
                      >
                        {cover ? (
                          <img src={cover} alt="" />
                        ) : (
                          <span>{game.title.slice(0, 1).toUpperCase()}</span>
                        )}
                        <b>{index + 1}</b>
                      </div>
                      <strong>{game.title}</strong>
                      <span>{formatPlaytime(Math.round(seconds / 60))}</span>
                      <small>Jugado en 2026</small>
                    </article>
                  );
                })}
              </div>
            </>
          )}
          <div
            className={
              "months-grid [display:grid] [grid-template-columns:repeat(3,_minmax(0,_1fr))] [gap:12px] [margin-top:24px]"
            }
          >
            {months.map((month, index) => (
              <article
                className={`month-card [min-width:0] [min-height:178px] [overflow:hidden] [border:1px_solid_#ffffff0d] [border-radius:15px] [padding:15px] [background:#ffffff05] [&_>_header]:[display:grid] [&_>_header]:[grid-template-columns:27px_minmax(0,_1fr)_auto] [&_>_header]:[align-items:center] [&_>_header]:[gap:8px] [&_>_header]:[padding-bottom:12px] [&_>_header]:[border-bottom:1px_solid_#ffffff0b] [&_>_header_>_span]:[color:#a9fb76] [&_>_header_>_span]:[font-size:10px] [&_>_header_>_span]:[font-weight:800] [&_>_header_>_strong]:[overflow:hidden] [&_>_header_>_strong]:[font-size:13px] [&_>_header_>_strong]:[text-transform:capitalize] [&_>_header_>_strong]:[text-overflow:ellipsis] [&_>_header_>_strong]:[white-space:nowrap] [&_>_header_>_small]:[color:#626570] [&_>_header_>_small]:[font-size:9px] [&_>_p]:[margin:34px_0_0] [&_>_p]:[color:#51545f] [&_>_p]:[font-size:10px] [&_>_p]:[text-align:center] [&.empty]:[opacity:.65] ${month.entries.length === 0 ? "empty" : ""}`}
                key={month.name}
              >
                <header>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{month.name}</strong>
                  <small>
                    {month.entries.length}{" "}
                    {month.entries.length === 1 ? "juego" : "juegos"}
                  </small>
                </header>
                {month.entries.length > 0 ? (
                  <div
                    className={
                      "month-games [display:grid] [gap:8px] [margin-top:11px] [&_>_div]:[display:grid] [&_>_div]:[grid-template-columns:34px_minmax(0,_1fr)] [&_>_div]:[align-items:center] [&_>_div]:[gap:9px] [&_>_div]:[min-width:0] [&_strong]:[display:block] [&_strong]:[overflow:hidden] [&_strong]:[text-overflow:ellipsis] [&_strong]:[white-space:nowrap] [&_small]:[display:block] [&_small]:[overflow:hidden] [&_small]:[text-overflow:ellipsis] [&_small]:[white-space:nowrap] [&_strong]:[font-size:11px] [&_small]:[margin-top:3px] [&_small]:[color:#696c77] [&_small]:[font-size:9px]"
                    }
                  >
                    {month.entries.map(({ game, seconds }) => {
                      const cover = gameCoverUrl(game);
                      return (
                        <div key={game.id}>
                          <span
                            className={
                              "month-cover [display:grid] [place-items:center] [width:34px] [height:40px] [overflow:hidden] [border-radius:7px] [background:#22242f] [color:#a9fb76] [font-size:11px] [font-weight:700] [&_img]:[width:100%] [&_img]:[height:100%] [&_img]:[object-fit:cover]"
                            }
                          >
                            {cover ? (
                              <img src={cover} alt="" />
                            ) : (
                              game.title.slice(0, 1).toUpperCase()
                            )}
                          </span>
                          <span>
                            <strong>{game.title}</strong>
                            <small>
                              {seconds > 0
                                ? formatPlaytime(Math.round(seconds / 60))
                                : "Horas no disponibles"}
                            </small>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p>Sin actividad registrada</p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
