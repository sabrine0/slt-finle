import Link from "next/link";

import { StudioShell } from "@/components/engineering-studio/studio-shell";
import { fetchEngineeringIntersections } from "@/lib/engineering-studio-server";

export const dynamic = "force-dynamic";

export default async function EngineeringStudioPage() {
  const intersections = await fetchEngineeringIntersections();

  return (
    <StudioShell
      eyebrow="STLS Hybrid / Engineering Studio"
      title="Intersection Configuration Workspace"
      subtitle="Intersection inventory, controller topology, phase safety metadata, timing plans, and deployment readiness for the production estate."
    >
      <section className="grid gap-3 xl:grid-cols-2">
        {intersections.map((intersection) => {
          const realControllers = intersection.controllers.filter(
            (controller) => controller.operatingEnvironment === "real",
          ).length;
          const simulationControllers = intersection.controllers.filter(
            (controller) => controller.operatingEnvironment === "simulation",
          ).length;
          const activePlan = intersection.timingPlans.find(
            (timingPlan) => timingPlan.status === "active",
          );

          return (
            <Link
              key={intersection.id}
              href={`/engineering/intersections/${intersection.id}`}
              className="grid gap-4 rounded-[8px] border border-white/8 bg-[#0a1014] p-4 transition hover:border-white/18 hover:bg-[#0e151b]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-[#8fa39a]">
                    {intersection.code}
                  </p>
                  <p className="mt-1 text-xl font-semibold text-[#f7f3ea]">
                    {intersection.name}
                  </p>
                  <p className="mt-2 text-sm text-[#b7c1bb]">
                    {intersection.district} / {intersection.address}
                  </p>
                </div>
                <span className="rounded-[8px] bg-[#173823] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#8fe1ac]">
                  {intersection.controlMode.replace(/-/g, " ")}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryStat label="Phases" value={`${intersection.phases.length}`} />
                <SummaryStat
                  label="Timing Plans"
                  value={`${intersection.timingPlans.length}`}
                />
                <SummaryStat
                  label="Controllers"
                  value={`${realControllers} real / ${simulationControllers} sim`}
                />
                <SummaryStat
                  label="Deployment"
                  value={activePlan?.code ?? "No active plan"}
                />
              </div>
            </Link>
          );
        })}
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
