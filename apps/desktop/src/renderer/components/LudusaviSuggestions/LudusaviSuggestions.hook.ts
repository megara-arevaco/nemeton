import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { UIEvent } from "react";
import type { LudusaviSuggestion } from "../../types/ludusavi";
const itemHeight = 56;
const overscan = 4;

export function useLudusaviSuggestions(items: LudusaviSuggestion[]) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(280);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    const modal = scrollContainer?.closest(".add-game-modal");
    const footer = modal?.querySelector("footer");

    if (!scrollContainer || !modal || !footer) {
      return;
    }

    const updateViewportHeight = () => {
      const availableHeight =
        footer.getBoundingClientRect().top -
        scrollContainer.getBoundingClientRect().top -
        24;
      setViewportHeight(Math.max(0, Math.floor(availableHeight)));
    };

    const observer = new ResizeObserver(updateViewportHeight);
    observer.observe(modal);
    observer.observe(footer);
    window.addEventListener("resize", updateViewportHeight);
    updateViewportHeight();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateViewportHeight);
    };
  }, [items.length]);
  const visibleItems = useMemo(() => {
    const firstVisible = Math.floor(scrollTop / itemHeight);
    const start = Math.max(0, firstVisible - overscan);
    const visibleCount = Math.ceil(viewportHeight / itemHeight) + overscan * 2;
    const end = Math.min(items.length, start + visibleCount);

    return items.slice(start, end).map((item, index) => ({
      item,
      top: (start + index) * itemHeight,
    }));
  }, [items, scrollTop, viewportHeight]);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  };

  return {
    handleScroll,
    scrollContainerRef,
    totalHeight: items.length * itemHeight,
    viewportHeight,
    visibleItems,
  };
}
