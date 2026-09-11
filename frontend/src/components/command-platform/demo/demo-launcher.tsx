"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

import { DEMO_SCENARIOS, type DemoScenario } from "@/components/command-platform/demo/scenarios";

interface DemoLauncherProps {
  running: boolean;
  onStart: (scenarioId: DemoScenario["id"]) => void;
  onStop: () => void;
}

export function DemoLauncher({ running, onStart, onStop }: DemoLauncherProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  if (running) {
    return (
      <button
        type="button"
        onClick={onStop}
        className="flex items-center gap-2 rounded-[10px] border border-[#3c2e10] bg-[#14100a] px-3 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-[#ffb547] transition duration-200 hover:-translate-y-px hover:bg-[#1b1308]"
      >
        <span aria-hidden className="stls-soft-blink h-1.5 w-1.5 rounded-full bg-[#ffb547]" />
        Demo running
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={clsx(
          "flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.2em] transition duration-200 hover:-translate-y-px",
          open
            ? "border-[#3c2e10] bg-[#14100a] text-[#ffb547]"
            : "border-white/10 bg-[#0b1014] text-[#c3cdc6] hover:border-white/20 hover:text-[#f1f6f2]",
        )}
      >
        <span aria-hidden className="text-sm leading-none">
          ▶
        </span>
        Demo
      </button>

      {open ? (
        <div
          role="menu"
          className="stls-fade-slide absolute right-0 top-[calc(100%+0.5rem)] z-40 w-[320px] rounded-[14px] border border-white/10 bg-[#070b0e]/96 p-2 shadow-[0_22px_48px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,181,71,0.08)] backdrop-blur"
        >
          <p className="px-2 pt-1 text-[0.62rem] font-semibold uppercase tracking-[0.28em] text-[#8fa39a]">
            Run a 60-second guided demo
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {DEMO_SCENARIOS.map((scenario) => (
              <li key={scenario.id}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onStart(scenario.id);
                  }}
                  className="group flex w-full flex-col rounded-[10px] border border-transparent bg-transparent px-3 py-2.5 text-left transition duration-200 hover:-translate-y-px hover:border-[#3c2e10] hover:bg-[#14100a]"
                >
                  <span className="flex items-center gap-2 text-[0.9rem] font-semibold text-[#f3f7f1] group-hover:text-[#ffb547]">
                    {scenario.title}
                    {scenario.titleAr ? (
                      <span
                        dir="rtl"
                        lang="ar"
                        className="text-[0.74rem] font-medium text-[#8fa39a]"
                      >
                        {scenario.titleAr}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 text-[0.72rem] text-[#8fa39a]">
                    {scenario.subtitle} · {scenario.steps.length} steps
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 rounded-[8px] border border-white/6 bg-[#0b1014] px-3 py-2 text-[0.68rem] leading-5 text-[#8fa39a]">
            Stakeholder-safe. No backend commands are issued during the demo; only
            visual and alert state are simulated on this client.
          </p>
        </div>
      ) : null}
    </div>
  );
}
