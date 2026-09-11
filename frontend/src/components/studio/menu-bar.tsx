"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

interface MenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
}

interface Menu {
  label: string;
  items: MenuItem[];
}

const MENUS: Menu[] = [
  {
    label: "File",
    items: [
      { label: "New project…", shortcut: "Ctrl+N", disabled: true },
      { label: "Open project…", shortcut: "Ctrl+O", disabled: true },
      { label: "Save", shortcut: "Ctrl+S", disabled: true },
      { label: "Save all", shortcut: "Ctrl+Shift+S", disabled: true },
      { separator: true, label: "" },
      { label: "Import plan…", disabled: true },
      { label: "Export plan…", disabled: true },
      { separator: true, label: "" },
      { label: "Exit", shortcut: "Alt+F4", disabled: true },
    ],
  },
  {
    label: "Edit",
    items: [
      { label: "Undo", shortcut: "Ctrl+Z", disabled: true },
      { label: "Redo", shortcut: "Ctrl+Y", disabled: true },
      { separator: true, label: "" },
      { label: "Find in plan…", shortcut: "Ctrl+F", disabled: true },
    ],
  },
  {
    label: "View",
    items: [
      { label: "Project explorer", shortcut: "Ctrl+1", disabled: true },
      { label: "Properties", shortcut: "Ctrl+2", disabled: true },
      { label: "Output panel", shortcut: "Ctrl+`", disabled: true },
      { separator: true, label: "" },
      { label: "Reset layout", disabled: true },
    ],
  },
  {
    label: "Project",
    items: [
      { label: "Add intersection…", disabled: true },
      { label: "Add controller…", disabled: true },
      { label: "Add timing plan…", disabled: true },
      { separator: true, label: "" },
      { label: "Project settings…", disabled: true },
    ],
  },
  {
    label: "Tools",
    items: [
      { label: "Run simulation", shortcut: "F5", disabled: true },
      { label: "Validate conflict matrix", disabled: true },
      { separator: true, label: "" },
      { label: "Build deployment package", shortcut: "Ctrl+B", disabled: true },
      { label: "Deploy to controller…", shortcut: "Ctrl+Shift+D", disabled: true },
    ],
  },
  {
    label: "Help",
    items: [
      { label: "Documentation", disabled: true },
      { label: "Keyboard shortcuts", disabled: true },
      { separator: true, label: "" },
      { label: "About STLS Studio", disabled: true },
    ],
  },
];

export function MenuBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  return (
    <div
      ref={containerRef}
      className="flex items-center gap-1 border-b border-stroke-0 bg-surface-1 px-2 py-1.5"
    >
      <div className="flex items-center gap-2 px-2">
        <span
          aria-hidden
          className="grid h-5 w-5 place-items-center rounded-[4px] border border-accent-stroke bg-accent-surface text-[0.6rem] font-bold uppercase tracking-[0.18em] text-accent-ink"
        >
          S
        </span>
        <span className="text-[0.78rem] font-semibold tracking-[0.04em] text-ink-1">
          STLS Studio
        </span>
        <span className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
          Engineering
        </span>
      </div>

      <div className="mx-2 h-4 w-px bg-stroke-1" />

      <ul className="flex items-center">
        {MENUS.map((menu) => (
          <li key={menu.label} className="relative">
            <button
              type="button"
              onClick={() =>
                setOpenMenu((current) => (current === menu.label ? null : menu.label))
              }
              onMouseEnter={() => {
                if (openMenu) setOpenMenu(menu.label);
              }}
              className={clsx(
                "rounded-[4px] px-2.5 py-1 text-[0.78rem] font-medium transition",
                openMenu === menu.label
                  ? "bg-hover text-ink-0"
                  : "text-ink-1 hover:bg-hover hover:text-ink-0",
              )}
            >
              {menu.label}
            </button>
            {openMenu === menu.label ? (
              <div className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-[6px] border border-stroke-1 bg-surface-2 py-1 shadow-[0_18px_42px_rgba(0,0,0,0.45)]">
                {menu.items.map((item, index) =>
                  item.separator ? (
                    <div
                      key={`sep-${index}`}
                      className="my-1 h-px bg-stroke-0"
                      aria-hidden
                    />
                  ) : (
                    <div
                      key={item.label}
                      className={clsx(
                        "flex items-center justify-between gap-6 px-3 py-1.5 text-[0.78rem]",
                        item.disabled
                          ? "text-ink-3"
                          : "text-ink-1 hover:bg-hover",
                      )}
                    >
                      <span>{item.label}</span>
                      {item.shortcut ? (
                        <span className="text-[0.7rem] tracking-[0.04em] text-ink-3">
                          {item.shortcut}
                        </span>
                      ) : null}
                    </div>
                  ),
                )}
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="ml-auto flex items-center gap-3 pr-2">
        <span className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
          Project
        </span>
        <span className="text-[0.78rem] font-medium text-ink-1">
          Casablanca-Settat
        </span>
      </div>
    </div>
  );
}
