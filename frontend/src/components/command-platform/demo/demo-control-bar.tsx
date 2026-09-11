"use client";

import clsx from "clsx";

import type { DemoPlayerApi, DemoSpeed } from "@/components/command-platform/demo/use-demo-player";

interface DemoControlBarProps {
  player: DemoPlayerApi;
}

const SPEEDS: Array<{ value: DemoSpeed; label: string }> = [
  { value: "slow", label: "Slow" },
  { value: "normal", label: "Normal" },
  { value: "fast", label: "Fast" },
];

export function DemoControlBar({ player }: DemoControlBarProps) {
  if (!player.running || !player.scenario) return null;
  const ended =
    player.stepIndex >= player.stepCount - 0.001 && !player.paused && player.progress >= 0.999;

  return (
    <div className="pointer-events-auto absolute bottom-5 left-1/2 z-30 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-[14px] border border-white/8 bg-[#070b0e]/92 px-4 py-2.5 shadow-[0_22px_52px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,181,71,0.12)] backdrop-blur">
        <button
          type="button"
          onClick={player.paused ? player.resume : player.pause}
          aria-label={player.paused ? "Resume demo" : "Pause demo"}
          disabled={ended}
          className={clsx(
            "grid h-9 w-9 place-items-center rounded-[10px] border transition duration-200 hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0",
            player.paused
              ? "border-[#3c2e10] bg-[#14100a] text-[#ffb547]"
              : "border-white/10 bg-[#0b1014] text-[#c3cdc6] hover:border-white/20 hover:text-[#f1f6f2]",
          )}
        >
          <span aria-hidden className="text-sm">
            {player.paused ? "▶" : "‖"}
          </span>
        </button>

        <button
          type="button"
          onClick={player.restart}
          aria-label="Restart demo"
          className="grid h-9 w-9 place-items-center rounded-[10px] border border-white/10 bg-[#0b1014] text-[#c3cdc6] transition duration-200 hover:-translate-y-px hover:border-white/20 hover:text-[#f1f6f2]"
        >
          <span aria-hidden className="text-sm">
            ⟲
          </span>
        </button>

        <div className="mx-1 h-7 w-px bg-white/8" />

        <div className="flex items-center gap-1 rounded-[10px] border border-white/8 bg-[#0b1014] p-0.5">
          {SPEEDS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => player.setSpeed(option.value)}
              className={clsx(
                "rounded-[8px] px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.18em] transition duration-200",
                player.speed === option.value
                  ? "bg-[#14100a] text-[#ffb547]"
                  : "text-[#8fa39a] hover:text-[#c3cdc6]",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mx-1 h-7 w-px bg-white/8" />

        <span className="text-[0.64rem] font-semibold uppercase tracking-[0.24em] text-[#8fa39a]">
          Step {Math.min(player.stepIndex + 1, player.stepCount)}/{player.stepCount}
        </span>

        <button
          type="button"
          onClick={player.stop}
          aria-label="Stop demo"
          className="ml-1 rounded-[10px] border border-[#5a1d1d] bg-[#1a0e0e] px-3 py-1.5 text-[0.72rem] font-semibold tracking-[0.04em] text-[#ff9a9a] transition duration-200 hover:-translate-y-px hover:bg-[#241313]"
        >
          Exit demo
        </button>
      </div>
    </div>
  );
}
