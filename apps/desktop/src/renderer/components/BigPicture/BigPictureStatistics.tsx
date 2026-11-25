import type { GameSession, LibraryGame } from "@launcher/core";
import { Clock } from "@phosphor-icons/react/Clock";
import { GameController } from "@phosphor-icons/react/GameController";
import { useTranslation } from "react-i18next";
import { formatPlaytime } from "../../shared/presentation";
import { GameCoverImage } from "../GameCoverImage";
import { useStatisticsView } from "../StatisticsView/StatisticsView.hook";

export function BigPictureStatistics({
  games,
  sessions,
}: Readonly<{ games: LibraryGame[]; sessions: GameSession[] }>) {
  const { t } = useTranslation();
  const { period, setPeriod, statistics, periodSeconds, periodRanking } =
    useStatisticsView(games, sessions);
  const ranking =
    period === "all"
      ? statistics.played.slice(0, 5).map((game) => ({
          game,
          seconds: game.playtimeMinutes * 60 + (game.playtimeSecondsRemainder ?? 0),
        }))
      : periodRanking.slice(0, 5);
  const maxSeconds = ranking[0]?.seconds || 1;

  return (
    <section
      className="big-picture-statistics"
      aria-labelledby="big-picture-statistics-title"
    >
      <header>
        <h1 id="big-picture-statistics-title">{t("statistics.title")}</h1>
        <div
          className="big-picture-statistics-periods"
          role="group"
          aria-label={t("statistics.periodLabel")}
        >
          {(
            [
              ["week", t("statistics.week")],
              ["month", t("statistics.month")],
              ["2026", "2026"],
              ["all", t("statistics.allTime")],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <div className="big-picture-statistics-body">
        <div className="big-picture-statistics-total">
          <Clock aria-hidden />
          <span>
            {t(
              period === "week"
                ? "statistics.timeThisWeek"
                : period === "month"
                  ? "statistics.timeThisMonth"
                  : period === "2026"
                    ? "statistics.timeThisYear"
                    : "statistics.totalTime",
              { year: 2026 },
            )}
          </span>
          <strong>
            {formatPlaytime(
              period === "all" ? statistics.totalMinutes : periodSeconds / 60,
            )}
          </strong>
        </div>
        <div className="big-picture-statistics-ranking">
          <h2>{t("statistics.mostPlayed")}</h2>
          {ranking.length ? (
            <ol>
              {ranking.map(({ game, seconds }) => (
                <li key={game.id}>
                  <div className="big-picture-statistics-cover">
                    <GameController aria-hidden />
                    <GameCoverImage game={game} alt="" />
                  </div>
                  <div className="big-picture-statistics-entry">
                    <strong>{game.title}</strong>
                    <div aria-hidden className="big-picture-statistics-bar">
                      <span style={{ width: `${(seconds / maxSeconds) * 100}%` }} />
                    </div>
                  </div>
                  <span>{formatPlaytime(seconds / 60)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p>{t("statistics.noTime")}</p>
          )}
        </div>
      </div>
    </section>
  );
}
