import Link from "next/link";

import { getApiBaseUrl } from "@/lib/command-platform-api";
import type { CorridorSummary } from "@/types/corridors";

export const dynamic = "force-dynamic";

const SCENARIO_LABELS: Record<string, string> = {
  normal_traffic: "Normal traffic",
  peak_traffic: "Peak traffic",
  police_diversion: "Police diversion",
  event_egress: "Event egress",
  emergency_clear_path: "Emergency clear path",
};

async function fetchCorridors(): Promise<{
  corridors: CorridorSummary[];
  error: string | null;
}> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/corridors`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        corridors: [],
        error: `Backend responded ${response.status} ${response.statusText}`,
      };
    }
    const corridors = (await response.json()) as CorridorSummary[];
    return { corridors, error: null };
  } catch (error) {
    return {
      corridors: [],
      error: error instanceof Error ? error.message : "Fetch failed",
    };
  }
}

export default async function CorridorsIndexPage() {
  const { corridors, error } = await fetchCorridors();

  return (
    <main className="min-h-screen bg-surface-0 text-ink-1">
      <header className="border-b border-stroke-0 bg-surface-1 px-6 py-4">
        <div className="mx-auto max-w-[1100px]">
          <div className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-ink-3">
            <Link href="/studio" className="hover:text-ink-1">
              STLS Studio
            </Link>
            <span aria-hidden>›</span>
            <span className="text-ink-2">Corridors</span>
          </div>
          <h1 className="mt-1 text-[1.35rem] font-semibold text-ink-0">
            Corridor coordination
          </h1>
          <p className="text-[0.78rem] text-ink-2">
            Supervise green waves, activate shared scenarios, and dispatch
            police or emergency operations across ordered intersection chains.
          </p>
        </div>
      </header>
      <div className="mx-auto max-w-[1100px] px-6 py-6">
        {error ? (
          <div className="mb-4 rounded-[6px] border border-danger-stroke bg-danger-surface px-3 py-2 text-[0.78rem] text-danger-ink">
            {error}
          </div>
        ) : null}
        {corridors.length === 0 ? (
          <div className="rounded-[8px] border border-stroke-0 bg-surface-1 p-6 text-[0.82rem] text-ink-3">
            No corridors yet. They will be listed here after the backend seed
            completes or once you create one via the API.
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {corridors.map((corridor) => (
              <li key={corridor.id}>
                <Link
                  href={`/studio/corridors/${corridor.id}`}
                  className="group block rounded-[8px] border border-stroke-0 bg-surface-1 p-4 transition hover:border-accent-stroke"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-ink-3">
                        {corridor.code}
                      </p>
                      <h2 className="mt-0.5 text-[1rem] font-semibold text-ink-0 group-hover:text-accent-ink">
                        {corridor.name}
                      </h2>
                      {corridor.city ? (
                        <p className="text-[0.72rem] text-ink-3">
                          {corridor.city}
                          {corridor.region ? ` · ${corridor.region}` : ""}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 rounded-full border border-accent-stroke bg-accent-surface px-2 py-0.5 text-[0.64rem] font-semibold uppercase tracking-wider text-accent-ink">
                      {SCENARIO_LABELS[corridor.activeScenarioCode] ??
                        corridor.activeScenarioCode}
                    </span>
                  </div>
                  <p className="mt-2 text-[0.78rem] text-ink-2">
                    {corridor.intersections.length} intersections ·{" "}
                    {corridor.activeControlSessionIds.length} active sessions
                  </p>
                  {corridor.description ? (
                    <p className="mt-2 text-[0.72rem] text-ink-3">
                      {corridor.description}
                    </p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
