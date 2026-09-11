"use client";

import clsx from "clsx";
import { useState } from "react";

import {
  groupIssuesByCategory,
  validateIntersection,
  type ValidationReport,
} from "@/components/studio/state/validation";
import type { IntersectionConfig } from "@/components/studio/state/types";

export function ValidationBadge({
  config,
}: {
  config: IntersectionConfig;
}) {
  const [open, setOpen] = useState(false);
  const report: ValidationReport = validateIntersection(config);

  if (report.errors === 0 && report.warnings === 0) {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-sig-green-stroke bg-sig-green-surface px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-sig-green-ink">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-sig-green" />
        Valid
      </span>
    );
  }

  const tone = report.errors > 0 ? "error" : "warning";
  const grouped = groupIssuesByCategory(report);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.22em] transition",
          tone === "error"
            ? "border-danger-stroke bg-danger-surface text-danger-ink"
            : "border-sig-yellow-stroke bg-sig-yellow-surface text-sig-yellow-ink",
        )}
        aria-expanded={open}
        aria-label="Open validation details"
      >
        <span
          aria-hidden
          className={clsx(
            "h-1.5 w-1.5 rounded-full",
            tone === "error" ? "bg-sig-red stls-soft-blink" : "bg-accent",
          )}
        />
        {report.errors > 0
          ? `${report.errors} error${report.errors === 1 ? "" : "s"}`
          : `${report.warnings} warning${report.warnings === 1 ? "" : "s"}`}
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[420px] max-h-[420px] overflow-y-auto rounded-[8px] border border-stroke-1 bg-surface-1 p-3 shadow-[0_18px_42px_rgba(0,0,0,0.5)]">
          <header className="flex items-center justify-between gap-2 border-b border-stroke-0 pb-2">
            <div>
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
                Validation report
              </p>
              <p className="mt-0.5 text-[0.76rem] text-ink-1">
                {report.errors} error{report.errors === 1 ? "" : "s"} ·{" "}
                {report.warnings} warning{report.warnings === 1 ? "" : "s"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-[4px] px-2 py-0.5 text-[0.7rem] text-ink-2 hover:bg-hover hover:text-ink-0"
            >
              Close
            </button>
          </header>

          {(["conflict", "phase", "mode", "movement", "lane", "signal-group"] as const).map(
            (cat) => {
              const list = grouped[cat];
              if (list.length === 0) return null;
              return (
                <section key={cat} className="mt-2">
                  <p className="text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-ink-3">
                    {cat.replace("-", " ")}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {list.map((issue, idx) => (
                      <li
                        key={`${cat}-${idx}`}
                        className={clsx(
                          "rounded-[6px] border px-2 py-1.5 text-[0.72rem] leading-5",
                          issue.severity === "error"
                            ? "border-danger-stroke bg-danger-surface text-danger-ink"
                            : "border-sig-yellow-stroke bg-sig-yellow-surface text-sig-yellow-ink",
                        )}
                      >
                        <span className="mr-1 font-semibold uppercase tracking-[0.14em]">
                          {issue.severity === "error" ? "✖" : "⚠"}
                        </span>
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            },
          )}
        </div>
      ) : null}
    </div>
  );
}
