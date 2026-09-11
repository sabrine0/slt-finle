"use client";

import type { DemoScenario } from "@/components/command-platform/demo/scenarios";

interface NarrativeOverlayProps {
  scenario?: DemoScenario;
  stepIndex: number;
  progress: number;
  running: boolean;
}

export function NarrativeOverlay({
  scenario,
  stepIndex,
  progress,
  running,
}: NarrativeOverlayProps) {
  if (!running || !scenario) return null;
  const total = scenario.steps.length;
  const current = Math.min(stepIndex, total - 1);
  const step = scenario.steps[current];
  if (!step) return null;

  return (
    <div
      key={step.id}
      className="stls-fade-slide pointer-events-none absolute left-1/2 top-5 z-20 w-[min(540px,calc(100%-2.5rem))] -translate-x-1/2"
    >
      <div className="pointer-events-auto rounded-[14px] border border-[#3c2e10] bg-[#14100a]/95 px-5 py-4 shadow-[0_24px_60px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,181,71,0.2)] backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-[#3c2e10] bg-[#1b1308] px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.28em] text-[#ffb547]">
              Demo · Step {current + 1}/{total}
            </span>
            <span className="text-[0.7rem] uppercase tracking-[0.22em] text-[#8fa39a]">
              {scenario.subtitle}
            </span>
          </div>
          <p className="text-[0.78rem] font-semibold tracking-[0.02em] text-[#f3f7f1]">
            {scenario.title}
            {scenario.titleAr ? (
              <span
                dir="rtl"
                lang="ar"
                className="ml-2 text-[0.74rem] font-medium text-[#a9b6af]"
              >
                {scenario.titleAr}
              </span>
            ) : null}
          </p>
        </div>

        <p className="mt-3 text-[1.1rem] font-semibold leading-snug text-[#fff4e0]">
          {step.narrative}
        </p>
        {step.narrativeAr ? (
          <p
            dir="rtl"
            lang="ar"
            className="mt-1.5 text-[0.9rem] font-medium text-[#d9c9a0]"
          >
            {step.narrativeAr}
          </p>
        ) : null}

        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#ffc45c] to-[#c38a29] transition-[width] duration-100 ease-linear"
            style={{ width: `${Math.max(4, progress * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
