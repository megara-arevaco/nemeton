import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { GameGroup, LibraryGame } from "@launcher/core";
import { useTranslation } from "react-i18next";
import { ArrowUUpLeft } from "@phosphor-icons/react/ArrowUUpLeft";
import { Clock } from "@phosphor-icons/react/Clock";
import { Trophy } from "@phosphor-icons/react/Trophy";
import { formatPlaytime } from "../../shared/presentation";
import { useAchievementsQuery, useDebouncedValue } from "../../queries/game.queries";
import { ChartDonut } from "@phosphor-icons/react/ChartDonut";
import { SpeakerHigh } from "@phosphor-icons/react/SpeakerHigh";
import { SpeakerSlash } from "@phosphor-icons/react/SpeakerSlash";
import { NemetonMark } from "../NemetonMark";
import { useAmbientSound } from "./useAmbientSound";
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
  statistics: ReactNode;
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
  statistics,
}: Props) {
  const { t } = useTranslation();
  const root = useRef<HTMLElement>(null);
  const exit = useRef<HTMLButtonElement>(null);
  const firstGame = useRef<HTMLButtonElement>(null);
  const [showStatistics, setShowStatistics] = useState(false);
  const { sound, toggleSound } = useAmbientSound();
  const libraryButton = useRef<HTMLButtonElement>(null);
  const statisticsButton = useRef<HTMLButtonElement>(null);
  const cycleSection = () => {
    setShowStatistics(!showStatistics);
    (showStatistics ? libraryButton : statisticsButton).current?.focus();
  };
  const back = () => {
    if (showStatistics) {
      setShowStatistics(false);
      libraryButton.current?.focus();
    } else {
      onExit();
    }
  };
  const actions = useRef({ back, cycleSection });
  useLayoutEffect(() => {
    actions.current = { back, cycleSection };
  });
  const [selectedId, setSelectedId] = useState<string>();
  const installed = groups.filter(({ game }) => game.installed);
  const selected = installed.find(({ id }) => id === selectedId) ?? installed[0];
  const copy = selected?.copies.find(({ installed }) => installed);
  const running = Boolean(selected && runningGameIds.has(selected.game.id));
  const canLaunch = copy && !running && !launching;
  const achievementGameId =
    selected?.copies.find(({ source }) => source === "steam")?.id ?? copy?.id ?? null;
  const settledAchievementGameId = useDebouncedValue(achievementGameId, 160);
  const achievements = useAchievementsQuery(
    settledAchievementGameId === achievementGameId ? achievementGameId : null,
    running,
  );
  const progress = achievements.data;
  const unlocked = progress?.items
    .filter(({ achieved }) => achieved)
    .sort((a, b) => (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? ""))
    .slice(0, 2);
  const progressKnown = progress && (progress.total > 0 || progress.unlocked > 0);

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
    let bumperHeld = true;

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

        const bumper = Boolean(pad.buttons[4]?.pressed || pad.buttons[5]?.pressed);

        if (back && !backHeld) {
          actions.current.back();
        } else if (bumper && !bumperHeld) {
          actions.current.cycleSection();
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
        bumperHeld = bumper;
      } else {
        lastDirection = "";
        confirmHeld = true;
        backHeld = true;
        bumperHeld = true;
      }
      frame = requestAnimationFrame(poll);
    };

    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <main
      ref={root}
      className={showStatistics ? "big-picture big-picture--statistics" : "big-picture"}
      aria-label="Big Picture"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          back();
        } else if (
          event.key === "Tab" &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey
        ) {
          event.preventDefault();
          if (!event.repeat) {
            cycleSection();
          }
        } else if (Object.hasOwn(directions, event.key)) {
          event.preventDefault();
          moveFocus(event.currentTarget, event.key);
        }
      }}
    >
      <div className="big-picture-atmosphere" aria-hidden="true" />
      <header className="big-picture-header">
        <strong>
          <NemetonMark />
          Nemeton
        </strong>
        <nav aria-label="Big Picture">
          <button
            ref={libraryButton}
            type="button"
            aria-pressed={!showStatistics}
            aria-label={t("bigPicture.installed")}
            title={t("bigPicture.installed")}
            onClick={() => setShowStatistics(false)}
          >
            <GameController aria-hidden />
          </button>
          <button
            type="button"
            ref={statisticsButton}
            aria-pressed={showStatistics}
            aria-label={t("bigPicture.statistics")}
            title={t("bigPicture.statistics")}
            onClick={() => setShowStatistics(true)}
          >
            <ChartDonut aria-hidden />
          </button>
          <button
            type="button"
            aria-pressed={sound}
            aria-label={t("bigPicture.sound")}
            title={t("bigPicture.sound")}
            onClick={toggleSound}
          >
            {sound ? <SpeakerHigh aria-hidden /> : <SpeakerSlash aria-hidden />}
          </button>
          <button
            ref={exit}
            type="button"
            aria-label={t("bigPicture.exit")}
            title={t("bigPicture.exit")}
            onClick={onExit}
          >
            <ArrowUUpLeft aria-hidden />
          </button>
        </nav>
      </header>
      {showStatistics ? (
        statistics
      ) : (
        <>
          {selected && (
            <section className="big-picture-feature" aria-label={selected.game.title}>
              <GameHeroImage key={selected.id} game={selected.game} alt="" />
              <div className="big-picture-feature-title">
                <h1>{selected.game.title}</h1>
                <div className="big-picture-game-details">
                  <span>
                    <Clock aria-hidden />
                    {t(
                      selected.historyComplete
                        ? "bigPicture.playtime"
                        : "bigPicture.partialPlaytime",
                      {
                        time: formatPlaytime(selected.totalSeconds / 60),
                      },
                    )}
                  </span>
                </div>
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
              <aside
                className="big-picture-achievements"
                aria-label={t("bigPicture.achievements")}
              >
                <h2>
                  <Trophy aria-hidden /> {t("bigPicture.achievements")}
                </h2>
                <p>
                  {progressKnown
                    ? progress.totalKnown === false
                      ? t("app.unlockedPending", { count: progress.unlocked })
                      : t("bigPicture.achievementProgress", {
                          unlocked: progress.unlocked,
                          total: progress.total,
                        })
                    : t(
                        achievements.isFetching ||
                          settledAchievementGameId !== achievementGameId
                          ? "bigPicture.loadingAchievements"
                          : "bigPicture.noAchievements",
                      )}
                </p>
                {progressKnown && progress.totalKnown !== false && (
                  <progress
                    aria-label={t("bigPicture.achievements")}
                    max={progress.total}
                    value={Math.min(progress.unlocked, progress.total)}
                  />
                )}
                {Boolean(unlocked?.length) && (
                  <ul aria-label={t("bigPicture.unlockedAchievements")}>
                    {unlocked?.map((achievement) => (
                      <li key={achievement.id}>
                        <span className="big-picture-achievement-icon" aria-hidden>
                          <Trophy />
                          {achievement.imageUrl && (
                            <img src={achievement.imageUrl} alt="" />
                          )}
                        </span>
                        <span>{achievement.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </aside>
            </section>
          )}
          <section
            className={
              selected
                ? "big-picture-library"
                : "big-picture-library big-picture-library--empty"
            }
          >
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
                  onPointerEnter={() => setSelectedId(id)}
                  onClick={() => {
                    setSelectedId(id);
                    const installedCopy = copies.find(
                      (candidate) => candidate.installed,
                    );

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
        </>
      )}
      <footer className="big-picture-footer">
        <span aria-live="polite">{message}</span>
        <span>{t("bigPicture.controls")}</span>
      </footer>
    </main>
  );
}
