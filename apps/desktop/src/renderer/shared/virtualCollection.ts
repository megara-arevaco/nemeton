import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { LibraryGame } from "@launcher/core";

export const CARD_HEIGHT = 249;
export const GRID_GAP = 14;

export function gridWindow(
  count: number,
  columns: number,
  scrollTop: number,
  height: number,
  itemHeight = CARD_HEIGHT,
  gap = GRID_GAP,
) {
  const ROW_HEIGHT = itemHeight + gap;
  const rows = Math.ceil(count / columns);
  const firstRow = Math.min(
    Math.max(0, rows - 1),
    Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 2),
  );
  const lastRow = Math.min(
    rows,
    Math.max(firstRow + 1, Math.ceil((scrollTop + height) / ROW_HEIGHT) + 2),
  );
  return {
    start: firstRow * columns,
    end: Math.min(count, lastRow * columns),
    top: firstRow * ROW_HEIGHT,
    bottom: (rows - lastRow) * ROW_HEIGHT,
  };
}

export function useVirtualCollection(
  games: LibraryGame[],
  options: {
    itemHeight?: number;
    gap?: number;
    fixedColumns?: number;
    selectedId?: string | null;
  } = {},
) {
  const itemHeight = options.itemHeight ?? CARD_HEIGHT;
  const gap = options.gap ?? GRID_GAP;
  const fixedColumns = options.fixedColumns;
  const ROW_HEIGHT = itemHeight + gap;
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const [viewport, setViewport] = useState({
    columns: fixedColumns ?? 4,
    scrollTop: 0,
    height: 800,
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const virtual = games.length > 200;
  const range = virtual
    ? gridWindow(
        games.length,
        viewport.columns,
        viewport.scrollTop,
        viewport.height,
        itemHeight,
        gap,
      )
    : { start: 0, end: games.length, top: 0, bottom: 0 };
  const activeIndex = Math.max(
    0,
    games.findIndex((game) => game.id === activeId),
  );

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const grid = gridRef.current;

    if (!scroll || !grid) {
      return;
    }

    const measure = () => {
      frame.current = 0;
      const columns = Math.max(
        1,
        fixedColumns ?? Math.floor((grid.clientWidth + gap) / (190 + gap)),
      );
      const offset =
        scroll === grid
          ? 0
          : grid.getBoundingClientRect().top -
            scroll.getBoundingClientRect().top +
            scroll.scrollTop;
      setViewport({
        columns,
        scrollTop: Math.max(0, scroll.scrollTop - offset),
        height: scroll.clientHeight,
      });
    };
    const queue = () => {
      if (!frame.current) {
        frame.current = requestAnimationFrame(measure);
      }
    };
    const observer = new ResizeObserver(queue);
    observer.observe(scroll);
    observer.observe(grid);
    scroll.addEventListener("scroll", queue, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      scroll.removeEventListener("scroll", queue);
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [itemHeight, gap, fixedColumns]);

  // A filtered collection starts at the top; running-state updates preserve position.
  const collectionKey = `${games.length}:${games[0]?.id ?? ""}:${games.at(-1)?.id ?? ""}`;
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [collectionKey]);

  useEffect(() => {
    if (!options.selectedId) {
      return;
    }

    const index = games.findIndex((game) => game.id === options.selectedId);
    const scroll = scrollRef.current;

    if (index < 0 || !scroll) {
      return;
    }
    setActiveId(options.selectedId);
    const top = Math.floor(index / viewport.columns) * ROW_HEIGHT;

    if (top < scroll.scrollTop) {
      scroll.scrollTop = top;
    } else if (top + itemHeight > scroll.scrollTop + scroll.clientHeight) {
      scroll.scrollTop = top + itemHeight - scroll.clientHeight;
    }
    setViewport((current) => ({ ...current, scrollTop: scroll.scrollTop }));
  }, [options.selectedId]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];

    if (!keys.includes(event.key) || !games.length) {
      return;
    }
    event.preventDefault();
    const step =
      event.key === "ArrowUp"
        ? -viewport.columns
        : event.key === "ArrowDown"
          ? viewport.columns
          : event.key === "ArrowLeft"
            ? -1
            : 1;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? games.length - 1
          : Math.max(0, Math.min(games.length - 1, activeIndex + step));
    const id = games[next]!.id;
    setActiveId(id);
    const scroll = scrollRef.current;
    const grid = gridRef.current;

    if (!scroll || !grid) {
      return;
    }

    const offset =
      scroll === grid
        ? 0
        : grid.getBoundingClientRect().top -
          scroll.getBoundingClientRect().top +
          scroll.scrollTop;
    const top = offset + Math.floor(next / viewport.columns) * ROW_HEIGHT;

    if (top < scroll.scrollTop) {
      scroll.scrollTop = top;
    } else if (top + itemHeight > scroll.scrollTop + scroll.clientHeight) {
      scroll.scrollTop = top + itemHeight - scroll.clientHeight;
    }

    // Render the destination before moving focus across a virtualized boundary.
    const localTop = Math.max(0, scroll.scrollTop - offset);
    setViewport((current) => ({ ...current, scrollTop: localTop }));
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        grid
          .querySelector<HTMLButtonElement>(`[data-game-index="${next}"]`)
          ?.focus({ preventScroll: true });
      }),
    );
  };
  return { scrollRef, gridRef, range, virtual, activeIndex, setActiveId, onKeyDown };
}
