import { useMemo, useState } from "react";
import type { GameSession, LibraryGame } from "@launcher/core";
import { formatPlaytime } from "../../shared/presentation";

export interface MonthlyActivity {
  month: number;
  entries: Array<{ game: LibraryGame; seconds: number }>;
}

export function buildMonthlyActivity(
  games: LibraryGame[],
  sessions: GameSession[],
  year: number,
): MonthlyActivity[] {
  const gamesById = new Map(games.map((game) => [game.id, game]));
  const activityByMonth = Array.from(
    { length: 12 },
    () => new Map<string, { launcherSeconds: number; steamSeconds: number }>(),
  );

  for (const session of sessions) {
    const date = new Date(session.endedAt);
    if (date.getFullYear() !== year) {
      continue;
    }
    const activity = activityByMonth[date.getMonth()]!;
    const previous = activity.get(session.gameId) ?? {
      launcherSeconds: 0,
      steamSeconds: 0,
    };
    if (session.origin === "steam-sync")
      previous.steamSeconds += session.durationSeconds;
    else {
      previous.launcherSeconds += session.durationSeconds;
    }
    activity.set(session.gameId, previous);
  }

  for (const game of games) {
    if (!game.lastPlayedAt) {
      continue;
    }
    const date = new Date(game.lastPlayedAt);
    if (
      date.getFullYear() === year &&
      !activityByMonth[date.getMonth()]!.has(game.id)
    ) {
      activityByMonth[date.getMonth()]!.set(game.id, {
        launcherSeconds: 0,
        steamSeconds: 0,
      });
    }
  }

  return activityByMonth.map((activity, month) => ({
    month,
    entries: [...activity.entries()]
      .flatMap(([gameId, data]) => {
        const game = gamesById.get(gameId);
        return game
          ? [
              {
                game,
                seconds: Math.max(data.launcherSeconds, data.steamSeconds),
              },
            ]
          : [];
      })
      .sort(
        (a, b) =>
          b.seconds - a.seconds || a.game.title.localeCompare(b.game.title),
      ),
  }));
}

export function useStatisticsView(
  games: LibraryGame[],
  sessions: GameSession[],
) {
  const [period, setPeriod] = useState<"all" | "2026">("all");
  const [summaryPeriod, setSummaryPeriod] = useState<"week" | "month">("week");
  const statistics = useMemo(() => {
    const minutesFor = (game: LibraryGame) =>
      game.source === "steam"
        ? (game.platformPlaytimeMinutes ?? 0)
        : game.trackedPlaytimeSeconds / 60;
    const played = games
      .filter((game) => minutesFor(game) > 0)
      .sort((a, b) => minutesFor(b) - minutesFor(a));
    const totalMinutes = played.reduce(
      (total, game) => total + minutesFor(game),
      0,
    );
    return { played, totalMinutes };
  }, [games]);

  const totalHours = Math.round((statistics.totalMinutes / 60) * 10) / 10;
  const months = useMemo(() => {
    const formatter = new Intl.DateTimeFormat("es-ES", { month: "long" });
    return buildMonthlyActivity(games, sessions, 2026).map(
      ({ month, entries }) => ({
        name: formatter.format(new Date(2026, month, 1)),
        entries,
      }),
    );
  }, [games, sessions]);
  const annualSeconds = months.reduce(
    (total, month) =>
      total +
      month.entries.reduce(
        (monthTotal, entry) => monthTotal + entry.seconds,
        0,
      ),
    0,
  );
  const annualRanking = useMemo(() => {
    const totals = new Map<string, number>();
    months.forEach((month) =>
      month.entries.forEach((entry) =>
        totals.set(
          entry.game.id,
          (totals.get(entry.game.id) ?? 0) + entry.seconds,
        ),
      ),
    );
    const gamesById = new Map(games.map((game) => [game.id, game]));
    return [...totals.entries()]
      .flatMap(([gameId, seconds]) => {
        const game = gamesById.get(gameId);
        return game && seconds > 0 ? [{ game, seconds }] : [];
      })
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 3);
  }, [games, months]);
  const automaticSummary = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const currentMonday = new Date(startOfToday);
    currentMonday.setDate(
      currentMonday.getDate() - ((currentMonday.getDay() + 6) % 7),
    );
    const previousMonday = new Date(currentMonday);
    previousMonday.setDate(previousMonday.getDate() - 7);
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const periodStart = summaryPeriod === "week" ? currentMonday : currentMonth;
    const previousStart =
      summaryPeriod === "week" ? previousMonday : previousMonth;
    const valid = sessions
      .map((session) => ({ ...session, ended: new Date(session.endedAt) }))
      .filter(
        (session) =>
          !Number.isNaN(session.ended.getTime()) && session.durationSeconds > 0,
      );
    const current = valid.filter((session) => session.ended >= periodStart);
    const previous = valid.filter(
      (session) =>
        session.ended >= previousStart && session.ended < periodStart,
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
      const periodName = summaryPeriod === "week" ? "semana" : "mes";
      const comparison =
        previousSeconds === 0
          ? `y no registraste actividad ${summaryPeriod === "week" ? "la semana" : "el mes"} anterior`
          : `${Math.abs(Math.round(((currentSeconds - previousSeconds) / previousSeconds) * 100))} % ${currentSeconds >= previousSeconds ? "más" : "menos"} que ${summaryPeriod === "week" ? "la semana" : "el mes"} anterior`;
      cards.push({
        label: summaryPeriod === "week" ? "ESTA SEMANA" : "ESTE MES",
        text: `Has jugado ${formatPlaytime(Math.round(currentSeconds / 60))} este ${periodName}, ${comparison}.`,
      });
    }
    if (top) {
      const game = games.find((item) => item.id === top[0]);
      if (game) {
        cards.push({
          label: "MÁS JUGADO",
          text: `${game.title} lidera tu ${summaryPeriod === "week" ? "semana" : "mes"} con ${formatPlaytime(Math.round(top[1] / 60))}.`,
        });
      }
    }
    if (longest) {
      const game = games.find((item) => item.id === longest.gameId);
      if (game) {
        cards.push({
          label: "SESIÓN MÁS LARGA",
          text: `${game.title}: ${formatPlaytime(Math.round(longest.durationSeconds / 60))} el ${new Intl.DateTimeFormat("es-ES", { weekday: "long" }).format(longest.ended)}.`,
        });
      }
    }
    const byGameSessions = new Map<string, typeof valid>();
    valid.forEach((session) =>
      byGameSessions.set(session.gameId, [
        ...(byGameSessions.get(session.gameId) ?? []),
        session,
      ]),
    );
    let comeback: { gameId: string; days: number; ended: Date } | null = null;
    byGameSessions.forEach((items, gameId) => {
      const ordered = items.sort(
        (a, b) => a.ended.getTime() - b.ended.getTime(),
      );
      for (let index = 1; index < ordered.length; index += 1) {
        const ended = ordered[index]!.ended;
        const days = Math.floor(
          (ended.getTime() - ordered[index - 1]!.ended.getTime()) / 86_400_000,
        );
        if (
          ended >= periodStart &&
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
          label: "DE VUELTA",
          text: `Retomaste ${game.title} después de ${resolvedComeback.days} días.`,
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
        label: "RACHA ACTUAL",
        text: `Llevas ${streak} días consecutivos jugando.`,
      });
    }

    if (!cards.length) {
      cards.push({
        label: "SIN ACTIVIDAD RECIENTE",
        text: `Inicia un juego desde Nemeton para generar tu resumen ${summaryPeriod === "week" ? "semanal" : "mensual"}.`,
      });
    }
    return cards;
  }, [games, sessions, summaryPeriod]);

  return {
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
  };
}
