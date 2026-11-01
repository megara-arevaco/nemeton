import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { GameSession, LibraryGame } from "@launcher/core";
import { Button } from "../Button";

export function GameSessions({
  sessions,
  copies,
}: {
  sessions: GameSession[];
  copies: LibraryGame[];
}) {
  const { t, i18n } = useTranslation();
  const [limit, setLimit] = useState(5);
  const ordered = [...sessions].sort((a, b) => b.endedAt.localeCompare(a.endedAt));
  return (
    <section className="game-copies game-session-history">
      <h2>{t("sessions.title")}</h2>
      {!ordered.length ? (
        <p>{t("sessions.empty")}</p>
      ) : (
        <>
          <div className="sessions-table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>{t("sessions.date")}</th>
                  <th>{t("sessions.duration")}</th>
                  <th>{t("sessions.origin")}</th>
                </tr>
              </thead>
              <tbody>
                {ordered.slice(0, limit).map((session) => {
                  const copy = copies.find(
                    (copy) => copy.id === session.copyId || copy.id === session.gameId,
                  );
                  const minutes = Math.floor(session.durationSeconds / 60);
                  return (
                    <tr key={session.id}>
                      <td>
                        <time dateTime={session.endedAt}>
                          {new Date(session.endedAt).toLocaleString(i18n.language)}
                        </time>
                      </td>
                      <td>
                        {minutes > 0
                          ? `${minutes} min`
                          : `${Math.floor(session.durationSeconds)} s`}
                      </td>
                      <td>
                        {t(`stores.${copy?.source ?? "local"}`)} ·{" "}
                        {t(
                          session.origin === "launcher" || !session.origin
                            ? "sessions.measured"
                            : "sessions.imported",
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {ordered.length > limit && (
            <Button size="small" variant="ghost" onClick={() => setLimit(limit + 20)}>
              {t("sessions.more")}
            </Button>
          )}
          <p>{t("sessions.historyHelp")}</p>
        </>
      )}
    </section>
  );
}
