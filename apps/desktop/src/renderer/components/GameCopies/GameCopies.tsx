import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryGame, LibrarySnapshot } from "@launcher/core";
import type { GameGroup } from "@launcher/core/library/groups";
import { formatPlaytime } from "../../shared/presentation";
import { Button } from "../Button";

export function GameCopies({
  group,
  selected,
  games,
  onSelect,
  onUpdated,
}: {
  group: GameGroup;
  selected: LibraryGame;
  games: LibraryGame[];
  onSelect: (id: string) => void;
  onUpdated: (snapshot: LibrarySnapshot) => void;
}) {
  const { t } = useTranslation();
  const [target, setTarget] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (action: () => Promise<LibrarySnapshot>) => {
    setBusy(true);
    setError("");
    try {
      onUpdated(await action());
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const copyIds = group.copies
    .filter((copy) => copy.source === "gog")
    .map((copy) => copy.id)
    .join(",");
  useEffect(() => {
    for (const id of copyIds.split(",").filter(Boolean)) {
      void window.launcher.refreshCopyPlaytime(id).catch(() => undefined);
    }
  }, [copyIds]);
  const candidates = games
    .filter(
      (game) =>
        game.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
        !game.hiddenFromLibrary &&
        !group.copies.some((copy) => copy.id === game.id),
    )
    .slice(0, 50);
  return (
    <section className="game-copies" aria-label={t("copies.title")}>
      <header>
        <div>
          <h2>{t("copies.title")}</h2>
          <p>
            {t("copies.total", {
              time: formatPlaytime(group.totalSeconds / 60),
              count: group.copies.length,
            })}
          </p>
        </div>
        {!group.historyComplete && (
          <span className="copies-partial">{t("copies.partial")}</span>
        )}
      </header>
      <div className="copy-list">
        {group.copies.map((copy) => (
          <div
            key={copy.id}
            className={selected.id === copy.id ? "copy selected" : "copy"}
          >
            <div>
              <strong>{t(`stores.${copy.source}`)}</strong>
              <span>
                {copy.installed ? t("app.installed") : t("sidebar.notInstalled")}
              </span>
            </div>
            <div>
              <strong>{formatPlaytime(copy.playtimeMinutes)}</strong>
              <small>
                {copy.source !== "local" && copy.platformPlaytimeMinutes === null
                  ? t("copies.localTime")
                  : t("copies.providerTime")}
              </small>
            </div>
            <Button
              size="small"
              variant={selected.id === copy.id ? "setup" : "secondary"}
              aria-pressed={selected.id === copy.id}
              onClick={() => onSelect(copy.id)}
            >
              {selected.id === copy.id ? t("copies.selected") : t("copies.select")}
            </Button>
            {group.copies.length > 1 && (
              <Button
                size="small"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void run(() => window.launcher.linkGameCopies([copy.id], null))
                }
              >
                {t("copies.unlink")}
              </Button>
            )}
          </div>
        ))}
      </div>
      <details>
        <summary>{t("copies.manage")}</summary>
        <p>{t("copies.matchHelp")}</p>
        <label className="copy-search">
          {t("copies.search")}
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setTarget("");
            }}
          />
        </label>
        <div className="copy-link-form">
          <label>
            {t("copies.otherCopy")}
            <select value={target} onChange={(event) => setTarget(event.target.value)}>
              <option value="">{t("copies.choose")}</option>
              {candidates.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.title} · {t(`stores.${game.source}`)}
                </option>
              ))}
            </select>
          </label>
          <Button
            disabled={!target || busy}
            onClick={() =>
              void run(async () => {
                const result = await window.launcher.linkGameCopies(
                  [...group.copies.map((copy) => copy.id), target],
                  group.id,
                );
                setTarget("");
                return result;
              })
            }
          >
            {t("copies.link")}
          </Button>
        </div>
      </details>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
