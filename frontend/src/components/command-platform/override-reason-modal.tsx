"use client";

import clsx from "clsx";
import { useState } from "react";

import type {
  OverrideAction,
  OverrideReasonCode,
} from "@/lib/command-platform-api";

export interface OverrideModalRequest {
  intersectionCode: string;
  intersectionLabel: string;
  action: OverrideAction;
  actionLabel: string;
  detail?: string;
  targetReference?: string;
  supportsDuration?: boolean;
}

export interface OverrideModalResult {
  reasonCode: OverrideReasonCode;
  note: string;
  durationSeconds: number | null;
}

interface OverrideReasonModalProps {
  request: OverrideModalRequest | null;
  onConfirm: (result: OverrideModalResult) => void;
  onCancel: () => void;
  submitting: boolean;
}

interface OverrideReasonModalBodyProps {
  request: OverrideModalRequest;
  onConfirm: (result: OverrideModalResult) => void;
  onCancel: () => void;
  submitting: boolean;
}

const reasonOptions: Array<{
  value: OverrideReasonCode;
  label: string;
  description: string;
}> = [
  {
    value: "incident",
    label: "Incident response",
    description: "Traffic incident or accident in progress",
  },
  {
    value: "emergency_vehicle",
    label: "Emergency vehicle priority",
    description: "Police, ambulance, fire — preemption required",
  },
  {
    value: "congestion_relief",
    label: "Congestion relief",
    description: "Operator intervention to relieve observed congestion",
  },
  {
    value: "maintenance",
    label: "Maintenance",
    description: "Planned or corrective maintenance on the intersection",
  },
  {
    value: "event",
    label: "Event / planned operation",
    description: "Match day, convoy, parade, planned event",
  },
  {
    value: "pedestrian_safety",
    label: "Pedestrian safety",
    description: "Unsafe pedestrian condition requires immediate action",
  },
  {
    value: "fault_recovery",
    label: "Fault recovery",
    description: "Temporary override while a controller fault is diagnosed",
  },
  {
    value: "drill",
    label: "Drill / exercise",
    description: "Training, simulation or coordinated drill",
  },
  {
    value: "other",
    label: "Other (see note)",
    description: "Reason not in the list — explain in the note field",
  },
];

const durationPresets = [
  { label: "60 s", seconds: 60 },
  { label: "2 min", seconds: 120 },
  { label: "5 min", seconds: 300 },
  { label: "10 min", seconds: 600 },
  { label: "30 min", seconds: 1800 },
];

export function OverrideReasonModal({
  request,
  onConfirm,
  onCancel,
  submitting,
}: OverrideReasonModalProps) {
  if (!request) return null;

  return (
    <OverrideReasonModalBody
      key={`${request.intersectionCode}:${request.action}:${request.targetReference ?? ""}`}
      request={request}
      onConfirm={onConfirm}
      onCancel={onCancel}
      submitting={submitting}
    />
  );
}

function OverrideReasonModalBody({
  request,
  onConfirm,
  onCancel,
  submitting,
}: OverrideReasonModalBodyProps) {
  const [reasonCode, setReasonCode] = useState<OverrideReasonCode>("incident");
  const [note, setNote] = useState("");
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);

  const requiresNote = reasonCode === "other" && note.trim().length === 0;
  const canSubmit = !requiresNote && !submitting;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="override-reason-modal-title"
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-8 backdrop-blur"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          onCancel();
        }
      }}
    >
      <div className="max-h-full w-full max-w-xl overflow-y-auto rounded-[14px] border border-white/10 bg-[#0b1014] text-[#edf3ee] shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
        <header className="border-b border-white/8 px-6 py-4">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.26em] text-[#ffb547]">
            Reason required
          </p>
          <h2
            id="override-reason-modal-title"
            className="mt-1 text-[1.05rem] font-semibold"
          >
            {request.actionLabel}
          </h2>
          <p className="mt-1 text-[0.8rem] text-[#8fa39a]">
            Intersection{" "}
            <span className="font-mono text-[#c3cdc6]">
              {request.intersectionLabel}
            </span>
            {request.detail ? ` · ${request.detail}` : null}
          </p>
          <p className="mt-2 text-[0.72rem] uppercase tracking-[0.2em] text-[#ff9a9a]">
            This action will be logged to the audit record
          </p>
        </header>

        <section className="space-y-5 px-6 py-5">
          <fieldset>
            <legend className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-[#8fa39a]">
              Reason code
            </legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {reasonOptions.map((option) => (
                <label
                  key={option.value}
                  className={clsx(
                    "flex cursor-pointer flex-col gap-1 rounded-[10px] border px-3 py-2 transition",
                    reasonCode === option.value
                      ? "border-[#5a4218] bg-[#14100a] text-[#ffb547]"
                      : "border-white/8 bg-[#070b0e] text-[#c3cdc6] hover:border-white/20",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="override-reason"
                      value={option.value}
                      checked={reasonCode === option.value}
                      onChange={() => setReasonCode(option.value)}
                      className="h-3 w-3 accent-[#ffb547]"
                    />
                    <span className="text-[0.82rem] font-semibold">
                      {option.label}
                    </span>
                  </span>
                  <span className="text-[0.7rem] text-[#8fa39a]">
                    {option.description}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {request.supportsDuration ? (
            <fieldset>
              <legend className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-[#8fa39a]">
                Duration (optional)
              </legend>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDurationSeconds(null)}
                  className={clsx(
                    "rounded-[10px] border px-3 py-1.5 text-[0.78rem] font-semibold transition",
                    durationSeconds === null
                      ? "border-[#5a4218] bg-[#14100a] text-[#ffb547]"
                      : "border-white/10 bg-[#070b0e] text-[#c3cdc6] hover:border-white/20",
                  )}
                >
                  Until released
                </button>
                {durationPresets.map((preset) => (
                  <button
                    key={preset.seconds}
                    type="button"
                    onClick={() => setDurationSeconds(preset.seconds)}
                    className={clsx(
                      "rounded-[10px] border px-3 py-1.5 text-[0.78rem] font-semibold transition",
                      durationSeconds === preset.seconds
                        ? "border-[#5a4218] bg-[#14100a] text-[#ffb547]"
                        : "border-white/10 bg-[#070b0e] text-[#c3cdc6] hover:border-white/20",
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}

          <div>
            <label className="block text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-[#8fa39a]">
              Note
              {reasonCode === "other" ? (
                <span className="ml-2 text-[#ff9a9a]">(required)</span>
              ) : (
                <span className="ml-2 text-[#6b7c74]">(optional)</span>
              )}
            </label>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Free-text note for the audit record"
              maxLength={500}
              rows={3}
              className="mt-2 w-full resize-y rounded-[10px] border border-white/10 bg-[#070b0e] px-3 py-2 text-[0.82rem] text-[#edf3ee] outline-none transition focus:border-[#ffb547]"
            />
            <p className="mt-1 text-right text-[0.62rem] text-[#6b7c74]">
              {note.length} / 500
            </p>
          </div>
        </section>

        <footer className="flex items-center justify-end gap-3 border-t border-white/8 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-[10px] border border-white/10 bg-[#0b1014] px-4 py-2 text-[0.82rem] font-semibold text-[#c3cdc6] transition hover:border-white/20 hover:text-[#edf3ee] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirm({
                reasonCode,
                note: note.trim(),
                durationSeconds,
              })
            }
            disabled={!canSubmit}
            className="rounded-[10px] border border-[#5a4218] bg-gradient-to-b from-[#ffc45c] to-[#c38a29] px-4 py-2 text-[0.82rem] font-semibold tracking-[0.02em] text-[#120a02] shadow-[0_6px_18px_rgba(255,181,71,0.28)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
          >
            {submitting ? "Logging…" : "Confirm & apply"}
          </button>
        </footer>
      </div>
    </div>
  );
}
