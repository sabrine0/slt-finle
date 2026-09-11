"use client";

import clsx from "clsx";

export type NavRailSection = "command" | "map" | "controllers";

interface NavRailItem {
  id: NavRailSection;
  label: string;
  glyph: string;
}

const items: NavRailItem[] = [
  { id: "command", label: "Police", glyph: "◎" },
  { id: "map", label: "Trafic", glyph: "◇" },
  { id: "controllers", label: "Contrôleurs", glyph: "◰" },
];

interface NavRailProps {
  activeId: NavRailSection;
  onSelect: (section: NavRailSection) => void;
  onOpenStudio: () => void;
}

export function NavRail({
  activeId,
  onSelect,
  onOpenStudio,
}: NavRailProps) {
  return (
    <nav
      aria-label="Command navigation"
      // Phone: fixed horizontal strip at bottom of viewport.
      // ≥sm: classic vertical sidebar to the left.
      className="fixed inset-x-0 bottom-0 z-40 flex h-14 w-full flex-row items-center justify-around border-t border-white/6 bg-[#060a0c]/95 px-2 py-1.5 backdrop-blur sm:static sm:inset-auto sm:h-auto sm:w-[84px] sm:shrink-0 sm:flex-col sm:justify-between sm:border-r sm:border-t-0 sm:py-5 sm:backdrop-blur-none"
    >
      <div className="hidden sm:flex sm:flex-col sm:items-center sm:gap-5">
        <div
          aria-label="STLS — Royaume du Maroc"
          className="flex flex-col items-center gap-1"
        >
          <div
            aria-hidden
            className="grid h-11 w-11 place-items-center rounded-[10px] border border-[#3c2e10] bg-gradient-to-br from-[#1a1305] to-[#0c0904] text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-[#ffb547] shadow-[0_0_0_1px_rgba(255,181,71,0.08)]"
          >
            STLS
          </div>
          <span
            aria-hidden
            className="text-[0.52rem] font-semibold uppercase tracking-[0.24em] text-[#4d5c54]"
          >
            MA
          </span>
        </div>
        <ul className="flex flex-col items-center gap-2">
          {items.map((item) => (
            <li key={`desktop-${item.id}`}>
              <button
                type="button"
                aria-label={item.label}
                aria-current={item.id === activeId ? "page" : undefined}
                onClick={() => onSelect(item.id)}
                className={clsx(
                  "group relative flex w-[60px] flex-col items-center gap-1 rounded-[12px] border px-2 py-2 text-base transition",
                  item.id === activeId
                    ? "border-[#3c2e10] bg-[#14100a] text-[#ffb547] shadow-[0_0_0_1px_rgba(255,181,71,0.08)]"
                    : "border-transparent text-[#6b7c74] hover:border-white/10 hover:bg-white/5 hover:text-[#d9e3dc]",
                )}
              >
                {item.id === activeId ? (
                  <span
                    aria-hidden
                    className="absolute -left-2 top-1/2 h-8 w-1 -translate-y-1/2 rounded-full bg-[#ffb547]"
                  />
                ) : null}
                <span aria-hidden className="text-lg leading-none">
                  {item.glyph}
                </span>
                <span className="text-[0.56rem] font-semibold uppercase tracking-[0.18em]">
                  {item.label}
                </span>
                <span className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 -translate-y-1/2 whitespace-nowrap rounded-[6px] border border-white/10 bg-[#0b1014] px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#d9e3dc] opacity-0 shadow-lg transition group-hover:opacity-100 xl:hidden">
                  {item.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Phone: compact horizontal layout — icons only, no STLS badge. */}
      {items.map((item) => (
        <button
          key={`mobile-${item.id}`}
          type="button"
          aria-label={item.label}
          aria-current={item.id === activeId ? "page" : undefined}
          onClick={() => onSelect(item.id)}
          className={clsx(
            "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[10px] border px-1 py-1 transition sm:hidden",
            item.id === activeId
              ? "border-[#3c2e10] bg-[#14100a] text-[#ffb547]"
              : "border-transparent text-[#6b7c74] hover:border-white/10 hover:bg-white/5 hover:text-[#d9e3dc]",
          )}
        >
          <span aria-hidden className="text-base leading-none">
            {item.glyph}
          </span>
          <span className="text-[0.5rem] font-semibold uppercase tracking-[0.14em]">
            {item.label}
          </span>
        </button>
      ))}
      <button
        type="button"
        aria-label="Open Studio workbench"
        onClick={onOpenStudio}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[10px] border border-transparent px-1 py-1 text-[#6b7c74] transition hover:border-white/10 hover:bg-white/5 hover:text-[#d9e3dc] sm:hidden"
      >
        <span aria-hidden className="text-base leading-none">
          ◉
        </span>
        <span className="text-[0.5rem] font-semibold uppercase tracking-[0.14em]">
          Studio
        </span>
      </button>

      {/* Desktop Studio button (kept at the bottom of the rail). */}
      <button
        type="button"
        aria-label="Open Studio workbench"
        onClick={onOpenStudio}
        className="group relative hidden w-[60px] flex-col items-center gap-1 rounded-[12px] border border-transparent px-2 py-2 text-[#6b7c74] transition hover:border-white/10 hover:bg-white/5 hover:text-[#d9e3dc] sm:flex"
      >
        <span aria-hidden className="text-lg leading-none">
          ◉
        </span>
        <span className="text-[0.56rem] font-semibold uppercase tracking-[0.18em]">
          Studio
        </span>
        <span className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 -translate-y-1/2 whitespace-nowrap rounded-[6px] border border-white/10 bg-[#0b1014] px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#d9e3dc] opacity-0 shadow-lg transition group-hover:opacity-100 xl:hidden">
          Studio
        </span>
      </button>
    </nav>
  );
}
