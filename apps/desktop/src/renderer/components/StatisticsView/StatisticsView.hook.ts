import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GameSession, LibraryGame } from "@launcher/core";
import { formatPlaytime } from "../../shared/presentation";
export interface MonthlyActivity {
  month: number;
  entries: Array<{ game: LibraryGame; seconds: number }>;
}

interface ActivityEntry {
  game: LibraryGame;
  seconds: number;
}

function buildActivity(
  games: LibraryGame[],
  sessions: GameSession[],
  includesDate: (date: Date) => boolean,
  count: number,
  bucketFor: (date: Date) => number,
): ActivityEntry[][] {
  const gamesById = new Map(games.map((game) => [game.id, game]));
  const buckets = Array.from(
    { length: count },
    () => new Map<string, { launcherSeconds: number; steamSeconds: number }>(),
  );

  for (const session of sessions) {
    const date = new Date(session.endedAt);

    if (!includesDate(date)) {
      continue;
    }

    const activity = buckets[bucketFor(date)]!;
    const previous = activity.get(session.gameId) ?? {
      launcherSeconds: 0,
      steamSeconds: 0,
    };

    if (session.origin === "steam-sync") {
      previous.steamSeconds += session.durationSeconds;
    } else {
      previous.launcherSeconds += session.durationSeconds;
    }
    activity.set(session.gameId, previous);
  }

  for (const game of games) {
    if (!game.lastPlayedAt) {
      continue;
    }

    const date = new Date(game.lastPlayedAt);

    if (includesDate(date) && !buckets[bucketFor(date)]!.has(game.id)) {
      buckets[bucketFor(date)]!.set(game.id, {
        launcherSeconds: 0,
        steamSeconds: 0,
      });
    }
  }

  return buckets.map((activity) =>
    [...activity.entries()]
      .flatMap(([gameId, data]) => {
        const game = gamesById.get(gameId);
        return game
          ? [{ game, seconds: Math.max(data.launcherSeconds, data.steamSeconds) }]
          : [];
      })
      .sort(
        (a, b) => b.seconds - a.seconds || a.game.title.localeCompare(b.game.title),
      ),
  );
}

export function buildMonthlyActivity(
  games: LibraryGame[],
  sessions: GameSession[],
  year: number,
): MonthlyActivity[] {
  return buildActivity(
    games,
    sessions,
    (date) => date.getFullYear() === year,
    12,
    (date) => date.getMonth(),
  ).map((entries, month) => ({ month, entries }));
}

export function buildCurrentActivity(
  games: LibraryGame[],
  sessions: GameSession[],
  period: "week" | "month",
  now: Date,
) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === "week") {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  } else {
    start.setDate(1);
  }

  const end = new Date(start);

  if (period === "week") {
    end.setDate(end.getDate() + 7);
  } else {
    end.setMonth(end.getMonth() + 1);
  }

  const includesDate = (date: Date) => date >= start && date < end;
  // Calendar dates keep the day boundaries correct across daylight-saving changes.
  const calendarDay = (date: Date) =>
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
  const count = calendarDay(end) - calendarDay(start);
  const days = buildActivity(
    games,
    sessions,
    includesDate,
    count,
    (date) => calendarDay(date) - calendarDay(start),
  ).map((entries, index) => {
    const date = new Date(start);
    date.setDate(date.getDate() + index);
    return { date, entries };
  });
  const ranking = buildActivity(games, sessions, includesDate, 1, () => 0)[0]!.filter(
    (entry) => entry.seconds > 0,
  );
  return { start, end, days, ranking };
}

export type StatisticsPeriod = "all" | "2026" | "week" | "month";

export function useStatisticsView(games: LibraryGame[], sessions: GameSession[]) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("en") ? "en-US" : "es-ES";
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const now = new Date();
    const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timer = setTimeout(
      () => setToday(new Date()),
      nextDay.getTime() - now.getTime(),
    );
    return () => clearTimeout(timer);
  }, [today]);
  const [period, setPeriod] = useState<StatisticsPeriod>("all");
  const [historyView, setHistoryView] = useState<"calendar" | "ranking">("calendar");
  const [summaryPeriod, setSummaryPeriod] = useState<"week" | "month">("week");
  const statistics = useMemo(() => {
    const minutesFor = (game: LibraryGame) =>
      game.source === "steam"
        ? (game.platformPlaytimeMinutes ?? 0)
        : game.trackedPlaytimeSeconds / 60;
    const played = games
      .filter((game) => minutesFor(game) > 0)
      .sort((a, b) => minutesFor(b) - minutesFor(a));
    const totalMinutes = played.reduce((total, game) => total + minutesFor(game), 0);
    return { played, totalMinutes };
  }, [games]);

  const totalHours = Math.round((statistics.totalMinutes / 60) * 10) / 10;
  const months = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: "long" });
    return buildMonthlyActivity(games, sessions, 2026).map(({ month, entries }) => ({
      name: formatter.format(new Date(2026, month, 1)),
      dates: undefined,
      entries,
    }));
  }, [games, sessions, locale]);
  const currentActivity = useMemo(
    () =>
      buildCurrentActivity(
        games,
        sessions,
        period === "month" ? "month" : "week",
        today,
      ),
    [games, sessions, period, today],
  );
  const dayFormatter = new Intl.DateTimeFormat(locale, { weekday: "long" });
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const activityPeriods =
    period === "2026"
      ? months
      : currentActivity.days.map(({ date, entries }) => ({
          name: dayFormatter.format(date),
          dates: dateFormatter.format(date),
          entries,
        }));
  const lastDay = new Date(currentActivity.end);
  lastDay.setDate(lastDay.getDate() - 1);
  const periodDates =
    period === "2026"
      ? "2026"
      : dateFormatter.formatRange(currentActivity.start, lastDay);
  const annualSeconds = months.reduce(
    (total, month) =>
      total +
      month.entries.reduce((monthTotal, entry) => monthTotal + entry.seconds, 0),
    0,
  );
  const yearRanking = useMemo(() => {
    const totals = new Map<string, number>();
    months.forEach((month) =>
      month.entries.forEach((entry) =>
        totals.set(entry.game.id, (totals.get(entry.game.id) ?? 0) + entry.seconds),
      ),
    );
    const gamesById = new Map(games.map((game) => [game.id, game]));
    return [...totals.entries()]
      .flatMap(([gameId, seconds]) => {
        const game = gamesById.get(gameId);
        return game && seconds > 0 ? [{ game, seconds }] : [];
      })
      .sort(
        (a, b) => b.seconds - a.seconds || a.game.title.localeCompare(b.game.title),
      );
  }, [games, months]);
  const periodRanking = period === "2026" ? yearRanking : currentActivity.ranking;
  const periodSeconds =
    period === "2026"
      ? annualSeconds
      : periodRanking.reduce((total, entry) => total + entry.seconds, 0);
  const automaticSummary = useMemo(() => {
    const now = today;
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const currentMonday = new Date(startOfToday);
    currentMonday.setDate(currentMonday.getDate() - ((currentMonday.getDay() + 6) % 7));
    const previousMonday = new Date(currentMonday);
    previousMonday.setDate(previousMonday.getDate() - 7);
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const periodStart = summaryPeriod === "week" ? currentMonday : currentMonth;
    const previousStart = summaryPeriod === "week" ? previousMonday : previousMonth;
    const periodEnd = new Date(periodStart);

    if (summaryPeriod === "week") {
      periodEnd.setDate(periodEnd.getDate() + 7);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    const valid = sessions
      .map((session) => ({ ...session, ended: new Date(session.endedAt) }))
      .filter(
        (session) =>
          !Number.isNaN(session.ended.getTime()) && session.durationSeconds > 0,
      );
    const current = valid.filter(
      (session) => session.ended >= periodStart && session.ended < periodEnd,
    );
    const previous = valid.filter(
      (session) => session.ended >= previousStart && session.ended < periodStart,
    );
    const currentSeconds = current.reduce(
      (sum, session) => sum + session.durationSeconds,
      0,
    );
    const previousSeconds = previous.reduce(
      (sum, session) => sum + session.durationSeconds,
      0,
    );
    const byGame = new Map<string, number>();
    current.forEach((session) =>
      byGame.set(
        session.gameId,
        (byGame.get(session.gameId) ?? 0) + session.durationSeconds,
      ),
    );
    const top = [...byGame].sort((a, b) => b[1] - a[1])[0];
    const longest = [...current].sort(
      (a, b) => b.durationSeconds - a.durationSeconds,
    )[0];
    const cards: Array<{ label: string; text: string }> = [];

    if (currentSeconds > 0) {
      const period = summaryPeriod === "week" ? "Week" : "Month";
      const comparison =
        previousSeconds === 0
          ? t(`summary.noPrevious${period}`)
          : t(`summary.${currentSeconds >= previousSeconds ? "more" : "less"}${period}`, {
              percentage: Math.abs(
                Math.round(((currentSeconds - previousSeconds) / previousSeconds) * 100),
              ),
            });
      cards.push({
        label: t(summaryPeriod === "week" ? "summary.weekLabel" : "summary.monthLabel"),
        text: t(summaryPeriod === "week" ? "summary.playedWeek" : "summary.playedMonth", {
          time: formatPlaytime(Math.round(currentSeconds / 60)),
          comparison,
        }),
      });
    }
    if (top) {
      const game = games.find((item) => item.id === top[0]);

      if (game) {
        cards.push({
          label: t("summary.topLabel"),
          text: t("summary.top", {
            game: game.title,
            period: t(summaryPeriod === "week" ? "summary.week" : "summary.month"),
            time: formatPlaytime(Math.round(top[1] / 60)),
          }),
        });
      }
    }
    if (longest) {
      const game = games.find((item) => item.id === longest.gameId);

      if (game) {
        cards.push({
          label: t("summary.longestLabel"),
          text: t("summary.longest", {
            game: game.title,
            time: formatPlaytime(Math.round(longest.durationSeconds / 60)),
            weekday: new Intl.DateTimeFormat(locale, { weekday: "long" }).format(longest.ended),
          }),
        });
      }
    }

    const byGameSessions = new Map<string, typeof valid>();

    for (const session of valid) {
      const items = byGameSessions.get(session.gameId);

      if (items) {
        items.push(session);
      } else {
        byGameSessions.set(session.gameId, [session]);
      }
    }

    let comeback: { gameId: string; days: number; ended: Date } | null = null;
    byGameSessions.forEach((items, gameId) => {
      const ordered = items.sort((a, b) => a.ended.getTime() - b.ended.getTime());

      for (let index = 1; index < ordered.length; index += 1) {
        const ended = ordered[index]!.ended;
        const days = Math.floor(
          (ended.getTime() - ordered[index - 1]!.ended.getTime()) / 86_400_000,
        );

        if (
          ended >= periodStart &&
          ended < periodEnd &&
          days >= 30 &&
          (!comeback || days > comeback.days)
        ) {
          comeback = { gameId, days, ended };
        }
      }
    });
    if (comeback) {
      const resolvedComeback = comeback as {
        gameId: string;
        days: number;
        ended: Date;
      };
      const game = games.find((item) => item.id === resolvedComeback.gameId);

      if (game) {
        cards.push({
          label: t("summary.comebackLabel"),
          text: t("summary.comeback", { game: game.title, days: resolvedComeback.days }),
        });
      }
    }

    const activeDays = [
      ...new Set(
        valid.map(
          (session) =>
            `${session.ended.getFullYear()}-${session.ended.getMonth()}-${session.ended.getDate()}`,
        ),
      ),
    ]
      .map((key) => {
        const [year, month, day] = key.split("-").map(Number);
        return new Date(year!, month!, day!);
      })
      .sort((a, b) => b.getTime() - a.getTime());
    let streak = activeDays.length ? 1 : 0;

    for (let index = 1; index < activeDays.length; index += 1) {
      if (
        activeDays[index - 1]!.getTime() - activeDays[index]!.getTime() !==
        86_400_000
      ) {
        break;
      }
      streak += 1;
    }
    if (
      streak >= 2 &&
      startOfToday.getTime() - activeDays[0]!.getTime() <= 86_400_000
    ) {
      cards.push({
        label: t("summary.streakLabel"),
        text: t("summary.streak", { days: streak }),
      });
    }

    if (!cards.length) {
      cards.push({
        label: t("summary.noneLabel"),
        text: t(summaryPeriod === "week" ? "summary.noneWeek" : "summary.noneMonth"),
      });
    }
    return cards;
  }, [games, sessions, summaryPeriod, today, locale, t]);

  return {
    period,
    setPeriod,
    summaryPeriod,
    setSummaryPeriod,
    historyView,
    setHistoryView,
    statistics,
    totalHours,
    months,
    activityPeriods,
    periodDates,
    periodSeconds,
    periodRanking,
    annualRanking: yearRanking.slice(0, 3),
    automaticSummary,
  };
}
