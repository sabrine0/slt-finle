"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CircleF,
  GoogleMap,
  MarkerF,
  PolylineF,
  useJsApiLoader,
} from "@react-google-maps/api";
import { Component, useCallback, useMemo, useState, type ReactNode } from "react";

import { useStudioThemeContext } from "@/components/studio-landing/theme-context";
import {
  GOOGLE_MAPS_LIBRARIES,
  GOOGLE_MAPS_LOADER_ID,
  GOOGLE_MAPS_REGION,
} from "@/lib/google-maps-loader";
import {
  analyzeStudy,
  approveProposal,
  generateProposals,
  type EngineeringProposal,
  type IntersectionShape,
  type IntersectionStudy,
  type ProposalSet,
  type ScopeKind,
} from "@/lib/ai-engineering-api";
import { fetchOsmGeometry } from "@/lib/osm-geometry";
import {
  geometrySafeSubset,
  initialStages,
  mergeNotice,
  setStage,
  translateAnalysisError,
  type AnalysisNotice,
  type AnalysisStage,
} from "@/lib/ai-analysis-errors";
import {
  interpretGeometry,
  type GeometryInterpretation,
  type OverlayLayerId,
} from "@/lib/geometry-interpretation";
import {
  BENCHMARK_SCENARIOS,
  type BenchmarkDifficulty,
  type BenchmarkScenario,
} from "@/lib/benchmark-scenarios";

interface AiEtudeWorkspaceProps {
  apiKey?: string;
}

const SCOPE_OPTIONS: Array<{ value: ScopeKind; label: string; help: string }> =
  [
    {
      value: "standard",
      label: "Standard",
      help: "Carrefour VP + piétons. Pas de transports en commun en site propre.",
    },
    {
      value: "tram",
      label: "Tramway",
      help: "Inclut une variante de priorité tramway via SigFer.",
    },
    {
      value: "cablage",
      label: "Câblage",
      help: "Dossier câblage / installation — focus équipements et entrées contrôleur.",
    },
  ];

const SHAPE_OPTIONS: Array<{ value: IntersectionShape; label: string }> = [
  { value: "cruciform", label: "Cruciforme (4 branches)" },
  { value: "t-junction", label: "T (3 branches)" },
  { value: "y-junction", label: "Y" },
  { value: "mini-roundabout", label: "Mini-giratoire" },
  { value: "plaza", label: "Place urbaine" },
];

const DEFAULT_CENTER = { lat: 33.5731, lng: -7.5898 }; // Casablanca

export function AiEtudeWorkspace({ apiKey }: AiEtudeWorkspaceProps) {
  const { theme, toggle } = useStudioThemeContext();
  const isDark = theme === "dark";
  const router = useRouter();

  // ----- form state -----
  const [name, setName] = useState("");
  const [district, setDistrict] = useState("");
  const [address, setAddress] = useState("");
  const [scope, setScope] = useState<ScopeKind>("standard");
  const [shapeHint, setShapeHint] = useState<IntersectionShape>("cruciform");
  const [notes, setNotes] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number }>(
    DEFAULT_CENTER,
  );

  // ----- analysis state -----
  const [study, setStudy] = useState<IntersectionStudy | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStage, setAnalyzeStage] = useState<string>("");
  const [stages, setStages] = useState<AnalysisStage[]>(() => initialStages());
  const [notices, setNotices] = useState<AnalysisNotice[]>([]);

  // ----- proposal state -----
  const [proposals, setProposals] = useState<ProposalSet | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  // ----- approval form -----
  const [intersectionCode, setIntersectionCode] = useState("");
  const [controllerCode, setControllerCode] = useState("");

  // ----- engineering overlays -----
  const [layerToggles, setLayerToggles] = useState<
    Record<OverlayLayerId, boolean>
  >({
    centerlines: true,
    lanes: true,
    "stop-lines": true,
    movements: false,
    pedestrians: true,
    detectors: true,
    "signal-heads": true,
    conflicts: true,
  });

  const geometryInterpretation = useMemo<GeometryInterpretation | null>(() => {
    if (!study) return null;
    return interpretGeometry({
      center: { lat: study.latitude, lng: study.longitude },
      study,
    });
  }, [study]);

  // A notice is only meaningful while the stage it refers to is still
  // failing or degraded. Once that stage reaches "ok" (e.g. a transient
  // proposal-generation error that a retry resolved), the notice is
  // stale — never render it, so the banner can't contradict the pipeline.
  const visibleNotices = useMemo<AnalysisNotice[]>(
    () =>
      notices.filter((n) => {
        if (!n.stage) return true;
        return stages.find((s) => s.id === n.stage)?.status !== "ok";
      }),
    [notices, stages],
  );

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey ?? "",
    id: GOOGLE_MAPS_LOADER_ID,
    libraries: GOOGLE_MAPS_LIBRARIES,
    region: GOOGLE_MAPS_REGION,
  });

  const handleMapClick = useCallback((event: google.maps.MapMouseEvent) => {
    const lat = event.latLng?.lat();
    const lng = event.latLng?.lng();
    if (lat == null || lng == null) return;
    setCoords({ lat, lng });
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!name.trim() || analyzing) return;
    setAnalyzing(true);
    setError(null);
    setStudy(null);
    setProposals(null);
    setSelectedId(null);
    setNotices([]);
    let pipeline = initialStages();
    setStages(pipeline);
    let collected: AnalysisNotice[] = [];

    const baseInput = {
      name: name.trim(),
      district: district.trim() || undefined,
      address: address.trim() || undefined,
      latitude: coords.lat,
      longitude: coords.lng,
      scope,
      shapeHint,
      notes: notes.trim() || undefined,
    };

    try {
      // -------- Stage 1: map extraction (OSM Overpass) --------
      pipeline = setStage(pipeline, "map-extraction", "running");
      setStages(pipeline);
      setAnalyzeStage("Lecture des données OSM (Overpass)…");

      let geometry: Awaited<ReturnType<typeof fetchOsmGeometry>> = null;
      try {
        geometry = await fetchOsmGeometry(coords.lat, coords.lng);
      } catch (err) {
        const t = translateAnalysisError(err, { stage: "map-extraction" });
        collected = mergeNotice(collected, t.notice, { kind: t.kind });
        geometry = null;
      }

      if (geometry) {
        pipeline = setStage(
          pipeline,
          "map-extraction",
          "ok",
          `${geometry.approaches.length} approche(s) · ${geometry.source}`,
        );
      } else {
        pipeline = setStage(
          pipeline,
          "map-extraction",
          "fallback",
          "OSM indisponible — hypothèses géométriques synthétiques",
        );
        collected = mergeNotice(collected, {
          id: `n-osm-${Date.now()}`,
          severity: "info",
          stage: "map-extraction",
          title: "Extraction cartographique indisponible",
          description:
            "Les données OSM Overpass n'ont pas pu être récupérées. L'analyse continue avec une géométrie synthétique 4 branches.",
        });
      }
      setStages(pipeline);

      // -------- Stage 2: geometry analysis (backend) --------
      pipeline = setStage(pipeline, "geometry-analysis", "running");
      setStages(pipeline);
      setAnalyzeStage(
        geometry
          ? `Analyse de ${geometry.approaches.length} approche(s) détectée(s)…`
          : "Analyse heuristique (OSM indisponible)…",
      );

      let result: IntersectionStudy | null = null;
      let geometryDegraded = false;

      try {
        result = await analyzeStudy({
          ...baseInput,
          geometry: geometry ?? undefined,
        });
      } catch (err) {
        const t = translateAnalysisError(err, {
          stage: "geometry-analysis",
          fallbackHint:
            "Le moteur n'a pas accepté la géométrie enrichie. Relance avec une géométrie simplifiée…",
        });

        // Recoverable schema mismatch → retry with a safe subset of
        // the geometry so the analyzer still benefits from the
        // approaches/crossings data it does understand.
        if (t.recoverable && geometry) {
          collected = mergeNotice(collected, t.notice, { kind: t.kind });
          try {
            result = await analyzeStudy({
              ...baseInput,
              geometry: geometrySafeSubset(geometry),
            });
            geometryDegraded = true;
          } catch (innerErr) {
            const t2 = translateAnalysisError(innerErr, {
              stage: "geometry-analysis",
            });
            collected = mergeNotice(collected, t2.notice, { kind: t2.kind });
          }
        }

        // Final fallback: try with no geometry at all (synthetic).
        if (!result) {
          try {
            result = await analyzeStudy(baseInput);
            geometryDegraded = true;
            collected = mergeNotice(collected, {
              id: `n-geom-${Date.now()}`,
              severity: "warning",
              stage: "geometry-analysis",
              title: "Analyse géométrique en mode dégradé",
              description:
                "L'analyse fonctionne avec une géométrie estimée. La confiance et les recommandations sont en mode prudent.",
            });
          } catch (lastErr) {
            const t3 = translateAnalysisError(lastErr, {
              stage: "geometry-analysis",
            });
            collected = mergeNotice(collected, t3.notice, { kind: t3.kind });
          }
        }
      }

      if (!result) {
        pipeline = setStage(
          pipeline,
          "geometry-analysis",
          "failed",
          "Analyse interrompue",
        );
        pipeline = setStage(pipeline, "topology-classification", "failed");
        pipeline = setStage(pipeline, "engineering-inference", "failed");
        setStages(pipeline);
        setNotices(collected);
        setAnalyzeStage("");
        return;
      }

      pipeline = setStage(
        pipeline,
        "geometry-analysis",
        geometryDegraded ? "fallback" : "ok",
        geometryDegraded
          ? "Géométrie simplifiée (enrichissement partiel)"
          : `${result.observedGeometry.approaches.length} approche(s) analysée(s)`,
      );

      // -------- Stage 3: topology classification --------
      pipeline = setStage(
        pipeline,
        "topology-classification",
        result.confidence?.classification != null &&
          result.confidence.classification < 0.6
          ? "fallback"
          : "ok",
        `${result.classificationLabel} · confiance ${Math.round((result.confidence?.classification ?? 0.5) * 100)}%`,
      );

      // -------- Stage 4: engineering inference --------
      pipeline = setStage(
        pipeline,
        "engineering-inference",
        "ok",
        `${result.constraints.length} contrainte(s) · ${result.recommendedVariantCodes.length} variante(s) recommandée(s)`,
      );

      setStages(pipeline);
      setStudy(result);
      setNotices(collected);
      setAnalyzeStage("");
    } catch (err) {
      // Catch-all safety net — never let raw errors reach the UI.
      const t = translateAnalysisError(err);
      collected = mergeNotice(collected, t.notice, { kind: t.kind });
      setNotices(collected);
      setAnalyzeStage("");
    } finally {
      setAnalyzing(false);
    }
  }, [name, district, address, coords, scope, shapeHint, notes, analyzing]);

  const handleGenerateFromStudy = useCallback(async () => {
    if (!study || busy) return;
    setBusy(true);
    setError(null);
    setProposals(null);
    setSelectedId(null);
    // Drop any notice left by a previous generation attempt so a retry
    // that succeeds doesn't keep showing a stale failure warning.
    setNotices((prev) => prev.filter((n) => n.stage !== "proposal-generation"));
    setStages((prev) => setStage(prev, "proposal-generation", "running"));
    try {
      const set = await generateProposals({
        name: study.name,
        district: district.trim() || undefined,
        address: address.trim() || undefined,
        latitude: study.latitude,
        longitude: study.longitude,
        scope: study.scope,
        shapeHint,
        notes: notes.trim() || undefined,
        studyId: study.id,
      });
      setProposals(set);
      setSelectedId(set.proposals[0]?.id ?? null);
      setStages((prev) =>
        setStage(
          prev,
          "proposal-generation",
          "ok",
          `${set.proposals.length} variante(s) générée(s)`,
        ),
      );
    } catch (err) {
      const t = translateAnalysisError(err, { stage: "proposal-generation" });
      setNotices((prev) => mergeNotice(prev, t.notice, { kind: t.kind }));
      setStages((prev) =>
        setStage(prev, "proposal-generation", "failed", t.notice.title),
      );
    } finally {
      setBusy(false);
    }
  }, [study, district, address, shapeHint, notes, busy]);

  const selectedProposal = useMemo<EngineeringProposal | null>(() => {
    if (!proposals || !selectedId) return null;
    return proposals.proposals.find((p) => p.id === selectedId) ?? null;
  }, [proposals, selectedId]);

  const handleApprove = useCallback(async () => {
    if (!selectedProposal || approving) return;
    const intCode = intersectionCode.trim().toUpperCase();
    const ctrlCode = controllerCode.trim().toUpperCase();

    if (!intCode) {
      setError(
        "Code carrefour obligatoire — format attendu : INT-{REGION}-{IDENT} (ex. INT-RBA-001).",
      );
      return;
    }
    if (!/^INT-[A-Z]{2,4}-[A-Z0-9]{2,8}$/.test(intCode)) {
      setError(
        `Code carrefour invalide : « ${intCode} ». Format attendu : INT-{REGION 2-4 lettres}-{IDENT 2-8 alphanum.} — ex. INT-RBA-001, INT-CASA-A12.`,
      );
      return;
    }
    if (ctrlCode && !/^CTRL-[A-Z]{2,4}-[A-Z0-9]{2,8}$/.test(ctrlCode)) {
      setError(
        `Code contrôleur invalide : « ${ctrlCode} ». Format attendu : CTRL-{REGION 2-4 lettres}-{IDENT 2-8 alphanum.} — ex. CTRL-RBA-001. Laissez vide pour génération automatique.`,
      );
      return;
    }

    setApproving(true);
    setError(null);
    try {
      const result = await approveProposal(selectedProposal.id, {
        code: intCode,
        name: name.trim(),
        district: district.trim() || undefined,
        address: address.trim() || undefined,
        controllerCode: ctrlCode || undefined,
      });
      router.push(result.redirectTo);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      // If the backend already returned a human-readable French
      // validation message (custom @Matches messages, etc.), pass
      // it through verbatim — it is already engineering-grade and
      // far more actionable than the generic translator fallback.
      const looksLikeFormHint =
        /\bdoit suivre le format\b/i.test(raw) ||
        /\bcode\b.*\bformat\b/i.test(raw) ||
        /^Code\s+(carrefour|contr[oô]leur)/i.test(raw);
      if (looksLikeFormHint) {
        setError(raw);
      } else {
        const t = translateAnalysisError(err);
        setError(`${t.notice.title} · ${t.notice.description}`);
      }
      setApproving(false);
    }
  }, [
    selectedProposal,
    intersectionCode,
    name,
    district,
    address,
    controllerCode,
    approving,
    router,
  ]);

  const shellClass = isDark
    ? "min-h-screen bg-[#04070a] text-[#edf3ee]"
    : "min-h-screen bg-[#f5f3ec] text-[#1b2322]";
  const panelClass = isDark
    ? "border-white/10 bg-[#07100d]"
    : "border-black/10 bg-white";
  const mutedText = isDark ? "text-[#9eb1a4]" : "text-[#5e6962]";

  return (
    <div className={shellClass}>
      <header
        className={`flex items-center justify-between border-b px-6 py-3 ${
          isDark ? "border-white/10" : "border-black/10"
        }`}
      >
        <div className="flex items-center gap-4">
          <Link
            href="/studio"
            className={`text-xs font-semibold uppercase tracking-[0.2em] ${mutedText}`}
          >
            ← Studio
          </Link>
          <div>
            <p className={`text-[0.6rem] font-semibold uppercase tracking-[0.22em] ${mutedText}`}>
              Module · AI Engineering Assistant
            </p>
            <h1 className="mt-0.5 text-base font-semibold">
              Étude assistée — proposition de carrefour
            </h1>
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          className={`rounded-full border px-3 py-1 text-[0.7rem] font-semibold ${
            isDark
              ? "border-white/15 hover:border-white/30"
              : "border-black/15 hover:bg-white"
          }`}
        >
          {isDark ? "Mode clair" : "Mode sombre"}
        </button>
      </header>

      <div className="grid grid-cols-[360px_1fr]">
        {/* ============== Left panel : input ============== */}
        <aside
          className={`min-h-[calc(100vh-50px)] border-r px-4 py-4 ${
            isDark ? "border-white/10" : "border-black/10"
          }`}
        >
          <BenchmarkScenarioPicker
            isDark={isDark}
            mutedClass={mutedText}
            onLoad={(s) => {
              setName(s.name);
              setDistrict(s.district);
              setAddress(s.address ?? "");
              setCoords({ lat: s.latitude, lng: s.longitude });
              setScope(s.scope);
              if (s.shapeHint) setShapeHint(s.shapeHint);
              setNotes(s.notes);
            }}
          />
          <SectionTitle label="1 · Localisation" mutedClass={mutedText} />
          <div className="space-y-2">
            <Field label="Nom du carrefour" mutedClass={mutedText}>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex. Pl. Bab El Had / Tram"
                className={`w-full rounded-[6px] border px-2.5 py-1.5 text-[0.78rem] outline-none ${
                  isDark
                    ? "border-white/15 bg-black/30"
                    : "border-black/15 bg-white"
                }`}
              />
            </Field>
            <Field label="Quartier" mutedClass={mutedText}>
              <input
                type="text"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="ex. Médina"
                className={`w-full rounded-[6px] border px-2.5 py-1.5 text-[0.78rem] outline-none ${
                  isDark
                    ? "border-white/15 bg-black/30"
                    : "border-black/15 bg-white"
                }`}
              />
            </Field>
            <Field label="Adresse (optionnelle)" mutedClass={mutedText}>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="ex. Bd Mohammed VI x Av. Espagne"
                className={`w-full rounded-[6px] border px-2.5 py-1.5 text-[0.78rem] outline-none ${
                  isDark
                    ? "border-white/15 bg-black/30"
                    : "border-black/15 bg-white"
                }`}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Latitude" mutedClass={mutedText}>
                <input
                  type="number"
                  step="0.000001"
                  value={coords.lat}
                  onChange={(e) =>
                    setCoords((prev) => ({
                      ...prev,
                      lat: Number(e.target.value),
                    }))
                  }
                  className={`w-full rounded-[6px] border px-2.5 py-1.5 font-mono text-[0.74rem] outline-none ${
                    isDark
                      ? "border-white/15 bg-black/30"
                      : "border-black/15 bg-white"
                  }`}
                />
              </Field>
              <Field label="Longitude" mutedClass={mutedText}>
                <input
                  type="number"
                  step="0.000001"
                  value={coords.lng}
                  onChange={(e) =>
                    setCoords((prev) => ({
                      ...prev,
                      lng: Number(e.target.value),
                    }))
                  }
                  className={`w-full rounded-[6px] border px-2.5 py-1.5 font-mono text-[0.74rem] outline-none ${
                    isDark
                      ? "border-white/15 bg-black/30"
                      : "border-black/15 bg-white"
                  }`}
                />
              </Field>
            </div>
          </div>

          <SectionTitle label="2 · Cadre engineering" mutedClass={mutedText} />
          <Field label="Scope" mutedClass={mutedText}>
            <div className="space-y-1">
              {SCOPE_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setScope(opt.value)}
                  className={`flex w-full flex-col items-start gap-0.5 rounded-[6px] border px-2.5 py-1.5 text-left transition ${
                    scope === opt.value
                      ? isDark
                        ? "border-emerald-400/40 bg-emerald-500/10"
                        : "border-emerald-700/30 bg-emerald-100"
                      : isDark
                        ? "border-white/10 hover:border-white/25"
                        : "border-black/10 hover:bg-black/5"
                  }`}
                >
                  <span className="text-[0.78rem] font-semibold">
                    {opt.label}
                  </span>
                  <span className={`text-[0.66rem] ${mutedText}`}>
                    {opt.help}
                  </span>
                </button>
              ))}
            </div>
          </Field>

          <Field label="Topologie indicative" mutedClass={mutedText}>
            <select
              value={shapeHint}
              onChange={(e) =>
                setShapeHint(e.target.value as IntersectionShape)
              }
              className={`w-full rounded-[6px] border px-2.5 py-1.5 text-[0.78rem] outline-none ${
                isDark
                  ? "border-white/15 bg-black/30"
                  : "border-black/15 bg-white"
              }`}
            >
              {SHAPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Notes ingénieur (optionnel)" mutedClass={mutedText}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Contraintes site, contexte trafic, exigences exploitant..."
              className={`w-full rounded-[6px] border px-2.5 py-1.5 text-[0.74rem] outline-none ${
                isDark
                  ? "border-white/15 bg-black/30"
                  : "border-black/15 bg-white"
              }`}
            />
          </Field>

          {study ? (
            <div
              className={`mt-3 rounded-[6px] border px-3 py-2 text-[0.7rem] ${
                isDark
                  ? "border-emerald-400/30 bg-emerald-500/5 text-emerald-100"
                  : "border-emerald-700/30 bg-emerald-50 text-emerald-900"
              }`}
            >
              <p className="font-semibold uppercase tracking-[0.18em] text-[0.6rem]">
                Étude verrouillée
              </p>
              <p className="mt-0.5 font-mono">
                {study.classificationLabel} · complexité{" "}
                {study.complexityScore}/10
              </p>
              <p className="mt-0.5">
                {study.observedGeometry.source} ·{" "}
                {study.observedGeometry.approaches.length} approche(s).
              </p>
              <button
                type="button"
                onClick={() => {
                  setStudy(null);
                  setProposals(null);
                  setSelectedId(null);
                  setIntersectionCode("");
                  setControllerCode("");
                  setError(null);
                }}
                className={`mt-1.5 inline-flex rounded-[4px] border px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] ${
                  isDark
                    ? "border-emerald-400/40 hover:bg-emerald-500/15"
                    : "border-emerald-700/40 hover:bg-emerald-100"
                }`}
              >
                Relancer l’analyse
              </button>
            </div>
          ) : null}

          {!study ? (
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={!name.trim() || analyzing}
              className={`mt-3 w-full rounded-[6px] border px-3 py-2 text-[0.78rem] font-semibold transition ${
                isDark
                  ? "border-amber-400/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
                  : "border-amber-700/30 bg-amber-100 text-amber-900 hover:bg-amber-200"
              } disabled:opacity-50`}
            >
              {analyzing
                ? analyzeStage || "Analyse en cours…"
                : "🧠 Lancer l’analyse du carrefour"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleGenerateFromStudy}
              disabled={busy || proposals != null}
              className={`mt-3 w-full rounded-[6px] border px-3 py-2 text-[0.78rem] font-semibold transition ${
                isDark
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
                  : "border-emerald-700/30 bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
              } disabled:opacity-50`}
            >
              {busy
                ? "Génération…"
                : proposals
                  ? "✓ Propositions générées"
                  : `🤖 Générer ${study.recommendedVariantCodes.length} proposition(s) recommandée(s)`}
            </button>
          )}

          <p className={`mt-2 text-[0.65rem] ${mutedText}`}>
            Pipeline : OSM Overpass → Analyseur géométrie/contraintes →
            Sélection de stratégies → Propositions. Source heuristique
            hors-ligne (Claude SDK + DXF/PDF en Phase 2).
          </p>
        </aside>

        {/* ============== Right area : map + proposals ============== */}
        <main className="flex flex-col">
          {/* Map */}
          <div
            className="relative border-b"
            style={{ height: 260 }}
          >
            {!apiKey ? (
              <div
                className={`grid h-full place-items-center px-6 text-center text-[0.78rem] ${mutedText}`}
              >
                NEXT_PUBLIC_GOOGLE_MAPS_API_KEY non configurée — utiliser les
                champs Lat / Lng manuels.
              </div>
            ) : loadError ? (
              <div className="grid h-full place-items-center text-[0.78rem] text-red-400">
                Échec du chargement de Google Maps.
              </div>
            ) : !isLoaded ? (
              <div
                className={`grid h-full place-items-center text-[0.78rem] ${mutedText}`}
              >
                Chargement de la carte…
              </div>
            ) : (
              <GoogleMap
                mapContainerStyle={{ width: "100%", height: "100%" }}
                center={coords}
                zoom={Number.isFinite(coords.lat) ? 17 : 6}
                onClick={handleMapClick}
                options={{
                  mapTypeId: "hybrid",
                  streetViewControl: false,
                  fullscreenControl: false,
                  tilt: 0,
                }}
              >
                <MarkerF position={coords} />
                {geometryInterpretation ? (
                  <EngineeringOverlayLayer
                    interpretation={geometryInterpretation}
                    toggles={layerToggles}
                  />
                ) : null}
              </GoogleMap>
            )}
            <div
              className={`pointer-events-none absolute left-3 top-3 rounded-[6px] border px-2.5 py-1 text-[0.65rem] font-mono ${
                isDark
                  ? "border-white/15 bg-black/60 text-[#dfe8da]"
                  : "border-black/10 bg-white/90 text-[#1b2322]"
              }`}
            >
              {coords.lat.toFixed(6)} N · {coords.lng.toFixed(6)} E · cliquez
              pour repositionner
            </div>
            {geometryInterpretation ? (
              <OverlayLayerPanel
                toggles={layerToggles}
                onToggle={(id) =>
                  setLayerToggles((prev) => ({ ...prev, [id]: !prev[id] }))
                }
                isDark={isDark}
              />
            ) : null}
          </div>

          {/* Proposals */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {stages.some((s) => s.status !== "idle") ? (
              <AnalysisPipelinePanel
                stages={stages}
                isDark={isDark}
                mutedClass={mutedText}
              />
            ) : null}

            {visibleNotices.length > 0 ? (
              <AnalysisNoticesPanel
                notices={visibleNotices}
                isDark={isDark}
                mutedClass={mutedText}
                onDismiss={(id) =>
                  setNotices((prev) => prev.filter((n) => n.id !== id))
                }
              />
            ) : null}

            {error ? (
              <div
                className={`mb-3 rounded-[6px] border px-3 py-2 text-[0.78rem] ${
                  isDark
                    ? "border-red-400/40 bg-red-500/10 text-red-100"
                    : "border-red-700/30 bg-red-50 text-red-900"
                }`}
              >
                {error}
              </div>
            ) : null}

            {study ? (
              <StudyPanelErrorBoundary
                isDark={isDark}
                mutedClass={mutedText}
              >
                <StudyPanel
                  study={study}
                  isDark={isDark}
                  mutedClass={mutedText}
                  panelClass={panelClass}
                />
              </StudyPanelErrorBoundary>
            ) : null}

            {!proposals && !study ? (
              <EmptyState mutedClass={mutedText} />
            ) : !proposals ? null : (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <p
                    className={`text-[0.62rem] font-semibold uppercase tracking-[0.22em] ${mutedText}`}
                  >
                    {proposals.proposals.length} propositions générées · expire
                    le {new Date(proposals.expiresAt).toLocaleTimeString("fr-FR")}
                  </p>
                  <p className={`text-[0.62rem] ${mutedText}`}>
                    Source : {proposals.source}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                  {proposals.proposals.map((proposal) => (
                    <ProposalCard
                      key={proposal.id}
                      proposal={proposal}
                      isDark={isDark}
                      mutedClass={mutedText}
                      panelClass={panelClass}
                      selected={selectedId === proposal.id}
                      onSelect={() => setSelectedId(proposal.id)}
                    />
                  ))}
                </div>

                {selectedProposal ? (
                  <ApprovalPanel
                    proposal={selectedProposal}
                    isDark={isDark}
                    mutedClass={mutedText}
                    panelClass={panelClass}
                    intersectionCode={intersectionCode}
                    setIntersectionCode={setIntersectionCode}
                    controllerCode={controllerCode}
                    setControllerCode={setControllerCode}
                    onApprove={handleApprove}
                    approving={approving}
                  />
                ) : null}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------

const DIFFICULTY_LABELS: Record<BenchmarkDifficulty, string> = {
  simple: "Simple",
  medium: "Moyen",
  advanced: "Avancé",
  tramway: "Tramway",
  "multi-branch": "Multi-branches",
  flagship: "★ Benchmark phare",
};

const DIFFICULTY_ORDER: BenchmarkDifficulty[] = [
  "flagship",
  "tramway",
  "advanced",
  "multi-branch",
  "medium",
  "simple",
];

function BenchmarkScenarioPicker({
  isDark,
  mutedClass,
  onLoad,
}: {
  isDark: boolean;
  mutedClass: string;
  onLoad: (scenario: BenchmarkScenario) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const grouped = useMemo(() => {
    const map = new Map<BenchmarkDifficulty, BenchmarkScenario[]>();
    for (const s of BENCHMARK_SCENARIOS) {
      const list = map.get(s.difficulty) ?? [];
      list.push(s);
      map.set(s.difficulty, list);
    }
    return map;
  }, []);

  const chipBase = isDark
    ? "border-white/15 hover:bg-white/10"
    : "border-black/15 hover:bg-black/5";
  const chipActive = isDark
    ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100"
    : "border-emerald-700/40 bg-emerald-50 text-emerald-900";

  return (
    <section
      className={`mb-3 rounded-[8px] border ${
        isDark ? "border-white/10 bg-white/[0.03]" : "border-black/10 bg-black/[0.02]"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-2.5 py-1.5 text-left"
        aria-expanded={open}
      >
        <span
          className={`text-[0.6rem] font-semibold uppercase tracking-[0.22em] ${mutedClass}`}
        >
          Scénarios benchmark · {BENCHMARK_SCENARIOS.length}
        </span>
        <span
          className={`font-mono text-[0.65rem] ${mutedClass}`}
          aria-hidden
        >
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? (
        <div className="space-y-2 px-2.5 pb-2.5">
          <p className={`text-[0.66rem] leading-tight ${mutedClass}`}>
            Cas réels marocains pour stress-tester l&apos;IA. La complexité
            attendue, l&apos;incertitude et les avertissements{" "}
            <strong>sont des signaux positifs</strong>.
          </p>
          {DIFFICULTY_ORDER.map((diff) => {
            const list = grouped.get(diff);
            if (!list || list.length === 0) return null;
            return (
              <div key={diff}>
                <p
                  className={`mb-1 text-[0.58rem] font-semibold uppercase tracking-[0.2em] ${mutedClass}`}
                >
                  {DIFFICULTY_LABELS[diff]}
                </p>
                <div className="flex flex-col gap-1">
                  {list.map((s) => {
                    const isActive = activeId === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setActiveId(s.id);
                          onLoad(s);
                        }}
                        className={`rounded-[6px] border px-2 py-1.5 text-left text-[0.7rem] transition ${
                          isActive ? chipActive : chipBase
                        }`}
                        title={s.notes}
                      >
                        <span className="block truncate font-semibold">
                          {s.title}
                        </span>
                        <span
                          className={`mt-0.5 block truncate font-mono text-[0.6rem] ${mutedClass}`}
                        >
                          {s.city} · {s.latitude.toFixed(4)},{" "}
                          {s.longitude.toFixed(4)}
                        </span>
                        {s.challenges.length > 0 ? (
                          <span
                            className={`mt-0.5 block truncate text-[0.6rem] ${mutedClass}`}
                          >
                            {s.challenges.slice(0, 3).join(" · ")}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function SectionTitle({
  label,
  mutedClass,
}: {
  label: string;
  mutedClass: string;
}) {
  return (
    <p
      className={`mb-2 mt-4 text-[0.6rem] font-semibold uppercase tracking-[0.22em] ${mutedClass}`}
    >
      {label}
    </p>
  );
}

function Field({
  label,
  mutedClass,
  children,
}: {
  label: string;
  mutedClass: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className={`mb-0.5 block text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${mutedClass}`}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function ProposalCard({
  proposal,
  isDark,
  mutedClass,
  panelClass,
  selected,
  onSelect,
}: {
  proposal: EngineeringProposal;
  isDark: boolean;
  mutedClass: string;
  panelClass: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const complexityColor =
    proposal.reasoning.estimatedComplexity === "high"
      ? "text-red-400"
      : proposal.reasoning.estimatedComplexity === "medium"
        ? "text-amber-400"
        : "text-emerald-400";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col rounded-[10px] border p-3 text-left transition ${panelClass} ${
        selected
          ? isDark
            ? "ring-2 ring-amber-400/70"
            : "ring-2 ring-amber-600/70"
          : "hover:-translate-y-px hover:brightness-110"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className={`text-[0.6rem] font-mono uppercase tracking-[0.18em] ${mutedClass}`}
          >
            {proposal.variantCode}
          </p>
          <h3 className="mt-0.5 text-[0.86rem] font-semibold">
            {proposal.title}
          </h3>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${complexityColor} ${
            isDark ? "border-white/15" : "border-black/15"
          }`}
        >
          {proposal.reasoning.estimatedComplexity}
        </span>
      </div>

      <p className={`mt-1 text-[0.72rem] ${mutedClass}`}>
        {proposal.shortDescription}
      </p>

      {/* Mini geometry preview */}
      <div className="mt-2">
        <ProposalSchematic proposal={proposal} isDark={isDark} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[0.7rem]">
        <Stat label="Phases" value={proposal.phases.length} />
        <Stat
          label="Cycle"
          value={`${proposal.capacity.cycleSeconds}s`}
          mono
        />
        <Stat
          label="Sat. HPM"
          value={`${Math.round(proposal.capacity.saturationHPM * 100)}%`}
          mono
        />
        <Stat
          label="Réserve"
          value={`${proposal.capacity.capacityReservePercent}%`}
          mono
        />
        <Stat label="Sign. groups" value={proposal.signalGroups.length} />
        <Stat label="Détecteurs" value={proposal.detectors.length} />
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] opacity-70">
          Qualité op.
        </span>
        <QualityBar
          value={proposal.reasoning.operationalQuality}
          isDark={isDark}
        />
        <span className="font-mono text-[0.7rem]">
          {proposal.reasoning.operationalQuality}/100
        </span>
      </div>
    </button>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[0.62rem] uppercase tracking-[0.16em] opacity-70">
        {label}
      </span>
      <span className={mono ? "font-mono" : "font-semibold"}>{value}</span>
    </div>
  );
}

function QualityBar({ value, isDark }: { value: number; isDark: boolean }) {
  return (
    <div
      className={`relative h-1.5 flex-1 overflow-hidden rounded-full ${
        isDark ? "bg-white/10" : "bg-black/10"
      }`}
    >
      <div
        className="h-full bg-emerald-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function ProposalSchematic({
  proposal,
  isDark,
}: {
  proposal: EngineeringProposal;
  isDark: boolean;
}) {
  // Tiny SVG showing the carrefour topology + signal heads.
  // Uses the proposal's branches to determine which legs are drawn.
  const w = 200;
  const h = 110;
  const cx = w / 2;
  const cy = h / 2;
  const asphalt = isDark ? "#1a1d1f" : "#2a2a2a";
  const sidewalk = isDark ? "#06090a" : "#d8cda2";
  const paint = "#f5f5e8";
  const phaseFill =
    proposal.recommendedControlMode === "adaptive"
      ? "#1f7a3a"
      : "#3d6c3d";

  const branchByBearing = new Map(
    proposal.branches.map((b) => [b.bearing, b]),
  );
  const has = (bearing: "N" | "S" | "E" | "W") =>
    branchByBearing.has(bearing);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height={h}
      style={{ borderRadius: 6 }}
    >
      <rect x={0} y={0} width={w} height={h} fill={sidewalk} />
      {/* boulevard E-W */}
      {(has("E") || has("W")) && (
        <rect
          x={has("W") ? 0 : cx - 20}
          y={cy - 18}
          width={has("E") && has("W") ? w : has("W") ? cx + 20 : w - (cx - 20)}
          height={36}
          fill={asphalt}
        />
      )}
      {/* axe N-S */}
      {(has("N") || has("S")) && (
        <rect
          x={cx - 14}
          y={has("N") ? 0 : cy - 14}
          width={28}
          height={
            has("N") && has("S") ? h : has("N") ? cy + 14 : h - (cy - 14)
          }
          fill={asphalt}
        />
      )}
      {/* intersection square */}
      <rect
        x={cx - 14}
        y={cy - 18}
        width={28}
        height={36}
        fill={phaseFill}
        opacity={0.7}
      />
      {/* dashed centerlines */}
      {has("E") || has("W") ? (
        <line
          x1={0}
          y1={cy}
          x2={w}
          y2={cy}
          stroke={paint}
          strokeWidth={0.8}
          strokeDasharray="4 3"
        />
      ) : null}
      {has("N") || has("S") ? (
        <line
          x1={cx}
          y1={0}
          x2={cx}
          y2={h}
          stroke={paint}
          strokeWidth={0.8}
          strokeDasharray="4 3"
        />
      ) : null}
      {/* signal heads */}
      {proposal.signalGroups
        .filter((g) => g.kind === "vehicle")
        .slice(0, 6)
        .map((sg, idx) => {
          const pos = headPosition(sg.approachBearing, idx, cx, cy);
          return (
            <g key={sg.code}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={3.5}
                fill="#0a0a0a"
                stroke="#ffd64d"
                strokeWidth={0.6}
              />
              <text
                x={pos.x + 5}
                y={pos.y + 2}
                fontSize={5}
                fontFamily="monospace"
                fill={isDark ? "#ffd64d" : "#0a0a0a"}
              >
                {sg.code}
              </text>
            </g>
          );
        })}
      {/* center label */}
      <text
        x={cx}
        y={cy + 2}
        textAnchor="middle"
        fontSize={6}
        fontFamily="monospace"
        fill="#ffffff"
        fontWeight={700}
      >
        {proposal.phases.length}P
      </text>
    </svg>
  );
}

function headPosition(
  bearing: string,
  index: number,
  cx: number,
  cy: number,
): { x: number; y: number } {
  const offset = 16 + (index % 2) * 6;
  switch (bearing) {
    case "N":
      return { x: cx + 10, y: cy - offset };
    case "S":
      return { x: cx - 10, y: cy + offset };
    case "E":
      return { x: cx + offset + 6, y: cy + 10 };
    case "W":
      return { x: cx - offset - 6, y: cy - 10 };
    default:
      return { x: cx + offset, y: cy + offset };
  }
}

function ApprovalPanel({
  proposal,
  isDark,
  mutedClass,
  panelClass,
  intersectionCode,
  setIntersectionCode,
  controllerCode,
  setControllerCode,
  onApprove,
  approving,
}: {
  proposal: EngineeringProposal;
  isDark: boolean;
  mutedClass: string;
  panelClass: string;
  intersectionCode: string;
  setIntersectionCode: (v: string) => void;
  controllerCode: string;
  setControllerCode: (v: string) => void;
  onApprove: () => void;
  approving: boolean;
}) {
  return (
    <section className={`mt-4 rounded-[10px] border p-4 ${panelClass}`}>
      <div className="flex items-center justify-between">
        <div>
          <p
            className={`text-[0.6rem] font-semibold uppercase tracking-[0.22em] ${mutedClass}`}
          >
            Variante sélectionnée
          </p>
          <h2 className="mt-0.5 text-[1rem] font-semibold">{proposal.title}</h2>
        </div>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em] ${
            isDark
              ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
              : "border-emerald-700/30 bg-emerald-100 text-emerald-900"
          }`}
        >
          Qualité op. {proposal.reasoning.operationalQuality}/100
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <DetailBlock title="Raisonnement ingénierie" mutedClass={mutedClass}>
          <p className="text-[0.78rem] leading-relaxed">
            {proposal.reasoning.engineeringReasoning}
          </p>
        </DetailBlock>
        <DetailBlock title="Comportement attendu" mutedClass={mutedClass}>
          <p className="text-[0.78rem] leading-relaxed">
            {proposal.reasoning.expectedBehavior}
          </p>
        </DetailBlock>
        <DetailBlock title="Avantages" mutedClass={mutedClass}>
          <ul className="space-y-1 text-[0.74rem]">
            {proposal.reasoning.advantages.map((adv, idx) => (
              <li key={idx}>+ {adv}</li>
            ))}
          </ul>
        </DetailBlock>
        <DetailBlock title="Inconvénients" mutedClass={mutedClass}>
          <ul className="space-y-1 text-[0.74rem]">
            {proposal.reasoning.disadvantages.map((dis, idx) => (
              <li key={idx}>− {dis}</li>
            ))}
          </ul>
        </DetailBlock>

        <DetailBlock title="Phases" mutedClass={mutedClass}>
          <table className="w-full text-[0.7rem]">
            <thead className={mutedClass}>
              <tr>
                <th className="text-left font-semibold">#</th>
                <th className="text-left font-semibold">Nom</th>
                <th className="text-right font-semibold">Min g</th>
                <th className="text-right font-semibold">J</th>
                <th className="text-right font-semibold">AR</th>
              </tr>
            </thead>
            <tbody>
              {proposal.phases.map((ph) => (
                <tr key={ph.sequenceNumber}>
                  <td className="font-mono">{ph.sequenceNumber}</td>
                  <td className="truncate pr-1">{ph.name}</td>
                  <td className="text-right font-mono">{ph.minGreenSeconds}</td>
                  <td className="text-right font-mono">{ph.yellowSeconds}</td>
                  <td className="text-right font-mono">
                    {ph.redClearanceSeconds}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DetailBlock>

        <DetailBlock title="Capacité (Webster)" mutedClass={mutedClass}>
          <ul className="space-y-1 text-[0.74rem]">
            <li>
              Cycle nominal : <strong>{proposal.capacity.cycleSeconds} s</strong>
            </li>
            <li>
              Saturation HPM :{" "}
              <strong>
                {Math.round(proposal.capacity.saturationHPM * 100)} %
              </strong>
            </li>
            <li>
              Délai moyen estimé :{" "}
              <strong>{proposal.capacity.averageDelaySeconds} s</strong>
            </li>
            <li>
              File 95<sup>e</sup> :{" "}
              <strong>{proposal.capacity.queueLength95thMeters} m</strong>
            </li>
            <li>
              Réserve capacité :{" "}
              <strong>{proposal.capacity.capacityReservePercent} %</strong>
            </li>
          </ul>
        </DetailBlock>
      </div>

      {proposal.warnings.length > 0 ? (
        <div
          className={`mt-3 rounded-[6px] border px-3 py-2 text-[0.74rem] ${
            isDark
              ? "border-amber-400/40 bg-amber-500/5 text-amber-100"
              : "border-amber-700/30 bg-amber-50 text-amber-900"
          }`}
        >
          <p className="font-semibold uppercase tracking-[0.18em] text-[0.62rem]">
            Mises en garde
          </p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {proposal.warnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <label className="block">
          <span
            className={`mb-0.5 block text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${mutedClass}`}
          >
            Code carrefour (obligatoire)
          </span>
          <input
            type="text"
            value={intersectionCode}
            onChange={(e) => setIntersectionCode(e.target.value.toUpperCase())}
            placeholder="INT-RBA-001"
            className={`w-full rounded-[6px] border px-2.5 py-1.5 font-mono text-[0.78rem] outline-none ${
              isDark
                ? "border-white/15 bg-black/30"
                : "border-black/15 bg-white"
            }`}
          />
        </label>
        <label className="block">
          <span
            className={`mb-0.5 block text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${mutedClass}`}
          >
            Code contrôleur (optionnel)
          </span>
          <input
            type="text"
            value={controllerCode}
            onChange={(e) => setControllerCode(e.target.value.toUpperCase())}
            placeholder="CTRL-RBA-001 (auto si vide)"
            className={`w-full rounded-[6px] border px-2.5 py-1.5 font-mono text-[0.78rem] outline-none ${
              isDark
                ? "border-white/15 bg-black/30"
                : "border-black/15 bg-white"
            }`}
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={onApprove}
            disabled={approving || !intersectionCode.trim()}
            className={`w-full rounded-[6px] border px-3 py-2 text-[0.78rem] font-semibold transition ${
              isDark
                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
                : "border-emerald-700/30 bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
            } disabled:opacity-50`}
          >
            {approving ? "Approbation…" : "✓ Approuver et créer le carrefour"}
          </button>
        </div>
      </div>

      <p className={`mt-2 text-[0.65rem] ${mutedClass}`}>
        {
          "L'approbation crée un véritable carrefour STLS : intersection, contrôleur principal, phases, détecteurs et plans de feux. Édition ultérieure dans l'atelier d'ingénierie standard."
        }
      </p>
    </section>
  );
}

function DetailBlock({
  title,
  mutedClass,
  children,
}: {
  title: string;
  mutedClass: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p
        className={`mb-1 text-[0.6rem] font-semibold uppercase tracking-[0.22em] ${mutedClass}`}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------
// Study Panel — displayed between input and proposals
// ---------------------------------------------------------------

function StudyPanel({
  study,
  isDark,
  mutedClass,
  panelClass,
}: {
  study: IntersectionStudy;
  isDark: boolean;
  mutedClass: string;
  panelClass: string;
}) {
  const bandColor: Record<IntersectionStudy["complexityBand"], string> = {
    low: isDark ? "text-emerald-300" : "text-emerald-700",
    moderate: isDark ? "text-amber-300" : "text-amber-700",
    high: isDark ? "text-orange-300" : "text-orange-700",
    critical: isDark ? "text-red-300" : "text-red-700",
  };
  const exposureColor: Record<
    IntersectionStudy["pedestrianExposure"]["level"],
    string
  > = bandColor;

  return (
    <section className={`mb-4 rounded-[10px] border p-4 ${panelClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3 mb-3 border-current/10">
        <div>
          <p
            className={`text-[0.6rem] font-semibold uppercase tracking-[0.24em] ${mutedClass}`}
          >
            Étude intersection · {study.id}
          </p>
          <h2 className="mt-0.5 text-[1.05rem] font-semibold">
            {study.classificationLabel}
          </h2>
          <p className={`mt-1 max-w-2xl text-[0.78rem] ${mutedClass}`}>
            {study.classificationReason}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {study.mapContext ? (
              <ContextBadge
                label={study.mapContext.label}
                kind={study.mapContext.kind}
                confidence={study.mapContext.confidence}
                isDark={isDark}
              />
            ) : null}
            {study.confidence ? (
              <>
                <ConfidenceBadge
                  label="Géométrie"
                  value={study.confidence.geometry}
                  isDark={isDark}
                />
                <ConfidenceBadge
                  label="Classification"
                  value={study.confidence.classification}
                  isDark={isDark}
                />
                <ConfidenceBadge
                  label="Stratégie"
                  value={study.confidence.strategy}
                  isDark={isDark}
                />
              </>
            ) : null}
          </div>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <p
              className={`text-[0.58rem] font-semibold uppercase tracking-[0.22em] ${mutedClass}`}
            >
              Complexité
            </p>
            <p
              className={`mt-0.5 font-mono text-2xl font-semibold ${bandColor[study.complexityBand]}`}
            >
              {study.complexityScore}
              <span className={`text-[0.7rem] ${mutedClass}`}>/10</span>
            </p>
            <p
              className={`text-[0.62rem] uppercase tracking-[0.18em] ${bandColor[study.complexityBand]}`}
            >
              {study.complexityBand}
            </p>
          </div>
          <div>
            <p
              className={`text-[0.58rem] font-semibold uppercase tracking-[0.22em] ${mutedClass}`}
            >
              Conflits estimés
            </p>
            <p className="mt-0.5 font-mono text-2xl font-semibold">
              {study.estimatedConflictPoints.length}
            </p>
            <p
              className={`text-[0.62rem] uppercase tracking-[0.18em] ${mutedClass}`}
            >
              poids {study.totalConflictWeight.toFixed(1)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Geometry */}
        <div>
          <p
            className={`mb-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.22em] ${mutedClass}`}
          >
            Géométrie observée
          </p>
          <p className={`text-[0.66rem] ${mutedClass}`}>
            Source : {study.observedGeometry.source}
          </p>
          <table className="mt-2 w-full text-[0.74rem]">
            <thead>
              <tr className={mutedClass}>
                <th className="text-left font-semibold">Branche</th>
                <th className="text-left font-semibold">Classe</th>
                <th className="text-right font-semibold">Voies</th>
                <th className="text-right font-semibold">Larg.</th>
              </tr>
            </thead>
            <tbody>
              {study.observedGeometry.approaches.map((a, idx) => (
                <tr key={idx}>
                  <td className="font-mono">
                    {a.bearing} ({a.bearingDegrees.toFixed(0)}°)
                  </td>
                  <td>{a.highwayClass}</td>
                  <td className="text-right font-mono">{a.laneCount}</td>
                  <td className="text-right font-mono">
                    {a.widthMeters.toFixed(1)} m
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {study.dominantAxis ? (
            <p className={`mt-2 text-[0.7rem] ${mutedClass}`}>
              <span className="font-semibold">Axe dominant :</span>{" "}
              {study.dominantAxis.bearings.join(" / ")} — {study.dominantAxis.reason}
            </p>
          ) : null}
        </div>

        {/* Pedestrian + Conflicts */}
        <div>
          <p
            className={`mb-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.22em] ${mutedClass}`}
          >
            Exposition piétonne
          </p>
          <p
            className={`font-mono text-[0.86rem] font-semibold ${exposureColor[study.pedestrianExposure.level]}`}
          >
            {study.pedestrianExposure.score}/10 · {study.pedestrianExposure.level}
          </p>
          <ul className="mt-1 space-y-0.5 text-[0.72rem]">
            {study.pedestrianExposure.drivers.map((d, idx) => (
              <li key={idx}>• {d}</li>
            ))}
          </ul>

          <p
            className={`mt-3 mb-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.22em] ${mutedClass}`}
          >
            Points de conflit
          </p>
          <ConflictHeatmap
            conflicts={study.estimatedConflictPoints}
            approaches={study.observedGeometry.approaches}
            hasRoundabout={study.observedGeometry.hasRoundabout}
            isDark={isDark}
          />
        </div>

        {/* Constraints */}
        <div>
          <p
            className={`mb-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.22em] ${mutedClass}`}
          >
            Contraintes ingénierie · {study.constraints.length}
          </p>
          {study.constraints.length === 0 ? (
            <p className={`text-[0.72rem] ${mutedClass}`}>
              Aucune contrainte critique détectée.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {study.constraints.map((c, idx) => (
                <li
                  key={idx}
                  className={`rounded-[6px] border px-2.5 py-1.5 text-[0.72rem] ${
                    c.severity === "critical"
                      ? isDark
                        ? "border-red-400/40 bg-red-500/5"
                        : "border-red-700/30 bg-red-50"
                      : c.severity === "warning"
                        ? isDark
                          ? "border-amber-400/40 bg-amber-500/5"
                          : "border-amber-700/30 bg-amber-50"
                        : isDark
                          ? "border-white/10 bg-white/5"
                          : "border-black/10 bg-black/5"
                  }`}
                >
                  <p className="font-semibold">{c.title}</p>
                  <p className={`mt-0.5 ${mutedClass}`}>{c.description}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className={`mt-3 border-t pt-2 text-[0.66rem] ${mutedClass} border-current/10`}>
        Stratégies recommandées par l’analyse :{" "}
        <span className="font-mono">
          {study.recommendedVariantCodes.join(" · ")}
        </span>
      </p>
    </section>
  );
}

// Real-bearing geometry overlay : approaches are drawn at their
// actual bearing degrees (not synthetic N/E/S/W slots), widths scaled
// by lane count, and conflict points overlaid at their stored
// positions. Reads much closer to a top-down map than the previous
// symbolic cross.
function ConflictHeatmap({
  conflicts,
  approaches,
  hasRoundabout,
  isDark,
}: {
  conflicts: IntersectionStudy["estimatedConflictPoints"];
  approaches: IntersectionStudy["observedGeometry"]["approaches"];
  hasRoundabout?: boolean;
  isDark: boolean;
}) {
  const maxWeight = Math.max(1, ...conflicts.map((c) => c.weight));
  const cx = 50;
  const cy = 50;
  const radius = 38;
  return (
    <div className="relative" style={{ width: "100%", paddingTop: "100%" }}>
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <rect
          x={0}
          y={0}
          width={100}
          height={100}
          fill={isDark ? "#0a0f0b" : "#f6f5ed"}
        />
        {/* Approach strips drawn at real bearings */}
        {approaches.map((a, idx) => {
          const rad = (a.bearingDegrees * Math.PI) / 180;
          // SVG y axis is inverted (north = -y)
          const dx = Math.sin(rad);
          const dy = -Math.cos(rad);
          const x2 = cx + dx * radius;
          const y2 = cy + dy * radius;
          // Strip width proportional to lane count
          const stripWidth = 4 + a.laneCount * 2;
          const perpX = -dy;
          const perpY = dx;
          const halfW = stripWidth / 2;
          const points = [
            `${cx - perpX * halfW},${cy - perpY * halfW}`,
            `${cx + perpX * halfW},${cy + perpY * halfW}`,
            `${x2 + perpX * halfW},${y2 + perpY * halfW}`,
            `${x2 - perpX * halfW},${y2 - perpY * halfW}`,
          ].join(" ");
          const stripColor = isDark ? "#1f1f1f" : "#3a3a3a";
          return (
            <g key={`approach-${idx}`}>
              <polygon points={points} fill={stripColor} />
              {/* Bearing label */}
              <text
                x={cx + dx * (radius + 6)}
                y={cy + dy * (radius + 6) + 2}
                textAnchor="middle"
                fontSize={5}
                fontFamily="monospace"
                fill={isDark ? "#ffd64d" : "#5a4218"}
                fontWeight={700}
              >
                {a.bearing}
              </text>
              {/* Highway class chip */}
              <text
                x={cx + dx * (radius - 4)}
                y={cy + dy * (radius - 4) + 1.5}
                textAnchor="middle"
                fontSize={3}
                fontFamily="monospace"
                fill={isDark ? "#dfe8da" : "#1b2322"}
              >
                {a.highwayClass.slice(0, 4)}
              </text>
            </g>
          );
        })}

        {/* Central plate (roundabout = ring + island, signalized = square) */}
        {hasRoundabout ? (
          <>
            <circle
              cx={cx}
              cy={cy}
              r={9}
              fill={isDark ? "#3a3a3a" : "#4a4a4a"}
            />
            <circle
              cx={cx}
              cy={cy}
              r={4}
              fill={isDark ? "#1a2a1f" : "#cabb89"}
            />
          </>
        ) : (
          <rect
            x={cx - 6}
            y={cy - 6}
            width={12}
            height={12}
            fill={isDark ? "#3a3a3a" : "#4a4a4a"}
          />
        )}

        {/* Conflict points */}
        {conflicts.map((c) => (
          <g key={c.id}>
            <circle
              cx={c.x}
              cy={c.y}
              r={2.5 + (c.weight / maxWeight) * 3}
              fill="#d22a2a"
              opacity={0.5}
            />
            <circle cx={c.x} cy={c.y} r={1.2} fill="#ffd64d" />
          </g>
        ))}

        {/* North indicator */}
        <g transform={`translate(${100 - 8} ${8})`}>
          <circle cx={0} cy={0} r={6} fill={isDark ? "#07100d" : "#ffffff"} stroke="#0a0a0a" strokeWidth={0.4} />
          <polygon points="0,-4 -2,2 2,2" fill="#0a0a0a" />
          <text x={0} y={-7} textAnchor="middle" fontSize={4} fontFamily="monospace" fontWeight={700} fill={isDark ? "#dfe8da" : "#0a0a0a"}>
            N
          </text>
        </g>
      </svg>
    </div>
  );
}

function ContextBadge({
  label,
  kind,
  confidence,
  isDark,
}: {
  label: string;
  kind: string;
  confidence: number;
  isDark: boolean;
}) {
  const kindTone: Record<string, string> = {
    residential: isDark ? "text-emerald-200" : "text-emerald-700",
    commercial: isDark ? "text-amber-200" : "text-amber-700",
    industrial: isDark ? "text-orange-200" : "text-orange-700",
    "mixed-urban": isDark ? "text-cyan-200" : "text-cyan-700",
    boulevard: isDark ? "text-sky-200" : "text-sky-700",
    rural: isDark ? "text-lime-200" : "text-lime-700",
    "logistics-corridor": isDark ? "text-red-200" : "text-red-700",
    institutional: isDark ? "text-violet-200" : "text-violet-700",
    unknown: isDark ? "text-stone-300" : "text-stone-600",
  };
  const tone = kindTone[kind] ?? kindTone.unknown;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em] ${
        isDark
          ? "border-white/15 bg-white/5"
          : "border-black/10 bg-black/5"
      } ${tone}`}
      title={`Confiance ${Math.round(confidence * 100)}%`}
    >
      <span aria-hidden>📍</span>
      {label}
      <span className="font-mono opacity-70">
        {Math.round(confidence * 100)}%
      </span>
    </span>
  );
}

function ConfidenceBadge({
  label,
  value,
  isDark,
}: {
  label: string;
  value: number;
  isDark: boolean;
}) {
  const pct = Math.round(value * 100);
  const tone =
    pct >= 80
      ? isDark
        ? "text-emerald-300 border-emerald-400/40"
        : "text-emerald-700 border-emerald-700/40"
      : pct >= 60
        ? isDark
          ? "text-amber-300 border-amber-400/40"
          : "text-amber-700 border-amber-700/40"
        : isDark
          ? "text-orange-300 border-orange-400/40"
          : "text-orange-700 border-orange-700/40";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.18em] ${tone}`}
      title={
        pct < 60
          ? "Confiance limitée — données estimées"
          : pct < 80
            ? "Confiance modérée"
            : "Confiance élevée"
      }
    >
      {label}
      <span className="font-mono opacity-80">{pct}%</span>
    </span>
  );
}

// =====================================================================
// Engineering map overlays — Phase A of the Geometry Interpretation
// Layer. Rendered on top of the satellite image only after a study
// exists. Visual language is intentionally CAD-inspired (muted
// gold/cyan/violet) rather than playful map colours.
// =====================================================================

const OVERLAY_COLORS = {
  centerlineDominant: "#f5c452",
  centerline: "#a9a08a",
  lane: "#c8d4d8",
  stopLine: "#5fd0d4",
  pedCrossing: "#ffffff",
  movement: "#7ad9b3",
  signalVehicle: "#34d399",
  signalPedestrian: "#60a5fa",
  detectorStop: "#a78bfa",
  detectorQueue: "#7c3aed",
  detectorAdvance: "#4c1d95",
  detectorButton: "#fb923c",
  conflict: "#f97316",
} as const;

function EngineeringOverlayLayer({
  interpretation,
  toggles,
}: {
  interpretation: GeometryInterpretation;
  toggles: Record<OverlayLayerId, boolean>;
}) {
  return (
    <>
      {toggles.centerlines
        ? interpretation.centerlines.map((cl) => (
            <PolylineF
              key={cl.id}
              path={cl.path}
              options={{
                strokeColor: cl.isDominant
                  ? OVERLAY_COLORS.centerlineDominant
                  : OVERLAY_COLORS.centerline,
                strokeOpacity: cl.isDominant ? 0.95 : 0.75,
                strokeWeight: cl.isDominant ? 2.5 : 1.5,
                clickable: false,
                zIndex: 5,
              }}
            />
          ))
        : null}

      {toggles.lanes
        ? interpretation.lanes.map((ln) => (
            <PolylineF
              key={ln.id}
              path={ln.path}
              options={{
                strokeColor: OVERLAY_COLORS.lane,
                strokeOpacity: 0.0, // dashed via icons below
                clickable: false,
                zIndex: 4,
                icons: [
                  {
                    icon: {
                      path: "M 0,-1 0,1",
                      strokeOpacity: 0.7,
                      scale: 2,
                      strokeColor: OVERLAY_COLORS.lane,
                    },
                    offset: "0",
                    repeat: "8px",
                  },
                ],
              }}
            />
          ))
        : null}

      {toggles["stop-lines"]
        ? interpretation.stopLines.map((sl) => (
            <PolylineF
              key={sl.id}
              path={sl.path}
              options={{
                strokeColor: OVERLAY_COLORS.stopLine,
                strokeOpacity: 0.9,
                strokeWeight: 3,
                clickable: false,
                zIndex: 7,
              }}
            />
          ))
        : null}

      {toggles.pedestrians
        ? interpretation.pedestrianCrossings.map((pc) => (
            <PolylineF
              key={pc.id}
              path={pc.path}
              options={{
                strokeColor: OVERLAY_COLORS.pedCrossing,
                strokeOpacity: 0.0,
                clickable: false,
                zIndex: 6,
                icons: [
                  {
                    icon: {
                      path: "M 0,-3 0,3",
                      strokeOpacity: 0.85,
                      scale: 2,
                      strokeColor: OVERLAY_COLORS.pedCrossing,
                    },
                    offset: "0",
                    repeat: "5px",
                  },
                ],
              }}
            />
          ))
        : null}

      {toggles.movements
        ? interpretation.movements.map((mv) => (
            <PolylineF
              key={mv.id}
              path={mv.path}
              options={{
                strokeColor: OVERLAY_COLORS.movement,
                strokeOpacity: 0.75,
                strokeWeight: 1.8,
                clickable: false,
                zIndex: 6,
              }}
            />
          ))
        : null}

      {toggles.detectors
        ? interpretation.detectors.map((d) => {
            const color =
              d.role === "stop-line"
                ? OVERLAY_COLORS.detectorStop
                : d.role === "queue"
                  ? OVERLAY_COLORS.detectorQueue
                  : d.role === "advance"
                    ? OVERLAY_COLORS.detectorAdvance
                    : OVERLAY_COLORS.detectorButton;
            return (
              <CircleF
                key={d.id}
                center={d.position}
                radius={d.radiusMeters}
                options={{
                  strokeColor: color,
                  strokeOpacity: 0.95,
                  strokeWeight: 2,
                  fillColor: color,
                  fillOpacity: 0.25,
                  clickable: false,
                  zIndex: 8,
                }}
              />
            );
          })
        : null}

      {toggles["signal-heads"]
        ? interpretation.signalHeads.map((sh) => (
            <CircleF
              key={sh.id}
              center={sh.position}
              radius={1.1}
              options={{
                strokeColor:
                  sh.kind === "pedestrian"
                    ? OVERLAY_COLORS.signalPedestrian
                    : OVERLAY_COLORS.signalVehicle,
                strokeOpacity: 0.95,
                strokeWeight: 2,
                fillColor:
                  sh.kind === "pedestrian"
                    ? OVERLAY_COLORS.signalPedestrian
                    : OVERLAY_COLORS.signalVehicle,
                fillOpacity: 0.5,
                clickable: false,
                zIndex: 9,
              }}
            />
          ))
        : null}

      {toggles.conflicts
        ? interpretation.conflictHotspots.map((cf) => (
            <CircleF
              key={cf.id}
              center={cf.position}
              radius={Math.max(1.5, cf.weight * 1.2)}
              options={{
                strokeColor: OVERLAY_COLORS.conflict,
                strokeOpacity: 0.7,
                strokeWeight: 1,
                fillColor: OVERLAY_COLORS.conflict,
                fillOpacity: 0.22,
                clickable: false,
                zIndex: 7,
              }}
            />
          ))
        : null}
    </>
  );
}

const OVERLAY_LAYER_DEFS: Array<{
  id: OverlayLayerId;
  label: string;
  swatch: string;
}> = [
  { id: "centerlines", label: "Axes", swatch: OVERLAY_COLORS.centerlineDominant },
  { id: "lanes", label: "Voies", swatch: OVERLAY_COLORS.lane },
  { id: "stop-lines", label: "Lignes d'arrêt", swatch: OVERLAY_COLORS.stopLine },
  { id: "movements", label: "Mouvements", swatch: OVERLAY_COLORS.movement },
  { id: "pedestrians", label: "Piétons", swatch: OVERLAY_COLORS.pedCrossing },
  { id: "detectors", label: "Détecteurs", swatch: OVERLAY_COLORS.detectorQueue },
  {
    id: "signal-heads",
    label: "Têtes de feux",
    swatch: OVERLAY_COLORS.signalVehicle,
  },
  { id: "conflicts", label: "Conflits", swatch: OVERLAY_COLORS.conflict },
];

function OverlayLayerPanel({
  toggles,
  onToggle,
  isDark,
}: {
  toggles: Record<OverlayLayerId, boolean>;
  onToggle: (id: OverlayLayerId) => void;
  isDark: boolean;
}) {
  const shell = isDark
    ? "border-white/15 bg-black/60 text-[#dfe8da]"
    : "border-black/10 bg-white/90 text-[#1b2322]";
  return (
    <div
      className={`absolute right-3 top-3 w-[180px] rounded-[6px] border px-2.5 py-2 text-[0.7rem] backdrop-blur-sm ${shell}`}
    >
      <p className="mb-1.5 font-semibold uppercase tracking-[0.2em] text-[0.58rem] opacity-80">
        Couches d&apos;ingénierie
      </p>
      <ul className="space-y-0.5">
        {OVERLAY_LAYER_DEFS.map((layer) => (
          <li key={layer.id}>
            <button
              type="button"
              onClick={() => onToggle(layer.id)}
              className="flex w-full items-center gap-1.5 rounded-[4px] px-1 py-0.5 text-left hover:bg-white/10"
            >
              <span
                aria-hidden
                className="inline-block h-2 w-2 shrink-0 rounded-sm"
                style={{
                  background: toggles[layer.id] ? layer.swatch : "transparent",
                  border: `1px solid ${layer.swatch}`,
                }}
              />
              <span className="flex-1 truncate">{layer.label}</span>
              <span className="font-mono text-[0.6rem] opacity-70">
                {toggles[layer.id] ? "ON" : "OFF"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface StudyPanelErrorBoundaryProps {
  children: ReactNode;
  isDark: boolean;
  mutedClass: string;
}

class StudyPanelErrorBoundary extends Component<
  StudyPanelErrorBoundaryProps,
  { hasError: boolean }
> {
  constructor(props: StudyPanelErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    if (typeof console !== "undefined") {
      console.warn(
        "[ai-engineering] StudyPanel render failed, falling back to safe view:",
        error,
      );
    }
  }

  render() {
    if (this.state.hasError) {
      const { isDark, mutedClass } = this.props;
      return (
        <div
          className={`mb-3 rounded-[8px] border px-3 py-2.5 text-[0.78rem] ${
            isDark
              ? "border-amber-400/40 bg-amber-500/10"
              : "border-amber-700/30 bg-amber-50"
          }`}
        >
          <p className="font-semibold">
            Affichage de l&apos;étude en mode dégradé
          </p>
          <p className={`mt-0.5 text-[0.72rem] ${mutedClass}`}>
            Certaines informations de l&apos;analyse n&apos;ont pas le format
            attendu. Vous pouvez générer les propositions à partir de cette
            étude, ou relancer l&apos;analyse pour récupérer l&apos;affichage
            complet.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

function AnalysisPipelinePanel({
  stages,
  isDark,
  mutedClass,
}: {
  stages: AnalysisStage[];
  isDark: boolean;
  mutedClass: string;
}) {
  const dotFor = (status: AnalysisStage["status"]) => {
    switch (status) {
      case "ok":
        return isDark ? "bg-emerald-400" : "bg-emerald-600";
      case "running":
        return "bg-sky-400 animate-pulse";
      case "fallback":
        return isDark ? "bg-amber-400" : "bg-amber-600";
      case "failed":
        return isDark ? "bg-red-400" : "bg-red-600";
      default:
        return isDark ? "bg-white/20" : "bg-black/15";
    }
  };
  const labelFor = (status: AnalysisStage["status"]) => {
    switch (status) {
      case "ok":
        return "OK";
      case "running":
        return "EN COURS";
      case "fallback":
        return "DÉGRADÉ";
      case "failed":
        return "ÉCHEC";
      default:
        return "EN ATTENTE";
    }
  };
  return (
    <div
      className={`mb-3 rounded-[8px] border px-3 py-2.5 ${
        isDark ? "border-white/10 bg-white/[0.03]" : "border-black/10 bg-black/[0.02]"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <p
          className={`text-[0.6rem] font-semibold uppercase tracking-[0.22em] ${mutedClass}`}
        >
          Pipeline d&apos;analyse · 5 étapes
        </p>
      </div>
      <ol className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-5">
        {stages.map((s) => (
          <li
            key={s.id}
            className={`rounded-[6px] border px-2 py-1.5 ${
              isDark ? "border-white/10" : "border-black/10"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dotFor(s.status)}`}
              />
              <span className="truncate text-[0.7rem] font-semibold">
                {s.label}
              </span>
            </div>
            <p
              className={`mt-0.5 truncate font-mono text-[0.6rem] uppercase tracking-[0.18em] ${mutedClass}`}
              title={s.message}
            >
              {labelFor(s.status)}
              {s.message ? ` · ${s.message}` : ""}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function AnalysisNoticesPanel({
  notices,
  isDark,
  mutedClass,
  onDismiss,
}: {
  notices: AnalysisNotice[];
  isDark: boolean;
  mutedClass: string;
  onDismiss: (id: string) => void;
}) {
  const tone = (sev: AnalysisNotice["severity"]) => {
    if (sev === "critical") {
      return isDark
        ? "border-red-400/40 bg-red-500/10"
        : "border-red-700/30 bg-red-50";
    }
    if (sev === "warning") {
      return isDark
        ? "border-amber-400/40 bg-amber-500/10"
        : "border-amber-700/30 bg-amber-50";
    }
    return isDark
      ? "border-sky-400/30 bg-sky-500/5"
      : "border-sky-700/20 bg-sky-50";
  };
  return (
    <div className="mb-3 space-y-1.5">
      {notices.map((n) => (
        <div
          key={n.id}
          className={`flex items-start gap-2 rounded-[6px] border px-3 py-2 text-[0.78rem] ${tone(n.severity)}`}
        >
          <div className="flex-1">
            <p className="font-semibold">{n.title}</p>
            <p className={`mt-0.5 text-[0.72rem] ${mutedClass}`}>
              {n.description}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onDismiss(n.id)}
            className={`shrink-0 rounded-[4px] px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] ${mutedClass} hover:opacity-80`}
            aria-label="Masquer la notification"
          >
            Fermer
          </button>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ mutedClass }: { mutedClass: string }) {
  return (
    <div className="grid h-full place-items-center px-10 text-center">
      <div className="max-w-md">
        <p
          className={`text-[0.62rem] font-semibold uppercase tracking-[0.3em] ${mutedClass}`}
        >
          AI Engineering Assistant
        </p>
        <h2 className="mt-3 text-[1rem] font-semibold">
          Renseignez le carrefour cible et lancez l’analyse
        </h2>
        <p className={`mt-2 text-[0.78rem] ${mutedClass}`}>
          Pipeline en 3 étapes :{" "}
          <strong>OSM Overpass</strong> → analyse géométrie /
          classification / contraintes →{" "}
          <strong>propositions curées</strong> (2–4 variantes au lieu de 6
          génériques). L’analyse détecte les angles obliques, l’exposition
          piétonne, les conflits multiples et les besoins de coordination
          corridor avant de proposer une stratégie.
        </p>
      </div>
    </div>
  );
}
