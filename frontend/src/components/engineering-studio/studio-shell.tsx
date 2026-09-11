import Link from "next/link";
import type { ReactNode } from "react";

interface StudioShellProps {
  title: string;
  eyebrow: string;
  subtitle: string;
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
}

export function StudioShell({
  title,
  eyebrow,
  subtitle,
  children,
  backHref = "/",
  backLabel = "Command Platform",
}: StudioShellProps) {
  return (
    <main className="min-h-screen bg-[#05070a] text-[#f7f3ea]">
      <div className="mx-auto flex min-h-screen max-w-[1680px] flex-col gap-6 px-4 py-5 lg:px-6">
        <header className="flex flex-col gap-4 border-b border-white/8 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[#8fa39a]">
                {eyebrow}
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-[#f7f3ea]">
                {title}
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-[#b7c1bb]">
                {subtitle}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href={backHref}
                className="rounded-[8px] border border-white/10 bg-[#0c1116] px-3 py-2 text-sm text-[#d8dedb] transition hover:border-white/20 hover:bg-[#121922]"
              >
                {backLabel}
              </Link>
              <Link
                href="/engineering/controllers"
                className="rounded-[8px] border border-white/10 bg-[#0c1116] px-3 py-2 text-sm text-[#d8dedb] transition hover:border-white/20 hover:bg-[#121922]"
              >
                Controller Inventory
              </Link>
              <Link
                href="/engineering"
                className="rounded-[8px] border border-[#294439] bg-[#112018] px-3 py-2 text-sm text-[#97d9b3] transition hover:border-[#3a5c4d] hover:bg-[#162820]"
              >
                Engineering Studio
              </Link>
            </div>
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}
