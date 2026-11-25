import { useEffect, useRef, useState } from "react";
import type { LibraryGame } from "@launcher/core";
import { useTranslation } from "react-i18next";
import { GameController } from "@phosphor-icons/react/GameController";
import { GameHeroImage } from "../GameHeroImage/GameHeroImage";
import { GameLaunchButton } from "../GameLaunchButton";
import { formatPlaytime } from "../../shared/presentation";
import "./BigPicture.css";

interface Props {
  games: LibraryGame[];
  recentGames: LibraryGame[];
  runningGameIds: Set<string>;
  loading: boolean;
  message: string;
  onLaunch: (game: LibraryGame) => Promise<void>;
  onDetails: (id: string) => void;
  onExit: () => void;
}

export function BigPicture(props: Props) {
  const { t } = useTranslation();
  const root = useRef<HTMLElement>(null);
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const games =
    filter === "recent"
      ? props.recentGames
      : props.games.filter((game) => filter !== "installed" || game.installed);
  const selected = games.find((game) => game.id === selectedId) ?? games[0];
  const launch = async () => {
    if (!selected || launching) {
      return;
    }
    setLaunching(true);
    try {
      await props.onLaunch(selected);
    } finally {
      setLaunching(false);
    }
  };

  useEffect(() => {
    root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    let frame = 0;
    let nextRepeat = 0;
    let previous = new Set<number>();
    const move = (direction: string) => {
      const buttons = Array.from(
        root.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ??
          [],
      );
      const active = document.activeElement as HTMLButtonElement;
      const rect = active?.getBoundingClientRect();

      if (!rect || !buttons.includes(active)) {
        buttons[0]?.focus();
        return;
      }

      const x = rect.x + rect.width / 2,
        y = rect.y + rect.height / 2;
      const candidates = buttons
        .filter((button) => button !== active)
        .map((button) => {
          const b = button.getBoundingClientRect();
          const dx = b.x + b.width / 2 - x,
            dy = b.y + b.height / 2 - y;
          const horizontal = direction === "ArrowLeft" || direction === "ArrowRight";
          const along = horizontal ? dx : dy,
            across = horizontal ? dy : dx;
          const sign = direction === "ArrowLeft" || direction === "ArrowUp" ? -1 : 1;
          return {
            button,
            valid: along * sign > 1,
            score: Math.abs(along) + Math.abs(across) * 3,
          };
        })
        .filter((item) => item.valid)
        .sort((a, b) => a.score - b.score);
      candidates[0]?.button.focus();
      candidates[0]?.button.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        move(event.key);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        props.onExit();
      }
    };
    const poll = (now: number) => {
      const pad = navigator
        .getGamepads?.()
        .find((pad) => pad?.connected && pad.mapping === "standard");
      const pressed = new Set<number>();
      pad?.buttons.forEach((button, index) => {
        if (button.pressed) {
          pressed.add(index);
        }
      });
      if (pad) {
        const direction =
          pressed.has(14) || pad.axes[0] < -0.55
            ? "ArrowLeft"
            : pressed.has(15) || pad.axes[0] > 0.55
              ? "ArrowRight"
              : pressed.has(12) || pad.axes[1] < -0.55
                ? "ArrowUp"
                : pressed.has(13) || pad.axes[1] > 0.55
                  ? "ArrowDown"
                  : null;

        if (direction && now >= nextRepeat) {
          move(direction);
          nextRepeat = now + 180;
        }
        if (!direction) {
          nextRepeat = 0;
        }
        if (pressed.has(0) && !previous.has(0)) {
          (document.activeElement as HTMLElement)?.click();
        }
        if (pressed.has(1) && !previous.has(1)) {
          props.onExit();
        }
      }
      previous = pressed;
      frame = requestAnimationFrame(poll);
    };
    window.addEventListener("keydown", keydown);
    frame = requestAnimationFrame(poll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", keydown);
    };
  }, [props.onExit]);

  return (
    <main className="big-picture" ref={root} aria-label="Big Picture">
      {selected && (
        <GameHeroImage
          key={selected.id}
          game={selected}
          className="bp-backdrop"
          alt=""
        />
      )}
      <header className="bp-header">
        <div className="bp-brand">
          <GameController aria-hidden="true" weight="fill" />
          <strong>
            NEMETON <small>BIG PICTURE</small>
          </strong>
        </div>
        <button onClick={props.onExit}>{t("bp.exit")}</button>
      </header>
      <nav className="bp-tabs" aria-label={t("bp.library")}>
        {["all", "recent", "installed"].map((value) => (
          <button
            key={value}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {t(`bp.${value}`)}
          </button>
        ))}
      </nav>
      <section className="bp-hero">
        <p className="bp-eyebrow">
          {t("bp.library")} · {games.length}
        </p>
        <h1>
          {props.loading ? t("app.loadingLibrary") : (selected?.title ?? t("bp.empty"))}
        </h1>
        {selected && (
          <>
            <p className="bp-meta">
              {t(`stores.${selected.source}`)} ·{" "}
              {formatPlaytime(selected.playtimeMinutes)} ·{" "}
              {t(selected.installed ? "app.installed" : "app.inYourAccount")}
            </p>
            <div className="bp-actions" aria-busy={launching}>
              {!launching && (
                <GameLaunchButton
                  game={selected}
                  isRunning={props.runningGameIds.has(selected.id)}
                  onLaunch={() => void launch()}
                  onConfigureExecutable={() => props.onDetails(selected.id)}
                />
              )}
              {launching && <p role="status">{t("bp.launching")}</p>}
              <button onClick={() => props.onDetails(selected.id)}>
                {t("bp.details")}
              </button>
            </div>
          </>
        )}
      </section>
      <section className="bp-library" aria-label={t("bp.library")}>
        {games.map((game) => (
          <button
            className="bp-card"
            key={game.id}
            aria-pressed={selected?.id === game.id}
            onFocus={() => setSelectedId(game.id)}
            onClick={() => setSelectedId(game.id)}
          >
            <GameHeroImage game={game} alt="" loading="lazy" />
            <span>{game.title}</span>
            {props.runningGameIds.has(game.id) && <small>{t("launch.playing")}</small>}
          </button>
        ))}
      </section>
      <footer className="bp-footer">
        <span>
          <kbd>A</kbd> {t("bp.select")} <kbd>B</kbd> {t("bp.exit")} ·{" "}
          {t("bp.navigation")}
        </span>
        <span role="status">{props.message}</span>
      </footer>
    </main>
  );
}
