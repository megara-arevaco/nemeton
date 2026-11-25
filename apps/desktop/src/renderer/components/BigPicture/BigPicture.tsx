import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { GameGroup, LibraryGame } from "@launcher/core";
import { useTranslation } from "react-i18next";
import { ArrowUUpLeft } from "@phosphor-icons/react/ArrowUUpLeft";
import { GameController } from "@phosphor-icons/react/GameController";
import { Play } from "@phosphor-icons/react/Play";
import { GameHeroImage } from "../GameHeroImage/GameHeroImage";
import "./BigPicture.css";

interface Props {
  groups: GameGroup[];
  loading: boolean;
  launching: boolean;
  runningGameIds: Set<string>;
  message: string;
  onLaunch: (game: LibraryGame) => Promise<void>;
  onExit: () => void;
}

const directions: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

function moveFocus(root: HTMLElement, key: string) {
  const [x, y] = directions[key];
  const buttons = Array.from(
    root.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
  );
  const current = buttons.find((button) => button === document.activeElement);

  if (!current) {
    (root.querySelector<HTMLButtonElement>("[data-game]") ?? buttons[0])?.focus();
    return;
  }

  const center = (button: Element) => {
    const rect = button.getBoundingClientRect();
    return [rect.left + rect.width / 2, rect.top + rect.height / 2];
  };
  const [left, top] = center(current);
  let best: Element | undefined;
  let closest = Infinity;

  for (const button of buttons) {
    const [candidateLeft, candidateTop] = center(button);
    const dx = candidateLeft - left;
    const dy = candidateTop - top;
    const forward = dx * x + dy * y;
    const sideways = Math.abs(dx * y - dy * x);

    if (forward <= 1 || sideways > forward * 2) {
      continue;
    }

    const distance = forward + 2 * sideways;

    if (distance < closest) {
      best = button;
      closest = distance;
    }
  }
  if (best instanceof HTMLButtonElement) {
    best.focus();
  }
}

function gamepadDirection(pad: Gamepad) {
  const [x = 0, y = 0] = pad.axes;
  const buttons = pad.buttons;

  if (buttons[14]?.pressed || x < -0.55) {
    return "ArrowLeft";
  }
  if (buttons[15]?.pressed || x > 0.55) {
    return "ArrowRight";
  }
  if (buttons[12]?.pressed || y < -0.55) {
    return "ArrowUp";
  }
  if (buttons[13]?.pressed || y > 0.55) {
    return "ArrowDown";
  }
  return "";
}

export function BigPicture({
  groups,
  loading,
  launching,
  runningGameIds,
  message,
  onLaunch,
  onExit,
}: Props) {
  const { t } = useTranslation();
  const root = useRef<HTMLElement>(null);
  const exit = useRef<HTMLButtonElement>(null);
  const firstGame = useRef<HTMLButtonElement>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const installed = groups.filter(({ game }) => game.installed);
  const selected = installed.find(({ id }) => id === selectedId) ?? installed[0];
  const copy = selected?.copies.find(({ installed }) => installed);
  const running = Boolean(selected && runningGameIds.has(selected.game.id));
  const canLaunch = copy && !running && !launching;

  useLayoutEffect(() => {
    if (!loading) {
      (firstGame.current ?? exit.current)?.focus();
    }
  }, [loading]);

  useEffect(() => {
    const container = root.current;

    if (!container) {
      return;
    }

    let frame: number;
    let lastDirection = "";
    let repeatAt = 0;
    let confirmHeld = true;
    let backHeld = true;

    const poll = (time: number) => {
      const pad = navigator
        .getGamepads?.()
        .find((candidate) => candidate?.mapping === "standard");

      if (document.hasFocus() && pad) {
        const direction = gamepadDirection(pad);

        if (direction && (direction !== lastDirection || time >= repeatAt)) {
          moveFocus(container, direction);
          repeatAt = time + (direction === lastDirection ? 110 : 300);
        }
        lastDirection = direction;

        const confirm = Boolean(pad.buttons[0]?.pressed);
        const back = Boolean(pad.buttons[1]?.pressed);

        if (back && !backHeld) {
          exit.current?.click();
        } else if (confirm && !confirmHeld) {
          const target = document.activeElement;

          if (target instanceof HTMLButtonElement && container.contains(target)) {
            target.click();
          } else {
            (firstGame.current ?? exit.current)?.focus();
          }
        }
        confirmHeld = confirm;
        backHeld = back;
      } else {
        lastDirection = "";
        confirmHeld = true;
        backHeld = true;
      }
      frame = requestAnimationFrame(poll);
    };

    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <main
      ref={root}
      className="big-picture"
      aria-label="Big Picture"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onExit();
        } else if (Object.hasOwn(directions, event.key)) {
          event.preventDefault();
          moveFocus(event.currentTarget, event.key);
        }
      }}
    >
      <header className="big-picture-header">
        <strong>Nemeton</strong>
        <button ref={exit} type="button" onClick={onExit}>
          <ArrowUUpLeft aria-hidden /> {t("bigPicture.exit")}
        </button>
      </header>
      {selected && (
        <section className="big-picture-feature" aria-label={selected.game.title}>
          <GameHeroImage key={selected.id} game={selected.game} alt="" />
          <div>
            <h1>{selected.game.title}</h1>
            <button
              type="button"
              aria-disabled={!canLaunch}
              onClick={() => {
                if (canLaunch) {
                  void onLaunch(copy);
                }
              }}
            >
              <Play weight="fill" aria-hidden />{" "}
              {t(running ? "bigPicture.running" : "bigPicture.play")}
            </button>
          </div>
        </section>
      )}
      <section className="big-picture-library">
        <h2>{t("bigPicture.installed")}</h2>
        {!loading && !installed.length && <p>{t("bigPicture.empty")}</p>}
        <div className="big-picture-games">
          {installed.map(({ game, id, copies }, index) => (
            <button
              key={id}
              ref={index === 0 ? firstGame : undefined}
              type="button"
              data-game
              aria-pressed={id === selected?.id}
              onFocus={() => setSelectedId(id)}
              onClick={() => {
                setSelectedId(id);
                const installedCopy = copies.find((candidate) => candidate.installed);

                if (installedCopy && !launching && !runningGameIds.has(game.id)) {
                  void onLaunch(installedCopy);
                }
              }}
            >
              <div>
                <GameController aria-hidden />
                <GameHeroImage game={game} alt="" loading="lazy" />
              </div>
              <span>{game.title}</span>
            </button>
          ))}
        </div>
      </section>
      <footer className="big-picture-footer">
        <span aria-live="polite">{message}</span>
        <span>{t("bigPicture.controls")}</span>
      </footer>
    </main>
  );
}
