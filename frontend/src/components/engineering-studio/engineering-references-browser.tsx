"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useStudioThemeContext } from "@/components/studio-landing/theme-context";
import {
  engineeringDocumentFileUrl,
  getIngestStatus,
  getReferenceCounts,
  linkProgrammePackage,
  linkReference,
  listIngestRuns,
  listProgrammePackages,
  listReferences,
  programmePackageFileUrl,
  triggerIngestScan,
  unlinkProgrammePackage,
  unlinkReference,
  type DocumentIngestRun,
  type EngineeringDocument,
  type EngineeringDocumentType,
  type IngestStatus,
  type ProgrammePackage,
  type ReferenceCounts,
} from "@/lib/engineering-references-api";
import type { EngineeringIntersectionRecord } from "@/types/engineering-studio";

type BrowserTab = "documents" | "packages";
type LinkState = "all" | "linked" | "unlinked";

interface EngineeringReferencesBrowserProps {
  intersections: EngineeringIntersectionRecord[];
}

interface DocumentFilters {
  linked: LinkState;
  documentType: EngineeringDocumentType | "all";
  city: "all" | "Fès" | "Marrakech" | "unknown";
  search: string;
}

interface PackageFilters {
  linked: LinkState;
  search: string;
}

interface DashboardState {
  counts: ReferenceCounts | null;
  ingestStatus: IngestStatus | null;
  latestRun: DocumentIngestRun | null;
}

interface LinkDraft {
  intersectionId: string;
  controllerId: string;
}

const EMPTY_COUNTS: ReferenceCounts = {
  documents: { total: 0, linked: 0, unlinked: 0 },
  programmePackages: { total: 0, linked: 0, unlinked: 0 },
};

function formatSize(value: string): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(2)} Mo`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function itemMatchesSearch(
  search: string,
  parts: Array<string | null | undefined>,
): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return parts.some((part) => part?.toLowerCase().includes(query));
}

function filterPackagesByLink(
  packages: ProgrammePackage[],
  linked: LinkState,
): ProgrammePackage[] {
  if (linked === "all") return packages;
  return packages.filter((pkg) =>
    linked === "linked" ? !!pkg.intersectionId : !pkg.intersectionId,
  );
}

export function EngineeringReferencesBrowser({
  intersections,
}: EngineeringReferencesBrowserProps) {
  const { theme, toggle } = useStudioThemeContext();
  const isDark = theme === "dark";

  const [tab, setTab] = useState<BrowserTab>("documents");
  const [documentFilters, setDocumentFilters] = useState<DocumentFilters>({
    linked: "unlinked",
    documentType: "all",
    city: "all",
    search: "",
  });
  const [packageFilters, setPackageFilters] = useState<PackageFilters>({
    linked: "all",
    search: "",
  });

  const [documentsState, setDocumentsState] = useState<{
    loading: boolean;
    error: string | null;
    data: EngineeringDocument[];
  }>({ loading: true, error: null, data: [] });
  const [packagesState, setPackagesState] = useState<{
    loading: boolean;
    error: string | null;
    data: ProgrammePackage[];
  }>({ loading: true, error: null, data: [] });
  const [dashboardState, setDashboardState] = useState<{
    loading: boolean;
    error: string | null;
    data: DashboardState;
  }>({
    loading: true,
    error: null,
    data: { counts: null, ingestStatus: null, latestRun: null },
  });

  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
    null,
  );
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(
    null,
  );
  const [documentDrafts, setDocumentDrafts] = useState<
    Record<string, LinkDraft>
  >({});
  const [packageDrafts, setPackageDrafts] = useState<Record<string, LinkDraft>>(
    {},
  );
  const [notice, setNotice] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [documentsReloadKey, setDocumentsReloadKey] = useState(0);
  const [packagesReloadKey, setPackagesReloadKey] = useState(0);
  const [dashboardReloadKey, setDashboardReloadKey] = useState(0);

  const intersectionsById = useMemo(
    () => new Map(intersections.map((intersection) => [intersection.id, intersection])),
    [intersections],
  );

  const sortedIntersections = useMemo(
    () =>
      [...intersections].sort((a, b) =>
        `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`, "fr"),
      ),
    [intersections],
  );

  const refreshDocuments = () => {
    setDocumentsState((current) => ({
      ...current,
      loading: true,
      error: null,
    }));
    setDocumentsReloadKey((current) => current + 1);
  };

  const refreshPackages = () => {
    setPackagesState((current) => ({
      ...current,
      loading: true,
      error: null,
    }));
    setPackagesReloadKey((current) => current + 1);
  };

  const refreshDashboard = () => {
    setDashboardState((current) => ({
      ...current,
      loading: true,
      error: null,
    }));
    setDashboardReloadKey((current) => current + 1);
  };

  useEffect(() => {
    let cancelled = false;
    listReferences({
      documentType:
        documentFilters.documentType === "all"
          ? undefined
          : documentFilters.documentType,
      city: documentFilters.city === "all" ? undefined : documentFilters.city,
      linked:
        documentFilters.linked === "all" ? undefined : documentFilters.linked,
    })
      .then((data) => {
        if (cancelled) return;
        setDocumentsState({ loading: false, error: null, data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setDocumentsState({
          loading: false,
          error: error instanceof Error ? error.message : String(error),
          data: [],
        });
      });
    return () => {
      cancelled = true;
    };
  }, [
    documentFilters.city,
    documentFilters.documentType,
    documentFilters.linked,
    documentsReloadKey,
  ]);

  useEffect(() => {
    let cancelled = false;
    listProgrammePackages()
      .then((data) => {
        if (cancelled) return;
        setPackagesState({ loading: false, error: null, data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setPackagesState({
          loading: false,
          error: error instanceof Error ? error.message : String(error),
          data: [],
        });
      });
    return () => {
      cancelled = true;
    };
  }, [packagesReloadKey]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getReferenceCounts(), getIngestStatus(), listIngestRuns(1)])
      .then(([counts, ingestStatus, runs]) => {
        if (cancelled) return;
        setDashboardState({
          loading: false,
          error: null,
          data: {
            counts,
            ingestStatus,
            latestRun: runs[0] ?? null,
          },
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setDashboardState({
          loading: false,
          error: error instanceof Error ? error.message : String(error),
          data: { counts: null, ingestStatus: null, latestRun: null },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [dashboardReloadKey]);

  const visibleDocuments = useMemo(
    () =>
      documentsState.data.filter((document) =>
        itemMatchesSearch(documentFilters.search, [
          document.title,
          document.fileName,
          document.shortCode,
          document.carrefourLabel,
          document.corridor,
          document.city,
        ]),
      ),
    [documentFilters.search, documentsState.data],
  );

  const visiblePackages = useMemo(
    () =>
      filterPackagesByLink(packagesState.data, packageFilters.linked).filter(
        (pkg) =>
          itemMatchesSearch(packageFilters.search, [
            pkg.packageName,
            pkg.fileName,
            pkg.shortCode,
            pkg.detectedVersion,
            pkg.city,
          ]),
      ),
    [packageFilters.linked, packageFilters.search, packagesState.data],
  );

  const selectedDocument =
    visibleDocuments.find((document) => document.id === selectedDocumentId) ??
    visibleDocuments[0] ??
    null;
  const selectedPackage =
    visiblePackages.find((pkg) => pkg.id === selectedPackageId) ??
    visiblePackages[0] ??
    null;

  const counts = dashboardState.data.counts ?? EMPTY_COUNTS;
  const latestRun = dashboardState.data.latestRun;
  const ingestStatus = dashboardState.data.ingestStatus;

  const panelClass = isDark
    ? "border-white/10 bg-[#071015] text-[#edf3ee]"
    : "border-black/10 bg-white text-[#1b2322]";
  const mutedClass = isDark ? "text-[#8fa39a]" : "text-[#56605b]";
  const chromeClass = isDark
    ? "min-h-screen bg-[radial-gradient(circle_at_top_left,#14100a_0%,#0a0c0e_28%,#050709_65%,#030405_100%)] text-[#edf3ee]"
    : "min-h-screen bg-[#f3f1ea] text-[#1b2322]";

  const getDocumentDraft = (document: EngineeringDocument): LinkDraft =>
    documentDrafts[document.id] ?? {
      intersectionId: document.intersectionId ?? "",
      controllerId: document.controllerId ?? "",
    };

  const getPackageDraft = (pkg: ProgrammePackage): LinkDraft =>
    packageDrafts[pkg.id] ?? {
      intersectionId: pkg.intersectionId ?? "",
      controllerId: pkg.controllerId ?? "",
    };

  const controllersForIntersection = (intersectionId: string) =>
    intersectionsById.get(intersectionId)?.controllers ?? [];

  const defaultControllerIdForIntersection = (intersectionId: string) => {
    const controllers = controllersForIntersection(intersectionId);
    return (
      controllers.find((controller) => controller.isPrimary)?.id ??
      controllers[0]?.id ??
      ""
    );
  };

  const updateDocumentDraft = (documentId: string, next: LinkDraft) => {
    setDocumentDrafts((current) => ({ ...current, [documentId]: next }));
  };

  const updatePackageDraft = (packageId: string, next: LinkDraft) => {
    setPackageDrafts((current) => ({ ...current, [packageId]: next }));
  };

  const clearDocumentDraft = (documentId: string) => {
    setDocumentDrafts((current) => {
      const next = { ...current };
      delete next[documentId];
      return next;
    });
  };

  const clearPackageDraft = (packageId: string) => {
    setPackageDrafts((current) => {
      const next = { ...current };
      delete next[packageId];
      return next;
    });
  };

  const handleDocumentLink = async (document: EngineeringDocument) => {
    const draft = getDocumentDraft(document);
    if (!draft.intersectionId) {
      setNotice({
        tone: "error",
        text: "Choisir un carrefour avant de lier ce document.",
      });
      return;
    }
    setActionBusy(`document:${document.id}`);
    setNotice(null);
    try {
      await linkReference(document.id, {
        intersectionId: draft.intersectionId,
        controllerId: draft.controllerId || null,
      });
      clearDocumentDraft(document.id);
      refreshDocuments();
      refreshDashboard();
      setNotice({
        tone: "ok",
        text: `Document lié à ${intersectionsById.get(draft.intersectionId)?.name ?? "ce carrefour"}.`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setActionBusy(null);
    }
  };

  const handleDocumentUnlink = async (document: EngineeringDocument) => {
    setActionBusy(`document:${document.id}`);
    setNotice(null);
    try {
      await unlinkReference(document.id);
      clearDocumentDraft(document.id);
      refreshDocuments();
      refreshDashboard();
      setNotice({ tone: "ok", text: "Document délié." });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setActionBusy(null);
    }
  };

  const handlePackageLink = async (pkg: ProgrammePackage) => {
    const draft = getPackageDraft(pkg);
    if (!draft.intersectionId) {
      setNotice({
        tone: "error",
        text: "Choisir un carrefour avant de lier cette archive.",
      });
      return;
    }
    setActionBusy(`package:${pkg.id}`);
    setNotice(null);
    try {
      await linkProgrammePackage(pkg.id, {
        intersectionId: draft.intersectionId,
        controllerId: draft.controllerId || null,
      });
      clearPackageDraft(pkg.id);
      refreshPackages();
      refreshDashboard();
      setNotice({
        tone: "ok",
        text: `Archive liée à ${intersectionsById.get(draft.intersectionId)?.name ?? "ce carrefour"}.`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setActionBusy(null);
    }
  };

  const handlePackageUnlink = async (pkg: ProgrammePackage) => {
    setActionBusy(`package:${pkg.id}`);
    setNotice(null);
    try {
      await unlinkProgrammePackage(pkg.id);
      clearPackageDraft(pkg.id);
      refreshPackages();
      refreshDashboard();
      setNotice({ tone: "ok", text: "Archive déliée." });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setActionBusy(null);
    }
  };

  const handleScan = async (force = false) => {
    setScanBusy(true);
    setNotice(null);
    try {
      const run = await triggerIngestScan({ force });
      refreshDocuments();
      refreshPackages();
      refreshDashboard();
      setNotice({
        tone: "ok",
        text:
          `Scan terminé: ${run.documentsCreated + run.documentsUpdated} documents traités, ` +
          `${run.programmePackagesCreated + run.programmePackagesUpdated} archives traitées.`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setScanBusy(false);
    }
  };

  return (
    <main className={chromeClass}>
      <div className="mx-auto flex min-h-screen max-w-[1560px] flex-col gap-5 px-5 py-5">
        <header className="flex flex-wrap items-center gap-3 border-b border-white/8 pb-4">
          <Link
            href="/studio"
            className={clsx(
              "rounded-[10px] border px-3 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.18em] transition",
              panelClass,
            )}
          >
            ← Studio
          </Link>
          <Link
            href="/studio/workbench"
            className={clsx(
              "rounded-[10px] border px-3 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.18em] transition",
              panelClass,
            )}
          >
            Workbench
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[0.58rem] font-semibold uppercase tracking-[0.26em] text-[#ffb547]">
              Engineering References
            </p>
            <h1 className="mt-0.5 truncate text-[1.25rem] font-semibold">
              Catalogue, ingest et liaison manuelle
            </h1>
            <p className={clsx("mt-1 text-[0.76rem]", mutedClass)}>
              Références importées depuis{" "}
              <span className="font-mono">D:\sabrine</span>, séparées du runtime
              live. Les liaisons ci-dessous n’affectent ni la régulation ni le
              déploiement.
            </p>
          </div>
          <button
            type="button"
            onClick={toggle}
            className={clsx(
              "rounded-[10px] border px-3 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.18em] transition",
              panelClass,
            )}
          >
            {isDark ? "☀ Light" : "☾ Dark"}
          </button>
        </header>

        {notice ? (
          <div
            className={clsx(
              "rounded-[10px] border px-3 py-2 text-[0.76rem]",
              notice.tone === "ok"
                ? "border-[#1d4a34] bg-[#0d1913] text-[#a8eac2]"
                : "border-[#5a1d1d] bg-[#180d0d] text-[#ffb0b0]",
            )}
          >
            {notice.text}
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-4">
          <SummaryCard
            title="Documents"
            value={String(counts.documents.total)}
            detail={`${counts.documents.unlinked} non liés`}
            panelClass={panelClass}
            mutedClass={mutedClass}
          />
          <SummaryCard
            title="Archives programme"
            value={String(counts.programmePackages.total)}
            detail={`${counts.programmePackages.unlinked} non liées`}
            panelClass={panelClass}
            mutedClass={mutedClass}
          />
          <SummaryCard
            title="Source"
            value={ingestStatus?.configured ? "Configurée" : "Absente"}
            detail={ingestStatus?.root ?? "STLS_ENGINEERING_REFERENCES_ROOT non défini"}
            panelClass={panelClass}
            mutedClass={mutedClass}
          />
          <div className={clsx("rounded-[12px] border p-4", panelClass)}>
            <p className={clsx("text-[0.58rem] font-semibold uppercase tracking-[0.24em]", mutedClass)}>
              Dernier scan
            </p>
            {dashboardState.loading ? (
              <p className="mt-2 text-[0.78rem]">Chargement…</p>
            ) : dashboardState.error ? (
              <p className="mt-2 text-[0.76rem] text-[#ffb0b0]">
                {dashboardState.error}
              </p>
            ) : latestRun ? (
              <>
                <p className="mt-2 text-[0.92rem] font-semibold">
                  {latestRun.status}
                </p>
                <p className={clsx("mt-1 text-[0.72rem]", mutedClass)}>
                  {formatDate(latestRun.finishedAt ?? latestRun.startedAt)}
                </p>
                <p className={clsx("mt-1 text-[0.72rem]", mutedClass)}>
                  {latestRun.documentsCreated + latestRun.documentsUpdated} docs ·{" "}
                  {latestRun.programmePackagesCreated +
                    latestRun.programmePackagesUpdated}{" "}
                  archives
                </p>
              </>
            ) : (
              <p className={clsx("mt-2 text-[0.76rem]", mutedClass)}>
                Aucun scan enregistré.
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={scanBusy}
                onClick={() => handleScan(false)}
                className="rounded-[8px] border border-[#5a4218] bg-[#14100a] px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#ffb547] transition hover:brightness-110 disabled:opacity-50"
              >
                {scanBusy ? "Scan…" : "Relancer scan"}
              </button>
              <button
                type="button"
                disabled={scanBusy}
                onClick={() => handleScan(true)}
                className={clsx(
                  "rounded-[8px] border px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] transition disabled:opacity-50",
                  panelClass,
                )}
              >
                Force
              </button>
            </div>
          </div>
        </section>

        <section className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className={clsx("flex min-h-[720px] flex-col rounded-[12px] border", panelClass)}>
            <div className="border-b border-white/8 px-4 py-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTab("documents")}
                  className={clsx(
                    "rounded-[8px] px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] transition",
                    tab === "documents"
                      ? "border border-[#5a4218] bg-[#14100a] text-[#ffb547]"
                      : mutedClass,
                  )}
                >
                  Documents
                </button>
                <button
                  type="button"
                  onClick={() => setTab("packages")}
                  className={clsx(
                    "rounded-[8px] px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] transition",
                    tab === "packages"
                      ? "border border-[#5a4218] bg-[#14100a] text-[#ffb547]"
                      : mutedClass,
                  )}
                >
                  Archives
                </button>
              </div>
              {tab === "documents" ? (
                <div className="mt-3 grid gap-2">
                  <input
                    type="text"
                    value={documentFilters.search}
                    onChange={(event) =>
                      setDocumentFilters((current) => ({
                        ...current,
                        search: event.target.value,
                      }))
                    }
                    placeholder="Rechercher titre, fichier, short code…"
                    className={clsx(
                      "rounded-[8px] border px-3 py-2 text-[0.8rem] outline-none",
                      isDark
                        ? "border-white/10 bg-[#0a1014] text-[#edf3ee]"
                        : "border-black/10 bg-[#f8f7f2] text-[#1b2322]",
                    )}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <SelectField
                      value={documentFilters.linked}
                      onChange={(value) => {
                        setDocumentsState((current) => ({
                          ...current,
                          loading: true,
                          error: null,
                        }));
                        setDocumentFilters((current) => ({
                          ...current,
                          linked: value as LinkState,
                        }));
                      }}
                      options={[
                        ["all", "Tous"],
                        ["unlinked", "Non liés"],
                        ["linked", "Liés"],
                      ]}
                      isDark={isDark}
                    />
                    <SelectField
                      value={documentFilters.documentType}
                      onChange={(value) => {
                        setDocumentsState((current) => ({
                          ...current,
                          loading: true,
                          error: null,
                        }));
                        setDocumentFilters((current) => ({
                          ...current,
                          documentType: value as DocumentFilters["documentType"],
                        }));
                      }}
                      options={[
                        ["all", "Tous types"],
                        ["plan_rs", "Plan RS"],
                        ["dossier_regulation", "Dossier"],
                        ["plan_filaire", "Filaire"],
                      ]}
                      isDark={isDark}
                    />
                    <SelectField
                      value={documentFilters.city}
                      onChange={(value) => {
                        setDocumentsState((current) => ({
                          ...current,
                          loading: true,
                          error: null,
                        }));
                        setDocumentFilters((current) => ({
                          ...current,
                          city: value as DocumentFilters["city"],
                        }));
                      }}
                      options={[
                        ["all", "Toutes villes"],
                        ["Fès", "Fès"],
                        ["Marrakech", "Marrakech"],
                        ["unknown", "Unknown"],
                      ]}
                      isDark={isDark}
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-3 grid gap-2">
                  <input
                    type="text"
                    value={packageFilters.search}
                    onChange={(event) =>
                      setPackageFilters((current) => ({
                        ...current,
                        search: event.target.value,
                      }))
                    }
                    placeholder="Rechercher archive, fichier, version…"
                    className={clsx(
                      "rounded-[8px] border px-3 py-2 text-[0.8rem] outline-none",
                      isDark
                        ? "border-white/10 bg-[#0a1014] text-[#edf3ee]"
                        : "border-black/10 bg-[#f8f7f2] text-[#1b2322]",
                    )}
                  />
                  <SelectField
                    value={packageFilters.linked}
                    onChange={(value) =>
                      setPackageFilters((current) => ({
                        ...current,
                        linked: value as LinkState,
                      }))
                    }
                    options={[
                      ["all", "Toutes"],
                      ["unlinked", "Non liées"],
                      ["linked", "Liées"],
                    ]}
                    isDark={isDark}
                  />
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {tab === "documents" ? (
                <ItemList
                  loading={documentsState.loading}
                  error={documentsState.error}
                  emptyLabel="Aucun document ne correspond aux filtres."
                  items={visibleDocuments}
                  activeId={selectedDocument?.id ?? null}
                  onSelect={(id) => setSelectedDocumentId(id)}
                  renderItem={(document, active) => (
                    <ReferenceListItem
                      key={document.id}
                      active={active}
                      title={document.title}
                      subtitle={[
                        document.documentType,
                        document.city,
                        document.shortCode,
                        document.revision ? `rév. ${document.revision}` : null,
                      ]}
                      hint={document.fileName}
                      linked={!!document.intersectionId}
                      isDark={isDark}
                    />
                  )}
                />
              ) : (
                <ItemList
                  loading={packagesState.loading}
                  error={packagesState.error}
                  emptyLabel="Aucune archive ne correspond aux filtres."
                  items={visiblePackages}
                  activeId={selectedPackage?.id ?? null}
                  onSelect={(id) => setSelectedPackageId(id)}
                  renderItem={(pkg, active) => (
                    <ReferenceListItem
                      key={pkg.id}
                      active={active}
                      title={pkg.packageName}
                      subtitle={[
                        pkg.city,
                        pkg.shortCode,
                        pkg.detectedVersion,
                      ]}
                      hint={pkg.fileName}
                      linked={!!pkg.intersectionId}
                      isDark={isDark}
                    />
                  )}
                />
              )}
            </div>
          </div>

          <div className={clsx("min-h-[720px] rounded-[12px] border p-5", panelClass)}>
            {tab === "documents" ? (
              selectedDocument ? (
                <DocumentDetail
                  document={selectedDocument}
                  draft={getDocumentDraft(selectedDocument)}
                  intersections={sortedIntersections}
                  selectedIntersection={
                    getDocumentDraft(selectedDocument).intersectionId
                      ? intersectionsById.get(
                          getDocumentDraft(selectedDocument).intersectionId,
                        ) ?? null
                      : null
                  }
                  onIntersectionChange={(intersectionId) =>
                    updateDocumentDraft(selectedDocument.id, {
                      intersectionId,
                      controllerId: intersectionId
                        ? defaultControllerIdForIntersection(intersectionId)
                        : "",
                    })
                  }
                  onControllerChange={(controllerId) =>
                    updateDocumentDraft(selectedDocument.id, {
                      ...getDocumentDraft(selectedDocument),
                      controllerId,
                    })
                  }
                  onLink={() => handleDocumentLink(selectedDocument)}
                  onUnlink={() => handleDocumentUnlink(selectedDocument)}
                  busy={actionBusy === `document:${selectedDocument.id}`}
                  isDark={isDark}
                />
              ) : (
                <EmptyDetail
                  title="Aucun document sélectionné"
                  detail="Choisir un document dans la liste pour voir ses métadonnées et le lier à un carrefour."
                  mutedClass={mutedClass}
                />
              )
            ) : selectedPackage ? (
              <PackageDetail
                pkg={selectedPackage}
                draft={getPackageDraft(selectedPackage)}
                intersections={sortedIntersections}
                selectedIntersection={
                  getPackageDraft(selectedPackage).intersectionId
                    ? intersectionsById.get(
                        getPackageDraft(selectedPackage).intersectionId,
                      ) ?? null
                    : null
                }
                onIntersectionChange={(intersectionId) =>
                  updatePackageDraft(selectedPackage.id, {
                    intersectionId,
                    controllerId: intersectionId
                      ? defaultControllerIdForIntersection(intersectionId)
                      : "",
                  })
                }
                onControllerChange={(controllerId) =>
                  updatePackageDraft(selectedPackage.id, {
                    ...getPackageDraft(selectedPackage),
                    controllerId,
                  })
                }
                onLink={() => handlePackageLink(selectedPackage)}
                onUnlink={() => handlePackageUnlink(selectedPackage)}
                busy={actionBusy === `package:${selectedPackage.id}`}
                isDark={isDark}
              />
            ) : (
              <EmptyDetail
                title="Aucune archive sélectionnée"
                detail="Choisir une archive programme pour lier sa version de référence à un carrefour ou à un contrôleur."
                mutedClass={mutedClass}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({
  title,
  value,
  detail,
  panelClass,
  mutedClass,
}: {
  title: string;
  value: string;
  detail: string;
  panelClass: string;
  mutedClass: string;
}) {
  return (
    <div className={clsx("rounded-[12px] border p-4", panelClass)}>
      <p className={clsx("text-[0.58rem] font-semibold uppercase tracking-[0.24em]", mutedClass)}>
        {title}
      </p>
      <p className="mt-2 text-[1.15rem] font-semibold">{value}</p>
      <p className={clsx("mt-1 text-[0.74rem]", mutedClass)}>{detail}</p>
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
  isDark,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  isDark: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={clsx(
        "rounded-[8px] border px-2 py-2 text-[0.76rem] outline-none",
        isDark
          ? "border-white/10 bg-[#0a1014] text-[#edf3ee]"
          : "border-black/10 bg-[#f8f7f2] text-[#1b2322]",
      )}
    >
      {options.map(([optionValue, label]) => (
        <option key={optionValue} value={optionValue}>
          {label}
        </option>
      ))}
    </select>
  );
}

function ItemList<T extends { id: string }>({
  loading,
  error,
  emptyLabel,
  items,
  activeId,
  onSelect,
  renderItem,
}: {
  loading: boolean;
  error: string | null;
  emptyLabel: string;
  items: T[];
  activeId: string | null;
  onSelect: (id: string) => void;
  renderItem: (item: T, active: boolean) => React.ReactNode;
}) {
  if (loading) {
    return <p className="px-2 py-3 text-[0.78rem]">Chargement…</p>;
  }
  if (error) {
    return <p className="px-2 py-3 text-[0.78rem] text-[#ffb0b0]">{error}</p>;
  }
  if (items.length === 0) {
    return <p className="px-2 py-3 text-[0.78rem] text-[#8fa39a]">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onSelect(item.id)}
            className="w-full text-left"
          >
            {renderItem(item, item.id === activeId)}
          </button>
        </li>
      ))}
    </ul>
  );
}

function ReferenceListItem({
  title,
  subtitle,
  hint,
  linked,
  active,
  isDark,
}: {
  title: string;
  subtitle: Array<string | null | undefined>;
  hint: string;
  linked: boolean;
  active: boolean;
  isDark: boolean;
}) {
  return (
    <div
      className={clsx(
        "rounded-[10px] border px-3 py-2 transition",
        active
          ? "border-[#5a4218] bg-[#14100a]"
          : isDark
            ? "border-white/8 bg-[#0a1014] hover:border-white/20"
            : "border-black/8 bg-[#f8f7f2] hover:border-black/20",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[0.8rem] font-semibold">{title}</p>
          <p className="mt-0.5 truncate font-mono text-[0.62rem] uppercase tracking-[0.14em] text-[#8fa39a]">
            {subtitle.filter(Boolean).join(" · ") || "—"}
          </p>
          <p className="mt-1 truncate text-[0.66rem] text-[#6b7c74]">{hint}</p>
        </div>
        <span
          className={clsx(
            "rounded-full px-2 py-0.5 text-[0.56rem] font-semibold uppercase tracking-[0.18em]",
            linked
              ? "bg-[#0d1913] text-[#a8eac2]"
              : "bg-[#180d0d] text-[#ffb0b0]",
          )}
        >
          {linked ? "lié" : "non lié"}
        </span>
      </div>
    </div>
  );
}

function EmptyDetail({
  title,
  detail,
  mutedClass,
}: {
  title: string;
  detail: string;
  mutedClass: string;
}) {
  return (
    <div className="grid h-full place-items-center text-center">
      <div className="max-w-md">
        <p className="text-[0.9rem] font-semibold">{title}</p>
        <p className={clsx("mt-2 text-[0.78rem]", mutedClass)}>{detail}</p>
      </div>
    </div>
  );
}

function DocumentDetail({
  document,
  draft,
  intersections,
  selectedIntersection,
  onIntersectionChange,
  onControllerChange,
  onLink,
  onUnlink,
  busy,
  isDark,
}: {
  document: EngineeringDocument;
  draft: LinkDraft;
  intersections: EngineeringIntersectionRecord[];
  selectedIntersection: EngineeringIntersectionRecord | null;
  onIntersectionChange: (intersectionId: string) => void;
  onControllerChange: (controllerId: string) => void;
  onLink: () => void;
  onUnlink: () => void;
  busy: boolean;
  isDark: boolean;
}) {
  const controllers = selectedIntersection?.controllers ?? [];
  return (
    <div className="flex h-full flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[0.58rem] font-semibold uppercase tracking-[0.24em] text-[#ffb547]">
            {document.documentType}
          </p>
          <h2 className="mt-1 text-[1.15rem] font-semibold">{document.title}</h2>
          <p className="mt-1 text-[0.76rem] text-[#8fa39a]">{document.fileName}</p>
        </div>
        <a
          href={engineeringDocumentFileUrl(document.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-[8px] border border-[#5a4218] bg-[#14100a] px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-[#ffb547] transition hover:brightness-110"
        >
          Ouvrir PDF
        </a>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetaBox label="Ville" value={document.city} />
        <MetaBox label="Corridor" value={document.corridor} />
        <MetaBox label="Short code" value={document.shortCode ?? "—"} />
        <MetaBox label="Révision" value={document.revision ?? "—"} />
        <MetaBox label="Carrefour" value={document.carrefourLabel ?? "—"} />
        <MetaBox label="Taille" value={formatSize(document.fileSizeBytes)} />
        <MetaBox
          label="Modifié"
          value={formatDate(document.sourceLastModified)}
        />
        <MetaBox label="Ingest" value={formatDate(document.ingestedAt)} />
      </div>

      {document.parseNotes ? (
        <div className="rounded-[10px] border border-[#5a4218] bg-[#14100a] px-3 py-2 text-[0.74rem] text-[#ffd089]">
          <p className="font-semibold">Note de parsing</p>
          <p className="mt-1">{document.parseNotes}</p>
        </div>
      ) : null}

      <LinkEditor
        currentIntersectionId={document.intersectionId}
        currentControllerId={document.controllerId}
        draft={draft}
        intersections={intersections}
        controllers={controllers}
        onIntersectionChange={onIntersectionChange}
        onControllerChange={onControllerChange}
        onLink={onLink}
        onUnlink={onUnlink}
        busy={busy}
        isDark={isDark}
      />
    </div>
  );
}

function PackageDetail({
  pkg,
  draft,
  intersections,
  selectedIntersection,
  onIntersectionChange,
  onControllerChange,
  onLink,
  onUnlink,
  busy,
  isDark,
}: {
  pkg: ProgrammePackage;
  draft: LinkDraft;
  intersections: EngineeringIntersectionRecord[];
  selectedIntersection: EngineeringIntersectionRecord | null;
  onIntersectionChange: (intersectionId: string) => void;
  onControllerChange: (controllerId: string) => void;
  onLink: () => void;
  onUnlink: () => void;
  busy: boolean;
  isDark: boolean;
}) {
  const controllers = selectedIntersection?.controllers ?? [];
  return (
    <div className="flex h-full flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[0.58rem] font-semibold uppercase tracking-[0.24em] text-[#ffb547]">
            programme_archive
          </p>
          <h2 className="mt-1 text-[1.15rem] font-semibold">{pkg.packageName}</h2>
          <p className="mt-1 text-[0.76rem] text-[#8fa39a]">{pkg.fileName}</p>
        </div>
        <a
          href={programmePackageFileUrl(pkg.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-[8px] border border-[#5a4218] bg-[#14100a] px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-[#ffb547] transition hover:brightness-110"
        >
          Télécharger ZIP
        </a>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetaBox label="Ville" value={pkg.city} />
        <MetaBox label="Short code" value={pkg.shortCode ?? "—"} />
        <MetaBox label="Version" value={pkg.detectedVersion ?? "—"} />
        <MetaBox label="Taille" value={formatSize(pkg.fileSizeBytes)} />
        <MetaBox
          label="Modifié"
          value={formatDate(pkg.sourceLastModified)}
        />
        <MetaBox label="Ingest" value={formatDate(pkg.ingestedAt)} />
        <MetaBox
          label="Référence"
          value={pkg.isReferenceOnly ? "oui" : "non"}
        />
        <MetaBox label="Contenu indexé" value={String(pkg.contents.length)} />
      </div>

      <div className="rounded-[10px] border border-white/8 bg-[#0a1014] px-3 py-3">
        <p className="text-[0.72rem] font-semibold">Contenu archive</p>
        {pkg.contents.length > 0 ? (
          <ul className="mt-2 space-y-1 text-[0.72rem] text-[#8fa39a]">
            {pkg.contents.slice(0, 12).map((entry) => (
              <li key={entry.innerPath} className="font-mono">
                {entry.kind} · {entry.innerPath}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[0.72rem] text-[#8fa39a]">
            Inventaire interne vide. Les archives restent indexées et
            téléchargeables, mais le détail des fichiers internes demande la
            dépendance ZIP optionnelle côté backend.
          </p>
        )}
      </div>

      <LinkEditor
        currentIntersectionId={pkg.intersectionId}
        currentControllerId={pkg.controllerId}
        draft={draft}
        intersections={intersections}
        controllers={controllers}
        onIntersectionChange={onIntersectionChange}
        onControllerChange={onControllerChange}
        onLink={onLink}
        onUnlink={onUnlink}
        busy={busy}
        isDark={isDark}
      />
    </div>
  );
}

function LinkEditor({
  currentIntersectionId,
  currentControllerId,
  draft,
  intersections,
  controllers,
  onIntersectionChange,
  onControllerChange,
  onLink,
  onUnlink,
  busy,
  isDark,
}: {
  currentIntersectionId: string | null;
  currentControllerId: string | null;
  draft: LinkDraft;
  intersections: EngineeringIntersectionRecord[];
  controllers: EngineeringIntersectionRecord["controllers"];
  onIntersectionChange: (intersectionId: string) => void;
  onControllerChange: (controllerId: string) => void;
  onLink: () => void;
  onUnlink: () => void;
  busy: boolean;
  isDark: boolean;
}) {
  return (
    <div className="rounded-[12px] border border-white/8 bg-[#0a1014] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.58rem] font-semibold uppercase tracking-[0.24em] text-[#8fa39a]">
            Liaison STLS
          </p>
          <p className="mt-1 text-[0.74rem] text-[#8fa39a]">
            Carrefour actuel:{" "}
            <span className="font-semibold text-[#edf3ee]">
              {currentIntersectionId ?? "non lié"}
            </span>
          </p>
          <p className="mt-1 text-[0.74rem] text-[#8fa39a]">
            Contrôleur actuel:{" "}
            <span className="font-semibold text-[#edf3ee]">
              {currentControllerId ?? "non lié"}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          {currentIntersectionId ? (
            <Link
              href={`/studio/workspace/${currentIntersectionId}`}
              className="rounded-[8px] border border-white/10 px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-[#c3cdc6] transition hover:border-white/20 hover:text-[#edf3ee]"
            >
              Carrefour
            </Link>
          ) : null}
          {currentControllerId ? (
            <Link
              href={`/studio/controllers/${currentControllerId}`}
              className="rounded-[8px] border border-white/10 px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-[#c3cdc6] transition hover:border-white/20 hover:text-[#edf3ee]"
            >
              Contrôleur
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_280px]">
        <select
          value={draft.intersectionId}
          onChange={(event) => onIntersectionChange(event.target.value)}
          className={clsx(
            "rounded-[8px] border px-3 py-2 text-[0.8rem] outline-none",
            isDark
              ? "border-white/10 bg-[#071015] text-[#edf3ee]"
              : "border-black/10 bg-[#f8f7f2] text-[#1b2322]",
          )}
        >
          <option value="">Choisir un carrefour…</option>
          {intersections.map((intersection) => (
            <option key={intersection.id} value={intersection.id}>
              {intersection.code} — {intersection.name}
            </option>
          ))}
        </select>

        <select
          value={draft.controllerId}
          onChange={(event) => onControllerChange(event.target.value)}
          disabled={!draft.intersectionId}
          className={clsx(
            "rounded-[8px] border px-3 py-2 text-[0.8rem] outline-none disabled:opacity-50",
            isDark
              ? "border-white/10 bg-[#071015] text-[#edf3ee]"
              : "border-black/10 bg-[#f8f7f2] text-[#1b2322]",
          )}
        >
          <option value="">Aucun contrôleur</option>
          {controllers.map((controller) => (
            <option key={controller.id} value={controller.id}>
              {controller.code}
              {controller.isPrimary ? " — primary" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onLink}
          className="rounded-[8px] border border-[#1d4a34] bg-[#0d1913] px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#a8eac2] transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Enregistrement…" : "Enregistrer liaison"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onUnlink}
          className="rounded-[8px] border border-[#5a1d1d] bg-[#180d0d] px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#ffb0b0] transition hover:brightness-110 disabled:opacity-50"
        >
          Délier
        </button>
      </div>
    </div>
  );
}

function MetaBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-white/8 bg-[#0a1014] px-3 py-2">
      <p className="text-[0.56rem] font-semibold uppercase tracking-[0.22em] text-[#8fa39a]">
        {label}
      </p>
      <p className="mt-1 text-[0.8rem] font-semibold text-[#edf3ee]">{value}</p>
    </div>
  );
}
