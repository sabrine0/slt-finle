"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  engineeringDocumentFileUrl,
  listReferencesForIntersection,
  programmePackageFileUrl,
  type EngineeringDocument,
  type IntersectionReferences,
  type ProgrammePackage,
} from "@/lib/engineering-references-api";

interface EngineeringReferencesPanelProps {
  intersectionCodeOrId: string;
  /**
   * When true, render a compact 1-column variant suitable for the
   * existing controller-workspace sidebar (340 px column).
   */
  compact?: boolean;
}

interface SectionDef {
  key: "plan_rs" | "dossier_regulation" | "plan_filaire" | "programme_archive";
  label: string;
  helper: string;
}

const SECTIONS: SectionDef[] = [
  {
    key: "plan_rs",
    label: "Plan RS",
    helper: "Réseaux secondaires — supports, boucles, chambres, fourreaux.",
  },
  {
    key: "dossier_regulation",
    label: "Dossier Régulation",
    helper: "Phases, mouvements, logique de régulation.",
  },
  {
    key: "plan_filaire",
    label: "Plan Filaire",
    helper: "Topologie de câblage support ↔ contrôleur, chambres / câbles.",
  },
  {
    key: "programme_archive",
    label: "Programme contrôleur",
    helper: "Archives de programme (.clp9, .wpr, PDF). Référence uniquement.",
  },
];

function formatSize(value: string): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(2)} Mo`;
}

export function EngineeringReferencesPanel({
  intersectionCodeOrId,
  compact = false,
}: EngineeringReferencesPanelProps) {
  type FetchState =
    | { phase: "loading" }
    | { phase: "ok"; data: IntersectionReferences }
    | { phase: "error"; message: string };

  const [state, setState] = useState<FetchState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    listReferencesForIntersection(intersectionCodeOrId)
      .then((data) => {
        if (!cancelled) setState({ phase: "ok", data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            phase: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [intersectionCodeOrId]);

  const loading = state.phase === "loading";
  const error = state.phase === "error" ? state.message : null;
  const data = state.phase === "ok" ? state.data : null;

  const byType = useMemo(() => {
    const map = new Map<SectionDef["key"], EngineeringDocument[]>();
    if (data) {
      for (const doc of data.documents) {
        const list = map.get(doc.documentType) ?? [];
        list.push(doc);
        map.set(doc.documentType, list);
      }
    }
    return map;
  }, [data]);

  const programmePackages: ProgrammePackage[] = data?.programmePackages ?? [];

  return (
    <section className="rounded-[14px] border border-white/8 bg-[#0a1014]/95 p-4">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[#6b7c74]">
            Documents engineering — référence
          </p>
          <p className="mt-0.5 text-[0.7rem] text-[#8fa39a]">
            Plans, dossiers et programmes réels indexés à titre de référence.
            Aucun déploiement automatique vers le contrôleur.
          </p>
        </div>
        <Link
          href="/studio/references"
          className="rounded-[8px] border border-white/8 bg-[#071015] px-2.5 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#cfe8d8] transition hover:border-white/20 hover:text-white"
        >
          Browser
        </Link>
      </header>

      {loading ? (
        <p className="text-[0.75rem] text-[#8fa39a]">Chargement…</p>
      ) : error ? (
        <div className="rounded-[8px] border border-[#5a4218] bg-[#14100a] px-3 py-2 text-[0.74rem] text-[#ffd089]">
          <p className="font-semibold">Indexation non disponible</p>
          <p className="mt-1 text-[0.7rem]">
            {error}. Vérifier{" "}
            <span className="font-mono">STLS_ENGINEERING_REFERENCES_ROOT</span>{" "}
            et lancer un scan via{" "}
            <span className="font-mono">POST /document-ingest/scan</span>.
          </p>
        </div>
      ) : (
        <div
          className={
            compact ? "flex flex-col gap-3" : "grid gap-3 md:grid-cols-2"
          }
        >
          {SECTIONS.map((section) => {
            const docs =
              section.key === "programme_archive"
                ? []
                : byType.get(section.key) ?? [];
            const pkgs =
              section.key === "programme_archive" ? programmePackages : [];
            const empty = docs.length === 0 && pkgs.length === 0;
            return (
              <div
                key={section.key}
                className="rounded-[10px] border border-white/6 bg-[#070b0e] p-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-[0.74rem] font-semibold text-[#edf3ee]">
                    {section.label}
                  </h3>
                  <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-[#8fa39a]">
                    {section.key === "programme_archive"
                      ? `${pkgs.length} pkg`
                      : `${docs.length} doc`}
                  </span>
                </div>
                <p className="mt-0.5 text-[0.65rem] text-[#6b7c74]">
                  {section.helper}
                </p>
                {empty ? (
                  <p className="mt-2 text-[0.7rem] text-[#6b7c74]">
                    Aucun document lié à ce carrefour.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {docs.map((doc) => (
                      <li
                        key={doc.id}
                        className="rounded-[6px] border border-white/6 bg-[#0a1014] px-2.5 py-1.5"
                      >
                        <a
                          href={engineeringDocumentFileUrl(doc.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-[0.72rem] font-semibold text-[#cfe8d8] hover:underline"
                        >
                          {doc.title}
                        </a>
                        <p className="mt-0.5 truncate font-mono text-[0.6rem] uppercase tracking-[0.16em] text-[#6b7c74]">
                          {doc.city}
                          {doc.shortCode ? ` · ${doc.shortCode}` : ""}
                          {doc.revision ? ` · rév. ${doc.revision}` : ""}
                          {" · "}
                          {formatSize(doc.fileSizeBytes)}
                        </p>
                        {doc.parseNotes ? (
                          <p className="mt-0.5 text-[0.6rem] text-[#ffb547]">
                            ⚠ {doc.parseNotes}
                          </p>
                        ) : null}
                      </li>
                    ))}
                    {pkgs.map((pkg) => (
                      <li
                        key={pkg.id}
                        className="rounded-[6px] border border-white/6 bg-[#0a1014] px-2.5 py-1.5"
                      >
                        <a
                          href={programmePackageFileUrl(pkg.id)}
                          className="block text-[0.72rem] font-semibold text-[#cfe8d8] hover:underline"
                        >
                          {pkg.packageName}
                        </a>
                        <p className="mt-0.5 truncate font-mono text-[0.6rem] uppercase tracking-[0.16em] text-[#6b7c74]">
                          {pkg.shortCode ?? "—"}
                          {pkg.detectedVersion
                            ? ` · ${pkg.detectedVersion}`
                            : ""}
                          {" · "}
                          {formatSize(pkg.fileSizeBytes)}
                          {pkg.contents.length > 0
                            ? ` · ${pkg.contents.length} fichiers`
                            : ""}
                        </p>
                        <p className="mt-0.5 text-[0.6rem] text-[#ffb547]">
                          Référence uniquement — pas de déploiement.
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                {empty ? (
                  <Link
                    href="/studio/references"
                    className="mt-2 inline-flex rounded-[6px] border border-white/8 bg-[#071015] px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#8fa39a] transition hover:border-white/20 hover:text-[#edf3ee]"
                  >
                    Lier dans le browser
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
