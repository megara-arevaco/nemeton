import { useVirtualCollection, CARD_HEIGHT } from "../../shared/virtualCollection";
import { useTranslation } from "react-i18next";
import { memo, useEffect, useId, useState } from "react";
import type { LibraryGame } from "@launcher/core";
import type { ReactNode } from "react";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { LibraryGameCard } from "./LibraryGameCard";

export const LibraryCollection = memo(function LibraryCollection({
  games,
  recentGames,
  installedOnly,
  onInstalledChange,
  emptyState,
  runningGameIds,
  onSelect,
  intro,
}: Readonly<{
  intro?: ReactNode;
  games: LibraryGame[];
  recentGames: LibraryGame[];
  installedOnly: boolean;
  onInstalledChange: (value: boolean) => void;
  emptyState?: ReactNode;
  runningGameIds: Set<string>;
  onSelect: (gameId: string) => void;
}>) {
  const { t } = useTranslation();
  const collectionId = useId();
  const recentId = useId();
  const [expanded, setExpanded] = useState(
    () => localStorage.getItem("nemeton.library.collectionExpanded") !== "false",
  );
  useEffect(() => {
    localStorage.setItem("nemeton.library.collectionExpanded", String(expanded));
  }, [expanded]);
  const { scrollRef, gridRef, range, virtual, activeIndex, setActiveId, onKeyDown } =
    useVirtualCollection(games);
  return (
    <div
      ref={scrollRef}
      className="library-collection-view [min-height:0] [overflow-y:auto] [padding:0_34px_34px]"
    >
      {intro}
      <section
        className="library-section recent-activity-section"
        aria-labelledby={recentId}
      >
        <div className="library-section-heading">
          <div>
            <small>{t("library.recentEyebrow")}</small>
            <h2 id={recentId}>{t("library.recentActivity")}</h2>
          </div>
          <span className="library-section-count">{t("library.recentOrder")}</span>
        </div>
        {recentGames.length ? (
          <div
            className="recent-activity-grid"
            role="group"
            aria-label={t("library.recentActivity")}
          >
            {recentGames.map((game, index) => (
              <LibraryGameCard
                key={game.id}
                game={game}
                gameIndex={index}
                total={recentGames.length}
                running={runningGameIds.has(game.id)}
                showActivity
                onOpen={() => onSelect(game.id)}
              />
            ))}
          </div>
        ) : (
          <p className="library-recent-empty">{t("library.noRecentActivity")}</p>
        )}
      </section>
      <section className="library-section installed-section">
        <h2 className="library-section-heading library-collection-heading">
          <button
            type="button"
            className="library-section-toggle"
            aria-label={t("library.collectionToggle")}
            aria-expanded={expanded}
            aria-controls={collectionId}
            onClick={() => setExpanded((value) => !value)}
          >
            <span className="library-section-heading-copy">
              <small>{t("library.collection")}</small>
              <strong>{t("library.title")}</strong>
            </span>
            <span className="library-section-count">
              {games.length}{" "}
              {games.length === 1 ? t("library.oneGame") : t("library.games")}
            </span>
            <CaretDown aria-hidden="true" />
          </button>
        </h2>
        <div id={collectionId} hidden={!expanded}>
          <div className="library-collection-toolbar">
            <label className="library-check">
              <input
                type="checkbox"
                checked={installedOnly}
                onChange={(event) => onInstalledChange(event.target.checked)}
              />
              {t("library.installedOnly")}
            </label>
          </div>
          {games.length === 0 && emptyState}
          <div
            ref={gridRef}
            onKeyDown={onKeyDown}
            role="group"
            aria-label={t("library.gridLabel")}
            style={{ paddingTop: range.top, paddingBottom: range.bottom }}
            className="installed-grid [display:grid] [grid-template-columns:repeat(auto-fill,_minmax(190px,_1fr))] [gap:14px]"
          >
            {games.slice(range.start, range.end).map((game, visibleIndex) => {
              const gameIndex = range.start + visibleIndex;
              return (
                <LibraryGameCard
                  key={game.id}
                  game={game}
                  gameIndex={gameIndex}
                  total={games.length}
                  running={runningGameIds.has(game.id)}
                  onOpen={() => onSelect(game.id)}
                  onFocus={() => setActiveId(game.id)}
                  tabIndex={
                    virtual
                      ? gameIndex === activeIndex ||
                        (activeIndex < range.start && gameIndex === range.start) ||
                        (activeIndex >= range.end && gameIndex === range.end - 1)
                        ? 0
                        : -1
                      : 0
                  }
                  style={virtual ? { height: CARD_HEIGHT } : undefined}
                />
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
});
