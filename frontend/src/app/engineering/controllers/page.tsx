import Link from "next/link";

import { StudioShell } from "@/components/engineering-studio/studio-shell";
import { fetchEngineeringControllers } from "@/lib/engineering-studio-server";

export const dynamic = "force-dynamic";

export default async function EngineeringControllersPage() {
  const controllers = await fetchEngineeringControllers();

  return (
    <StudioShell
      eyebrow="STLS Hybrid / Engineering Studio"
      title="Controller Inventory"
      subtitle="Controller estate, assignment health, runtime compatibility, and deployment state for simulation and field targets."
      backHref="/engineering"
      backLabel="Engineering Studio"
    >
      <section className="grid gap-3 xl:grid-cols-2">
        {controllers.map((controller) => (
          <Link
            key={controller.id}
            href={`/engineering/controllers/${controller.id}`}
            className="grid gap-4 rounded-[8px] border border-white/8 bg-[#0a1014] p-4 transition hover:border-white/18 hover:bg-[#0e151b]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[#8fa39a]">
                  {controller.code}
                </p>
                <p className="mt-1 text-xl font-semibold text-[#f7f3ea]">
                  {controller.intersection?.name ?? "Unassigned Controller"}
                </p>
                <p className="mt-2 text-sm text-[#b7c1bb]">
                  {controller.intersection?.code ?? "No intersection assignment"} /{" "}
                  {toLabel(controller.controllerType ?? "unknown")}
                </p>
              </div>
              <div className="flex gap-2">
                <StatusPill value={controller.connectionState} />
                <StatusPill value={controller.operatingEnvironment} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryStat
                label="Runtime"
                value={controller.runtimeVersion ?? "Unknown"}
              />
              <SummaryStat
                label="Last Heartbeat"
                value={formatDate(controller.lastSeen)}
              />
              <SummaryStat
                label="Last Package"
                value={controller.lastDeployedPackageVersion ?? "None"}
              />
              <SummaryStat
                label="Deployment State"
                value={toLabel(controller.lastDeploymentState ?? "idle")}
              />
            </div>
          </Link>
        ))}
      </section>
    </StudioShell>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-white/8 bg-[#0f171d] px-3 py-3">
      <p className="text-xs uppercase tracking-[0.14em] text-[#8fa39a]">{label}</p>
      <p className="mt-1 text-base font-semibold text-[#f7f3ea]">{value}</p>
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  const accentByValue = {
    online: "bg-[#173823] text-[#8fe1ac]",
    degraded: "bg-[#51350f] text-[#ffcb7c]",
    offline: "bg-[#5b1a1a] text-[#ffb2b2]",
    real: "bg-[#11303a] text-[#9adcf3]",
    simulation: "bg-[#2e2530] text-[#d7b8ec]",
  } as const;

  return (
    <span
      className={`rounded-[8px] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
        accentByValue[value as keyof typeof accentByValue] ??
        "bg-[#1b2228] text-[#d8dedb]"
      }`}
    >
      {toLabel(value)}
    </span>
  );
}

function formatDate(value?: string | null) {
  if (!value) {
    return "Unavailable";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function toLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
