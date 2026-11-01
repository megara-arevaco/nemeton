import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { Check } from "@phosphor-icons/react/Check";

type Option = { value: string; label: string };

export function FilterSelect({
  label,
  icon,
  value,
  options,
  onChange,
}: {
  label: string;
  icon: ReactNode;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef({ text: "", at: 0 });
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [active, setActive] = useState(0);
  const selected = options.findIndex((option) => option.value === value);
  const open = position !== null;

  function show(index = Math.max(0, selected)) {
    const rect = trigger.current!.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 220), window.innerWidth - 24);
    const below = window.innerHeight - rect.bottom - 16;
    const height = Math.min(320, options.length * 40 + 12);
    const above = below < height && rect.top > below;
    setPosition({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      top: above
        ? Math.max(12, rect.top - Math.min(height, rect.top - 16) - 6)
        : rect.bottom + 6,
      width,
      maxHeight: Math.max(40, Math.min(320, above ? rect.top - 18 : below)),
    });
    setActive(index);
    search.current = { text: "", at: 0 };
  }

  function choose(index: number) {
    if (options[index]) {
      onChange(options[index].value);
    }
    setPosition(null);
    trigger.current?.focus();
  }
  useEffect(() => {
    if (!open) {
      return;
    }

    function outside(event: PointerEvent) {
      const target = event.target as Node;

      if (!trigger.current?.contains(target) && !menu.current?.contains(target)) {
        setPosition(null);
      }
    }

    const close = () => setPosition(null);

    function scroll(event: Event) {
      if (event.target !== menu.current) {
        close();
      }
    }
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [open]);
  useEffect(() => {
    if (open) {
      menu.current
        ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [open, active]);
  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Tab") {
      setPosition(null);
      return;
    }
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
      }
      setPosition(null);
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      if (!open) {
        show(
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? options.length - 1
              : Math.max(0, selected),
        );
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        choose(active);
        return;
      }
      setActive(
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? options.length - 1
            : (active + (event.key === "ArrowDown" ? 1 : -1) + options.length) %
              options.length,
      );
    } else if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const now = Date.now();
      const text =
        (now - search.current.at < 600 ? search.current.text : "") +
        event.key.toLocaleLowerCase();
      search.current = { text, at: now };
      const index = options.findIndex((option) =>
        option.label.toLocaleLowerCase().startsWith(text),
      );

      if (index >= 0) {
        event.preventDefault();
        if (!open) {
          show(index);
        } else {
          setActive(index);
        }
      }
    }
  }
  return (
    <div className="filter-select">
      <span id={`${id}-label`} className="filter-select-label">
        {label}
      </span>
      <button
        ref={trigger}
        type="button"
        className="filter-select-trigger"
        role="combobox"
        aria-labelledby={`${id}-label`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? `${id}-options` : undefined}
        aria-activedescendant={open ? `${id}-option-${active}` : undefined}
        onClick={() => (open ? setPosition(null) : show())}
        onKeyDown={keyDown}
        onBlur={() => setPosition(null)}
      >
        <span className="filter-select-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="filter-select-value">{options[selected]?.label ?? value}</span>
        <CaretDown className="filter-select-chevron" aria-hidden="true" />
      </button>
      {position &&
        createPortal(
          <div
            ref={menu}
            id={`${id}-options`}
            role="listbox"
            aria-labelledby={`${id}-label`}
            className="filter-select-menu"
            style={position}
            onMouseDown={(event) => event.preventDefault()}
          >
            {options.map((option, index) => (
              <div
                key={option.value}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={value === option.value}
                data-index={index}
                data-active={active === index}
                className="filter-select-option"
                onPointerMove={() => setActive(index)}
                onClick={() => choose(index)}
              >
                <span>{option.label}</span>
                {value === option.value && <Check weight="bold" aria-hidden="true" />}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
