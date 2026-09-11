import Link from "next/link";

import { fetchProjects, type ProjectSummary } from "@/lib/projects-api";

export const dynamic = "force-dynamic";

const statusTone: Record<ProjectSummary["status"], string> = {
  draft: "border-white/10 bg-[#0b1014] text-[#8fa39a]",
  active: "border-[#1d4a34] bg-[#0d1913] text-[#a8eac2]",
  sealed: "border-[#4a3d62] bg-[#17121e] text-[#c9b7ff]",
  deployed: "border-[#5a4218] bg-[#14100a] text-[#ffb547]",
  archived: "border-white/8 bg-[#07090b] text-[#6b7c74]",
};

export default async function ProjectsPage() {
  let projects: ProjectSummary[] = [];
  let loadError: string | null = null;

  try {
    projects = await fetchProjects();
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "Could not reach the STLS backend.";
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#14100a_0%,#0a0c0e_28%,#050709_65%,#030405_100%)] px-10 py-10 text-[#edf3ee]">
      <header className="mx-auto max-w-5xl pb-8">
        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.3em] text-[#ffb547]">
          STLS · Projects
        </p>
        <h1 className="mt-2 text-[2rem] font-semibold tracking-tight">
          Projects & programmes
        </h1>
        <p className="mt-2 max-w-2xl text-[0.88rem] text-[#8fa39a]">
          Each project groups sites and their intersections. Pick a project to
          enter the engineering studio or the operations view for its network.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-[0.72rem] uppercase tracking-[0.22em] text-[#8fa39a]">
          <Link
            href="/"
            className="rounded-[10px] border border-white/10 bg-[#0b1014] px-3 py-1.5 transition hover:border-white/20 hover:text-[#edf3ee]"
          >
            Command platform
          </Link>
          <Link
            href="/studio"
            className="rounded-[10px] border border-white/10 bg-[#0b1014] px-3 py-1.5 transition hover:border-white/20 hover:text-[#edf3ee]"
          >
            Studio
          </Link>
          <Link
            href="/engineering"
            className="rounded-[10px] border border-white/10 bg-[#0b1014] px-3 py-1.5 transition hover:border-white/20 hover:text-[#edf3ee]"
          >
            Engineering
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl">
        {loadError ? (
          <div className="rounded-[12px] border border-[#5a1d1d] bg-[#180d0d]/70 px-5 py-4 text-[0.82rem] text-[#ff9a9a]">
            {loadError}
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-[12px] border border-white/10 bg-[#0b1014] px-5 py-4 text-[0.82rem] text-[#8fa39a]">
            No projects yet. The default demo project will be seeded on backend
            startup — try refreshing once the API is reachable.
          </div>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {projects.map((project) => (
              <li
                key={project.id}
                className="rounded-[14px] border border-white/8 bg-[#070b0e] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.4)] transition hover:border-white/20"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[0.62rem] font-semibold uppercase tracking-[0.26em] text-[#6b7c74]">
                      {project.organization.name}
                    </p>
                    <h2 className="mt-1 text-[1.1rem] font-semibold">
                      {project.name}
                    </h2>
                    <p className="mt-0.5 font-mono text-[0.72rem] text-[#8fa39a]">
                      {project.code}
                      {project.clientReference
                        ? ` · ${project.clientReference}`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={`rounded-[10px] border px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.2em] ${statusTone[project.status]}`}
                  >
                    {project.status}
                  </span>
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-3 text-[0.72rem]">
                  <div className="rounded-[10px] border border-white/8 bg-[#0b1014] px-3 py-2">
                    <dt className="text-[0.58rem] uppercase tracking-[0.22em] text-[#6b7c74]">
                      Sites
                    </dt>
                    <dd className="mt-1 text-[1rem] font-semibold text-[#edf3ee]">
                      {project.sites.length}
                    </dd>
                  </div>
                  <div className="rounded-[10px] border border-white/8 bg-[#0b1014] px-3 py-2">
                    <dt className="text-[0.58rem] uppercase tracking-[0.22em] text-[#6b7c74]">
                      Intersections
                    </dt>
                    <dd className="mt-1 text-[1rem] font-semibold text-[#edf3ee]">
                      {project.intersectionCount}
                    </dd>
                  </div>
                  <div className="rounded-[10px] border border-white/8 bg-[#0b1014] px-3 py-2">
                    <dt className="text-[0.58rem] uppercase tracking-[0.22em] text-[#6b7c74]">
                      Organization
                    </dt>
                    <dd className="mt-1 text-[0.82rem] font-semibold capitalize text-[#edf3ee]">
                      {project.organization.type}
                    </dd>
                  </div>
                </dl>

                {project.sites.length > 0 ? (
                  <ul className="mt-4 space-y-1 text-[0.78rem] text-[#c3cdc6]">
                    {project.sites.slice(0, 3).map((site) => (
                      <li key={site.id} className="flex items-baseline gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#ffb547]" />
                        <span className="font-semibold">{site.name}</span>
                        {site.city ? (
                          <span className="text-[#6b7c74]">· {site.city}</span>
                        ) : null}
                      </li>
                    ))}
                    {project.sites.length > 3 ? (
                      <li className="text-[#6b7c74]">
                        + {project.sites.length - 3} more
                      </li>
                    ) : null}
                  </ul>
                ) : (
                  <p className="mt-4 text-[0.74rem] text-[#6b7c74]">
                    No sites registered yet.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
