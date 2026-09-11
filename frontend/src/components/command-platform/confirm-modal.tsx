"use client";

import { useEffect } from "react";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "critical" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "critical",
  onConfirm,
  onCancel,
  busy = false,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const accent =
    tone === "critical"
      ? {
          frame: "border-[#5a1d1d] bg-gradient-to-br from-[#140808]/98 to-[#0c0505]/98",
          title: "text-[#ff9a9a]",
          confirm:
            "border border-[#5a1d1d] bg-gradient-to-b from-[#ff5f5f] to-[#b53a3a] text-[#130303] shadow-[0_6px_18px_rgba(255,95,95,0.3)]",
          badge: "text-[#ff9a9a] border-[#5a1d1d] bg-[#180d0d]",
        }
      : {
          frame: "border-[#5c4418] bg-gradient-to-br from-[#141008]/98 to-[#0a0805]/98",
          title: "text-[#ffd089]",
          confirm:
            "border border-[#5a4218] bg-gradient-to-b from-[#ffc45c] to-[#c38a29] text-[#120a02] shadow-[0_6px_18px_rgba(255,181,71,0.3)]",
          badge: "text-[#ffd089] border-[#5c4418] bg-[#141008]",
        };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="stls-confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-[#020304]/78 backdrop-blur-sm"
        onClick={busy ? undefined : onCancel}
      />
      <div
        className={`stls-fade-slide relative w-[min(440px,92vw)] rounded-[16px] border px-6 py-6 shadow-[0_40px_90px_rgba(0,0,0,0.6)] ${accent.frame}`}
      >
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-[0.64rem] font-semibold uppercase tracking-[0.28em] ${accent.badge}`}
        >
          <span aria-hidden className="stls-soft-blink h-1.5 w-1.5 rounded-full bg-current" />
          Critical action
        </span>

        <h2
          id="stls-confirm-title"
          className={`mt-4 text-[1.35rem] font-semibold leading-tight tracking-tight ${accent.title}`}
        >
          {title}
        </h2>

        <p className="mt-3 text-[0.92rem] leading-6 text-[#d3ddd6]">{message}</p>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-[10px] border border-white/10 bg-[#0b1014] px-4 py-2 text-[0.82rem] font-semibold text-[#c3cdc6] transition duration-200 hover:border-white/20 hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-[10px] px-4 py-2 text-[0.82rem] font-semibold tracking-[0.02em] transition duration-200 hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 ${accent.confirm}`}
          >
            {busy ? "Applying…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
