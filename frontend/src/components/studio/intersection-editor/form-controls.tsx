"use client";

import clsx from "clsx";
import type { ChangeEvent, ReactNode } from "react";

export function StudioInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  className,
  disabled,
}: {
  label?: string;
  value: string | number;
  onChange: (next: string) => void;
  type?: "text" | "number";
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <label className={clsx("flex flex-col gap-1", className)}>
      {label ? (
        <span className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-ink-3">
          {label}
        </span>
      ) : null}
      <input
        type={type}
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onChange(event.target.value)
        }
        placeholder={placeholder}
        disabled={disabled}
        className="rounded-[5px] border border-stroke-1 bg-surface-2 px-2.5 py-1.5 text-[0.84rem] text-ink-1 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent-stroke disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

export function StudioSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label?: string;
  value: T | "";
  onChange: (next: T | "") => void;
  options: Array<{ value: T; label: string }>;
  className?: string;
}) {
  return (
    <label className={clsx("flex flex-col gap-1", className)}>
      {label ? (
        <span className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-ink-3">
          {label}
        </span>
      ) : null}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T | "")}
        className="rounded-[5px] border border-stroke-1 bg-surface-2 px-2.5 py-1.5 text-[0.84rem] text-ink-1 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent-stroke"
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SectionToolbar({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-3 border-b border-stroke-0 px-6 py-3">
      <div>
        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.26em] text-ink-3">
          Intersection editor
        </p>
        <h2 className="mt-0.5 text-[1.05rem] font-semibold text-ink-0">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 text-[0.78rem] text-ink-2">{subtitle}</p>
        ) : null}
      </div>
      {right}
    </header>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-[6px] border border-accent-stroke bg-gradient-to-b from-[var(--stls-accent)] to-[var(--stls-accent-ink)] px-3 py-1.5 text-[0.74rem] font-semibold tracking-[0.02em] text-accent-surface shadow-[0_3px_10px_rgba(255,181,71,0.22)] transition duration-200 hover:-translate-y-px hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled,
  tone = "neutral",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "neutral" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "rounded-[6px] border px-3 py-1.5 text-[0.74rem] font-medium transition duration-200 hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0",
        tone === "danger"
          ? "border-danger-stroke bg-danger-surface text-danger-ink hover:brightness-110"
          : "border-stroke-1 bg-surface-2 text-ink-1 hover:border-stroke-2 hover:text-ink-0",
      )}
    >
      {children}
    </button>
  );
}
