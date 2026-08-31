import { Plus } from "@phosphor-icons/react/Plus";
import type { LudusaviSuggestion } from "../AddGameModal/AddGameModal.hook";
import { useLudusaviSuggestions } from "./LudusaviSuggestions.hook";

export function LudusaviSuggestions({
  items,
  loading,
  onSelect,
}: Readonly<{
  items: LudusaviSuggestion[];
  loading: boolean;
  onSelect: (item: LudusaviSuggestion) => void;
}>) {
  const {
    handleScroll,
    scrollContainerRef,
    totalHeight,
    viewportHeight,
    visibleItems,
  } = useLudusaviSuggestions(items);

  if (loading && items.length === 0) {
    return (
      <small className="[display:block] [padding:10px]">
        Consultando catálogo de partidas…
      </small>
    );
  }

  return (
    <div
      aria-label="Sugerencias de Ludusavi"
      className="[overflow-y:auto] [overscroll-behavior:contain]"
      onScroll={handleScroll}
      ref={scrollContainerRef}
      role="listbox"
      style={{ maxHeight: viewportHeight }}
    >
      <div className="[position:relative]" style={{ height: totalHeight }}>
        {visibleItems.map(({ item, top }) => (
          <button
            className="[position:absolute] [right:0] [left:0] [height:56px] [border:0] [border-radius:var(--radius-compact)] [padding:9px_10px] [background:transparent] [color:var(--text-secondary)] [text-align:left] [cursor:pointer] [&:hover]:[background:color-mix(in_srgb,_var(--accent-a)_9%,_transparent)] [&:hover]:[color:var(--accent-a)] [&_b]:[display:block] [&_b]:[font-size:10px] [&_small]:[display:block] [&_small]:[margin-top:3px] [&_small]:[color:var(--text-muted)] [&_small]:[font-size:8px] [&_svg]:[position:absolute] [&_svg]:[top:20px] [&_svg]:[right:10px]"
            key={item.name}
            onClick={() => onSelect(item)}
            role="option"
            style={{ top }}
            type="button"
          >
            <span>
              <b>{item.name}</b>
              <small>{item.steamAppId ? `Steam ${item.steamAppId}` : "Ludusavi"}</small>
            </span>
            <Plus />
          </button>
        ))}
      </div>
    </div>
  );
}
