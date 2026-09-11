"use client";

import clsx from "clsx";
import {
  GoogleMap,
  MarkerF,
  RectangleF,
  useJsApiLoader,
} from "@react-google-maps/api";
import { useCallback, useMemo, useRef, useState } from "react";

import { buildSampleCivilPlan } from "@/lib/civil-plan-samples";
import {
  GOOGLE_MAPS_LIBRARIES,
  GOOGLE_MAPS_LOADER_ID,
  GOOGLE_MAPS_REGION,
} from "@/lib/google-maps-loader";
import {
  boundsFromBaseLayers,
  parseBasePlanFile,
  type ImportContext,
} from "@/lib/base-plan-import";
import { fetchOsmBaseLayers } from "@/lib/osm-import";
import { useStudioDispatch } from "@/components/studio/state/store";
import type { IntersectionConfig } from "@/components/studio/state/types";
import type {
  BaseLayerFeature,
  BaseLayerKind,
  BasePlan,
  BasePlanFileMeta,
  BasePlanSource,
  CivilPlan,
} from "@/types/civil-plan";

/**
 * Locate-and-import wizard.
 *
 * The Plan workflow starts here: the operator picks the real place on
 * Google Map, defines the export/import extent, optionally rotates the
 * plan frame, then imports the topographic base from TopoExport (or
 * any SVG / DXF / GeoJSON export).  The wizard writes the result back
 * to the Studio store as `civilPlan.basePlan` + `civilPlan.baseLayers`
 * so the renderer, AutoCAD page and dossiers all consume real geometry
 * instead of a template.
 */

interface LocateImportWizardProps {
  config: IntersectionConfig;
  onFallbackToTemplate: () => void;
}

type Step = "locate" | "source" | "import";

const DEFAULT_EXTENT_METRES = 120;
const DEFAULT_ROTATION_DEG = 0;

const SOURCE_OPTIONS: Array<{
  id: BasePlanSource;
  label: string;
  description: string;
  acceptsFile: boolean;
  accept?: string;
}> = [
  {
    id: "osm",
    label: "OpenStreetMap (live)",
    description:
      "Fetch the real road centrelines from OpenStreetMap around this intersection's GPS.  No file upload — one click queries the Overpass API and projects the geometry to local metres.",
    acceptsFile: false,
  },
  {
    id: "topoexport",
    label: "TopoExport",
    description:
      "Upload the SVG / DXF / GeoJSON exported from TopoExport for this intersection.",
    acceptsFile: true,
    accept: ".svg,.dxf,.json,.geojson",
  },
  {
    id: "dxf",
    label: "DXF",
    description:
      "AutoCAD/BRICSCAD export.  Parses LINE and LWPOLYLINE entities by layer.",
    acceptsFile: true,
    accept: ".dxf",
  },
  {
    id: "svg",
    label: "SVG",
    description:
      "Vector export from any CAD / GIS tool.  Layer hints read from `class` or `data-layer` attributes.",
    acceptsFile: true,
    accept: ".svg",
  },
  {
    id: "geojson",
    label: "GeoJSON",
    description:
      "LineString / Polygon features in WGS84.  Projected onto the local tangent plane at the map centre.",
    acceptsFile: true,
    accept: ".json,.geojson",
  },
  {
    id: "template",
    label: "Template (fallback only)",
    description:
      "No real base available — seed the GroupéRyX template so design can continue.  Mark this step as template-sourced in the audit trail.",
    acceptsFile: false,
  },
];

const LAYER_LABELS: Record<BaseLayerKind, string> = {
  roads: "Roads",
  medians: "Medians",
  lane_edges: "Lane edges",
  crosswalks: "Crosswalks",
  parcels: "Parcels",
  buildings: "Buildings",
  contours: "Contours",
};

export function LocateImportWizard({
  config,
  onFallbackToTemplate,
}: LocateImportWizardProps) {
  const dispatch = useStudioDispatch();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    id: GOOGLE_MAPS_LOADER_ID,
    libraries: GOOGLE_MAPS_LIBRARIES,
    region: GOOGLE_MAPS_REGION,
  });
  const mapRef = useRef<google.maps.Map | null>(null);

  const [step, setStep] = useState<Step>("locate");
  const [mapCenter, setMapCenter] = useState(config.identity.location);
  const [mapZoom, setMapZoom] = useState(19);
  const [extentMetres, setExtentMetres] = useState(DEFAULT_EXTENT_METRES);
  const [rotationDeg, setRotationDeg] = useState(DEFAULT_ROTATION_DEG);
  const [source, setSource] = useState<BasePlanSource>("topoexport");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importedFiles, setImportedFiles] = useState<BasePlanFileMeta[]>([]);
  const [importedFeatures, setImportedFeatures] = useState<BaseLayerFeature[]>(
    [],
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [geocoding, setGeocoding] = useState(false);

  // Defensive: when `config.identity.location` is incomplete (a half-
  // populated record from upstream) `mapCenter` can carry NaN, which
  // then propagates to setCenter / setPosition / setBounds and trips
  // the Google Maps SDK. Fall back to Casablanca centre and clamp the
  // extent so every map call sees finite numbers.
  const safeMapCenter = useMemo(() => {
    const lat = Number(mapCenter?.lat);
    const lng = Number(mapCenter?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    return { lat: 33.5731, lng: -7.5898 };
  }, [mapCenter]);

  const rectangleBounds = useMemo(() => {
    const extent = Number.isFinite(extentMetres)
      ? extentMetres
      : DEFAULT_EXTENT_METRES;
    const latDelta = extent / 2 / 111_320;
    const lngDelta =
      extent /
      2 /
      (111_320 * Math.cos((safeMapCenter.lat * Math.PI) / 180));
    return {
      north: safeMapCenter.lat + latDelta,
      south: safeMapCenter.lat - latDelta,
      east: safeMapCenter.lng + lngDelta,
      west: safeMapCenter.lng - lngDelta,
    };
  }, [extentMetres, safeMapCenter]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    if (typeof google === "undefined" || !google.maps?.Geocoder) {
      setError("Google Maps has not loaded yet — wait a second and retry.");
      return;
    }
    setGeocoding(true);
    setError(null);
    try {
      const geocoder = new google.maps.Geocoder();
      const response = await geocoder.geocode({ address: searchQuery });
      const first = response.results[0];
      if (!first) {
        setError("No result for this address.");
        return;
      }
      const loc = first.geometry.location;
      setMapCenter({ lat: loc.lat(), lng: loc.lng() });
      setMapZoom(20);
      mapRef.current?.panTo({ lat: loc.lat(), lng: loc.lng() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Geocoding failed");
    } finally {
      setGeocoding(false);
    }
  }, [searchQuery]);

  const handleFileImport = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      setWarnings([]);
      try {
        const ctx: ImportContext = {
          mapCenter,
          rotationRadians: (rotationDeg * Math.PI) / 180,
          declaredSource: source,
        };
        const result = await parseBasePlanFile(file, ctx);
        setImportedFeatures((current) => [...current, ...result.features]);
        setImportedFiles((current) => [...current, result.fileMeta]);
        setWarnings(result.warnings);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Import failed");
      } finally {
        setBusy(false);
      }
    },
    [mapCenter, rotationDeg, source],
  );

  const handleOsmFetch = useCallback(async () => {
    setBusy(true);
    setError(null);
    setWarnings([]);
    try {
      const result = await fetchOsmBaseLayers(mapCenter.lat, mapCenter.lng, {
        radiusMetres: extentMetres / 2 + 20,
      });
      if (result.features.length === 0) {
        setError(
          "OpenStreetMap returned no road geometry within the search radius.",
        );
        return;
      }
      setImportedFeatures((current) => [...current, ...result.features]);
      setImportedFiles((current) => [
        ...current,
        {
          name: `osm-${mapCenter.lat.toFixed(5)}_${mapCenter.lng.toFixed(5)}.osm.json`,
          sizeBytes: 0,
          mime: "application/json",
          layer: "roads",
          featureCount: result.features.length,
        },
      ]);
      const note: string[] = [];
      if (result.streetNames.length > 0) {
        note.push(`Streets detected: ${result.streetNames.join(", ")}.`);
      }
      if (result.hasRoundabout) {
        note.push("Roundabout geometry present (junction=roundabout).");
      }
      if (note.length > 0) setWarnings(note);
    } catch (err) {
      setError(
        err instanceof Error
          ? `OSM fetch failed: ${err.message}`
          : "OSM fetch failed",
      );
    } finally {
      setBusy(false);
    }
  }, [mapCenter, extentMetres]);

  const handleCommit = useCallback(() => {
    if (source === "template") {
      // Seed template, but tag basePlan.source = "template" for audit.
      const plan = buildSampleCivilPlan(config.id, config.identity.name);
      plan.basePlan = {
        source: "template",
        mapCenter,
        mapZoom,
        importExtent: {
          widthMetres: extentMetres,
          heightMetres: extentMetres,
        },
        importRotation: (rotationDeg * Math.PI) / 180,
        importedAt: new Date().toISOString(),
        note: note.trim() || undefined,
      };
      plan.rotation = (rotationDeg * Math.PI) / 180;
      dispatch({ type: "setCivilPlan", intersectionId: config.id, plan });
      onFallbackToTemplate();
      return;
    }

    if (importedFeatures.length === 0) {
      setError("Import at least one file before continuing.");
      return;
    }

    const basePlan: BasePlan = {
      source,
      mapCenter,
      mapZoom,
      importExtent: {
        widthMetres: extentMetres,
        heightMetres: extentMetres,
      },
      importRotation: (rotationDeg * Math.PI) / 180,
      importedFiles,
      importedAt: new Date().toISOString(),
      note: note.trim() || undefined,
    };

    // Start from either an empty civilPlan (so the renderer has
    // something to draw) or the template — but keep the imported base
    // as the visual ground truth.  The engineering layers start empty;
    // operator edits them in the Plan tab afterwards.
    const template = buildSampleCivilPlan(config.id, config.identity.name);
    const bounds =
      boundsFromBaseLayers(importedFeatures, 5) ?? template.bounds;
    const plan: CivilPlan = {
      ...template,
      // Strip template engineering geometry so the operator is not
      // editing on top of fake supports/loops.  They'll add the real
      // layer in the Plan tab.
      supports: [],
      loops: [],
      chambers: [],
      cableRuns: [],
      crosswalks: [],
      stopLines: [],
      arms: [],
      bounds,
      rotation: (rotationDeg * Math.PI) / 180,
      basePlan,
      baseLayers: importedFeatures,
    };
    dispatch({ type: "setCivilPlan", intersectionId: config.id, plan });
    onFallbackToTemplate();
  }, [
    config.id,
    config.identity.name,
    dispatch,
    extentMetres,
    importedFeatures,
    importedFiles,
    mapCenter,
    mapZoom,
    note,
    onFallbackToTemplate,
    rotationDeg,
    source,
  ]);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-y-auto">
      <header className="flex items-start justify-between gap-4 border-b border-stroke-0 px-4 py-3">
        <div>
          <p className="text-[0.58rem] font-semibold uppercase tracking-[0.24em] text-accent-ink">
            Step 0 · Locate &amp; import base plan
          </p>
          <h2 className="mt-0.5 text-[1rem] font-semibold text-ink-1">
            Start from real geometry
          </h2>
          <p className="mt-0.5 text-[0.72rem] text-ink-2">
            Identify the intersection on the map, then import a topographic
            or vector base (TopoExport / DXF / SVG / GeoJSON).  Template
            fallback is available only when no real source is accessible.
          </p>
        </div>
        <nav className="flex items-center gap-1 text-[0.6rem] font-semibold uppercase tracking-[0.22em]">
          {(["locate", "source", "import"] as Step[]).map((id, idx) => (
            <span
              key={id}
              className={clsx(
                "flex items-center gap-1 rounded-full px-2 py-1",
                id === step
                  ? "bg-accent-surface text-accent-ink"
                  : "text-ink-3",
              )}
            >
              <span
                className={clsx(
                  "grid h-4 w-4 place-items-center rounded-full border",
                  id === step
                    ? "border-accent-stroke bg-accent-surface"
                    : "border-stroke-1 text-ink-3",
                )}
              >
                {idx + 1}
              </span>
              {id}
            </span>
          ))}
        </nav>
      </header>

      {error ? (
        <div className="mx-4 mt-3 rounded-[6px] border border-danger-stroke bg-danger-surface px-3 py-2 text-[0.76rem] text-danger-ink">
          {error}
        </div>
      ) : null}

      {step === "locate" ? (
        <LocateStep
          apiKey={apiKey}
          isLoaded={isLoaded}
          loadError={loadError}
          mapCenter={mapCenter}
          setMapCenter={setMapCenter}
          mapZoom={mapZoom}
          setMapZoom={setMapZoom}
          extentMetres={extentMetres}
          setExtentMetres={setExtentMetres}
          rotationDeg={rotationDeg}
          setRotationDeg={setRotationDeg}
          rectangleBounds={rectangleBounds}
          mapRef={mapRef}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          handleSearch={handleSearch}
          geocoding={geocoding}
          onContinue={() => setStep("source")}
        />
      ) : null}

      {step === "source" ? (
        <SourceStep
          source={source}
          setSource={setSource}
          onBack={() => setStep("locate")}
          onContinue={() => setStep("import")}
        />
      ) : null}

      {step === "import" ? (
        <ImportStep
          source={source}
          handleFileImport={handleFileImport}
          handleOsmFetch={handleOsmFetch}
          importedFeatures={importedFeatures}
          importedFiles={importedFiles}
          note={note}
          setNote={setNote}
          warnings={warnings}
          busy={busy}
          onBack={() => setStep("source")}
          onCommit={handleCommit}
          onClearImport={() => {
            setImportedFeatures([]);
            setImportedFiles([]);
            setWarnings([]);
          }}
        />
      ) : null}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────

function LocateStep(props: {
  apiKey: string;
  isLoaded: boolean;
  loadError?: Error;
  mapCenter: { lat: number; lng: number };
  setMapCenter: React.Dispatch<
    React.SetStateAction<{ lat: number; lng: number }>
  >;
  mapZoom: number;
  setMapZoom: React.Dispatch<React.SetStateAction<number>>;
  extentMetres: number;
  setExtentMetres: (metres: number) => void;
  rotationDeg: number;
  setRotationDeg: (deg: number) => void;
  rectangleBounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  mapRef: React.MutableRefObject<google.maps.Map | null>;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  handleSearch: () => void;
  geocoding: boolean;
  onContinue: () => void;
}) {
  const {
    apiKey,
    isLoaded,
    loadError,
    mapCenter,
    setMapCenter,
    mapZoom,
    setMapZoom,
    extentMetres,
    setExtentMetres,
    rotationDeg,
    setRotationDeg,
    rectangleBounds,
    mapRef,
    searchQuery,
    setSearchQuery,
    handleSearch,
    geocoding,
    onContinue,
  } = props;

  // Defensive: a malformed identity.location can leave mapCenter with
  // NaN. Every value handed to Google Maps must be finite, so derive a
  // safe view of the centre and reuse it.
  const safeMapCenter = useMemo(() => {
    const lat = Number(mapCenter?.lat);
    const lng = Number(mapCenter?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    return { lat: 33.5731, lng: -7.5898 };
  }, [mapCenter]);

  // Capture the initial center and zoom on first render. Re-using the
  // same value on every render is what keeps the GoogleMap from
  // re-applying `center`/`zoom` (which would fight `onIdle` and loop).
  const [initialMapCenter] = useState(() => safeMapCenter);
  const [initialMapZoom] = useState(() => mapZoom);

  return (
    <div className="grid flex-1 min-h-0 gap-3 px-4 py-3 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="relative flex min-h-[460px] flex-col overflow-hidden rounded-[8px] border border-stroke-0 bg-surface-2">
        {!apiKey ? (
          <div className="grid h-full place-items-center text-center text-[0.76rem] text-ink-2">
            <div className="max-w-sm space-y-2 px-4">
              <p className="font-semibold text-ink-1">
                Google Maps API key missing
              </p>
              <p>
                Set <code className="rounded bg-surface-3 px-1 py-0.5 text-[0.7rem]">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>{" "}
                in <code>.env.local</code> and reload to enable map locate.
                You can still use manual coordinates below.
              </p>
            </div>
          </div>
        ) : loadError ? (
          <div className="grid h-full place-items-center text-[0.76rem] text-danger-ink">
            Map failed to load: {loadError.message}
          </div>
        ) : !isLoaded ? (
          <div className="grid h-full place-items-center text-[0.76rem] text-ink-3">
            Loading Google Maps…
          </div>
        ) : (
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "100%" }}
            // Pass center/zoom only on first mount via stable refs so
            // they're not re-applied on every render — re-applying a
            // controlled `center` against `onCenterChanged` causes an
            // infinite update loop.  Programmatic moves go through
            // `mapRef.current.panTo()` below.
            center={initialMapCenter}
            zoom={initialMapZoom}
            onLoad={(map) => {
              mapRef.current = map;
            }}
            onIdle={() => {
              const map = mapRef.current;
              if (!map) return;
              const c = map.getCenter();
              if (c) {
                const lat = c.lat();
                const lng = c.lng();
                setMapCenter((current) =>
                  Math.abs(current.lat - lat) < 1e-7 &&
                  Math.abs(current.lng - lng) < 1e-7
                    ? current
                    : { lat, lng },
                );
              }
              const z = map.getZoom();
              if (typeof z === "number") {
                setMapZoom((current) => (current === z ? current : z));
              }
            }}
            options={{
              mapTypeId: "hybrid",
              tilt: 0,
              disableDefaultUI: false,
              clickableIcons: false,
            }}
          >
            <MarkerF position={safeMapCenter} />
            <RectangleF
              bounds={rectangleBounds}
              options={{
                strokeColor: "#ffb547",
                strokeWeight: 2,
                fillColor: "#ffb547",
                fillOpacity: 0.08,
                clickable: false,
              }}
            />
          </GoogleMap>
        )}
      </div>

      <aside className="flex flex-col gap-3 text-[0.76rem]">
        <section className="rounded-[8px] border border-stroke-0 bg-surface-1 p-3">
          <label className="block text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
            Search place
          </label>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleSearch();
              }}
              placeholder="Boulevard Zerktouni, Casablanca"
              className="flex-1 rounded-[6px] border border-stroke-0 bg-surface-2 px-2 py-1.5 text-ink-1 outline-none"
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={geocoding || !isLoaded}
              className="rounded-[6px] border border-accent-stroke bg-accent-surface px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-accent-ink transition hover:brightness-110 disabled:opacity-50"
            >
              {geocoding ? "…" : "Search"}
            </button>
          </div>
        </section>

        <section className="rounded-[8px] border border-stroke-0 bg-surface-1 p-3">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
            Manual coordinates
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[0.62rem] text-ink-3">Latitude</span>
              <input
                type="number"
                step={0.00001}
                value={mapCenter.lat}
                onChange={(event) => {
                  const next = {
                    lat: Number(event.target.value),
                    lng: mapCenter.lng,
                  };
                  setMapCenter(next);
                  mapRef.current?.panTo(next);
                }}
                className="rounded-[6px] border border-stroke-0 bg-surface-2 px-2 py-1 font-mono text-ink-1 outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.62rem] text-ink-3">Longitude</span>
              <input
                type="number"
                step={0.00001}
                value={mapCenter.lng}
                onChange={(event) => {
                  const next = {
                    lat: mapCenter.lat,
                    lng: Number(event.target.value),
                  };
                  setMapCenter(next);
                  mapRef.current?.panTo(next);
                }}
                className="rounded-[6px] border border-stroke-0 bg-surface-2 px-2 py-1 font-mono text-ink-1 outline-none"
              />
            </label>
          </div>
        </section>

        <section className="rounded-[8px] border border-stroke-0 bg-surface-1 p-3">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
            Extent &amp; rotation
          </p>
          <label className="mt-2 block text-[0.62rem] text-ink-3">
            Extent (m per side)
            <input
              type="range"
              min={40}
              max={400}
              step={5}
              value={extentMetres}
              onChange={(event) => setExtentMetres(Number(event.target.value))}
              className="mt-1 w-full"
            />
            <span className="mt-1 block font-mono text-ink-1">
              {extentMetres} × {extentMetres} m
            </span>
          </label>
          <label className="mt-2 block text-[0.62rem] text-ink-3">
            Rotation (° clockwise from north)
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={rotationDeg}
              onChange={(event) => setRotationDeg(Number(event.target.value))}
              className="mt-1 w-full"
            />
            <span className="mt-1 block font-mono text-ink-1">
              {rotationDeg}°
            </span>
          </label>
          <label className="mt-2 block text-[0.62rem] text-ink-3">
            Map zoom
            <input
              type="number"
              min={10}
              max={22}
              value={mapZoom}
              onChange={(event) => {
                const next = Number(event.target.value);
                setMapZoom(next);
                mapRef.current?.setZoom(next);
              }}
              className="mt-1 w-full rounded-[6px] border border-stroke-0 bg-surface-2 px-2 py-1 font-mono text-ink-1 outline-none"
            />
          </label>
        </section>

        <button
          type="button"
          onClick={onContinue}
          className="rounded-[6px] border border-accent-stroke bg-accent-surface px-3 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-accent-ink transition hover:brightness-110"
        >
          Continue · Choose source
        </button>
      </aside>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────

function SourceStep({
  source,
  setSource,
  onBack,
  onContinue,
}: {
  source: BasePlanSource;
  setSource: (source: BasePlanSource) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="grid flex-1 min-h-0 gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_260px]">
      <section className="flex flex-col gap-2">
        {SOURCE_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setSource(option.id)}
            className={clsx(
              "rounded-[8px] border p-3 text-left transition",
              source === option.id
                ? "border-accent-stroke bg-accent-surface"
                : "border-stroke-0 bg-surface-1 hover:border-stroke-1",
            )}
          >
            <p className="flex items-center justify-between text-[0.82rem] font-semibold text-ink-1">
              {option.label}
              {source === option.id ? (
                <span className="text-[0.62rem] uppercase tracking-[0.22em] text-accent-ink">
                  Selected
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-[0.72rem] text-ink-2">
              {option.description}
            </p>
          </button>
        ))}
      </section>
      <aside className="flex flex-col justify-between gap-3 text-[0.74rem]">
        <div className="rounded-[8px] border border-stroke-0 bg-surface-1 p-3 text-ink-2">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
            Guidance
          </p>
          <ul className="mt-2 list-disc pl-4">
            <li>
              Prefer <strong>TopoExport</strong> when the area has been
              surveyed.  The exporter produces layer-tagged SVG/DXF/GeoJSON.
            </li>
            <li>
              Use the <strong>template fallback</strong> only for concept
              studies where no topo exists yet — the basePlan audit trail
              will flag the plan as template-sourced.
            </li>
          </ul>
        </div>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="rounded-[6px] border border-stroke-0 bg-surface-1 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-2 hover:text-ink-0"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="rounded-[6px] border border-accent-stroke bg-accent-surface px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-accent-ink transition hover:brightness-110"
          >
            Continue · Import
          </button>
        </div>
      </aside>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────

function ImportStep({
  source,
  handleFileImport,
  handleOsmFetch,
  importedFeatures,
  importedFiles,
  note,
  setNote,
  warnings,
  busy,
  onBack,
  onCommit,
  onClearImport,
}: {
  source: BasePlanSource;
  handleFileImport: (file: File) => Promise<void>;
  handleOsmFetch: () => Promise<void>;
  importedFeatures: BaseLayerFeature[];
  importedFiles: BasePlanFileMeta[];
  note: string;
  setNote: (value: string) => void;
  warnings: string[];
  busy: boolean;
  onBack: () => void;
  onCommit: () => void;
  onClearImport: () => void;
}) {
  const option = SOURCE_OPTIONS.find((entry) => entry.id === source);
  const featureCounts = useMemo(() => {
    const map = new Map<BaseLayerKind, number>();
    for (const feature of importedFeatures) {
      map.set(feature.kind, (map.get(feature.kind) ?? 0) + 1);
    }
    return map;
  }, [importedFeatures]);

  const onFileInput = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      for (const file of files) {
        await handleFileImport(file);
      }
      event.target.value = "";
    },
    [handleFileImport],
  );

  return (
    <div className="grid flex-1 min-h-0 gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="flex flex-col gap-3">
        <div className="rounded-[8px] border border-stroke-0 bg-surface-1 p-4">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
            {option?.label}
          </p>
          <p className="mt-1 text-[0.76rem] text-ink-2">{option?.description}</p>

          {option?.acceptsFile ? (
            <div className="mt-3 flex items-center gap-2">
              <label className="cursor-pointer rounded-[6px] border border-accent-stroke bg-accent-surface px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-accent-ink transition hover:brightness-110">
                {busy ? "Importing…" : "Choose file(s)"}
                <input
                  type="file"
                  accept={option.accept}
                  multiple
                  onChange={onFileInput}
                  className="hidden"
                  disabled={busy}
                />
              </label>
              {importedFeatures.length > 0 ? (
                <button
                  type="button"
                  onClick={onClearImport}
                  className="rounded-[6px] border border-stroke-0 bg-surface-2 px-3 py-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-ink-2 hover:text-ink-0"
                >
                  Clear import
                </button>
              ) : null}
            </div>
          ) : source === "osm" ? (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleOsmFetch()}
                disabled={busy}
                className="rounded-[6px] border border-accent-stroke bg-accent-surface px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-accent-ink transition hover:brightness-110 disabled:opacity-50"
              >
                {busy ? "Fetching from OSM…" : "🌍 Fetch from OpenStreetMap"}
              </button>
              {importedFeatures.length > 0 ? (
                <button
                  type="button"
                  onClick={onClearImport}
                  className="rounded-[6px] border border-stroke-0 bg-surface-2 px-3 py-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-ink-2 hover:text-ink-0"
                >
                  Clear import
                </button>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-[0.72rem] text-sig-yellow-ink">
              No file upload — clicking Commit seeds the template and tags
              the basePlan source as <code>template</code>.
            </p>
          )}

          {importedFiles.length > 0 ? (
            <ul className="mt-3 space-y-1 text-[0.7rem] text-ink-2">
              {importedFiles.map((file, idx) => (
                <li
                  key={`${file.name}-${idx}`}
                  className="flex items-center justify-between gap-2 rounded-[6px] border border-stroke-0 bg-surface-2 px-2 py-1"
                >
                  <span className="truncate font-mono text-ink-1">
                    {file.name}
                  </span>
                  <span className="shrink-0 text-ink-3">
                    {Math.round(file.sizeBytes / 1024)} KB ·{" "}
                    {file.featureCount ?? 0} features
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {warnings.length > 0 ? (
            <div className="mt-3 rounded-[6px] border border-sig-yellow-stroke bg-sig-yellow-surface px-2 py-1.5 text-[0.68rem] text-sig-yellow-ink">
              <p className="font-semibold uppercase tracking-wider">
                Warnings
              </p>
              <ul className="mt-1 list-disc pl-4">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="rounded-[8px] border border-stroke-0 bg-surface-1 p-4">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
            Imported features
          </p>
          {importedFeatures.length === 0 ? (
            <p className="mt-2 text-[0.74rem] text-ink-3">
              Nothing imported yet.
            </p>
          ) : (
            <ul className="mt-2 grid grid-cols-2 gap-1.5 text-[0.72rem]">
              {Array.from(featureCounts.entries()).map(([kind, count]) => (
                <li
                  key={kind}
                  className="flex items-center justify-between rounded-[6px] border border-stroke-0 bg-surface-2 px-2 py-1"
                >
                  <span className="text-ink-2">{LAYER_LABELS[kind]}</span>
                  <span className="font-mono text-ink-1">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <aside className="flex flex-col gap-3 text-[0.74rem]">
        <label className="flex flex-col gap-1 rounded-[8px] border border-stroke-0 bg-surface-1 p-3">
          <span className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
            Note (optional)
          </span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            placeholder="Source file reference, surveyor, drawing number, …"
            className="rounded-[6px] border border-stroke-0 bg-surface-2 px-2 py-1 text-ink-1 outline-none"
          />
        </label>
        <div className="rounded-[8px] border border-stroke-0 bg-surface-1 p-3 text-[0.7rem] text-ink-2">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
            What happens on commit
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>
              <code>civilPlan.basePlan</code> records the locate + import
              audit trail.
            </li>
            <li>
              <code>civilPlan.baseLayers</code> populates with parsed
              geometry.
            </li>
            <li>
              The engineering layer (supports, loops, chambers, cables)
              starts empty — you add it on top in the Plan tab.
            </li>
            <li>
              AutoCAD page reads the imported geometry directly, no
              template fallback needed.
            </li>
          </ol>
        </div>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="rounded-[6px] border border-stroke-0 bg-surface-1 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-2 hover:text-ink-0"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={onCommit}
            disabled={busy}
            className="rounded-[6px] border border-accent-stroke bg-accent-surface px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-accent-ink transition hover:brightness-110 disabled:opacity-50"
          >
            {source === "template" ? "Seed template" : "Commit base plan"}
          </button>
        </div>
      </aside>
    </div>
  );
}
