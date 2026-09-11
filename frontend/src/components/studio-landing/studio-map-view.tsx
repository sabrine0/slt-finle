"use client";

import clsx from "clsx";
import Link from "next/link";
import {
  GoogleMap,
  MarkerF,
  PolygonF,
  PolylineF,
  InfoWindowF,
  useJsApiLoader,
} from "@react-google-maps/api";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  resolveControllerTone,
  type ControllerTone,
} from "@/components/studio-landing/controller-card";
import { useStudioThemeContext } from "@/components/studio-landing/theme-context";
import { createEtude } from "@/lib/etudes-api";
import {
  GOOGLE_MAPS_LIBRARIES,
  GOOGLE_MAPS_LOADER_ID,
  GOOGLE_MAPS_REGION,
} from "@/lib/google-maps-loader";
import { moroccoGeography } from "@/lib/morocco-geography";
import regionPolygonPaths from "@/lib/morocco-region-paths.json";
import type {
  EngineeringControllerRecord,
  EngineeringIntersectionRecord,
} from "@/types/engineering-studio";

interface StudioMapViewProps {
  apiKey?: string;
  intersections: EngineeringIntersectionRecord[];
}

type FilterValue = "all" | "online" | "degraded" | "offline";

interface ControllerPoint {
  controller: EngineeringControllerRecord;
  intersection: EngineeringIntersectionRecord;
  position: { lat: number; lng: number };
  tone: ControllerTone;
}

const TONE_COLORS: Record<ControllerTone, string> = {
  healthy: "#39d98a",
  watch: "#ffb547",
  critical: "#ff5f5f",
  offline: "#6b7c74",
};

const CASABLANCA_CENTER = { lat: 33.5731, lng: -7.5898 };

const DARK_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#0c1214" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0c1214" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a978d" }] },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#273137" }],
  },
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: "#0a1012" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#131c20" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#1d2a2f" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#2b3a40" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#071016" }],
  },
];

const LIGHT_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#f5f3ee" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#3a4a44" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#b9bdb6" }],
  },
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: "#ecebe4" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#e0ddd1" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#ffffff" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#f7d6a0" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#bcd9e1" }],
  },
];

function toneConnectionLabel(connection: string): ControllerTone {
  if (connection === "online") return "healthy";
  if (connection === "degraded") return "watch";
  if (connection === "offline") return "offline";
  return "healthy";
}

interface ZoneDescriptor {
  id: string;
  name: string;
  paths: Array<{ lat: number; lng: number }>;
  tone: ControllerTone;
  controllerCount: number;
}

/**
 * Map an engineering intersection's `district` text to a Morocco region id
 * by walking the canonical geography tree. Falls back to matching the
 * district field as a city or region name if no district match is found.
 */
function regionIdForDistrict(district: string | null | undefined): string | null {
  if (!district) return null;
  const key = district.trim().toLowerCase();
  if (!key) return null;

  for (const region of moroccoGeography.regions) {
    for (const city of region.cities) {
      for (const d of city.districts) {
        if (d.districtKeys.some((k) => k.trim().toLowerCase() === key)) {
          return region.id;
        }
      }
    }
  }
  for (const region of moroccoGeography.regions) {
    for (const city of region.cities) {
      if (city.name.toLowerCase() === key) return region.id;
    }
  }
  for (const region of moroccoGeography.regions) {
    if (region.name.toLowerCase() === key) return region.id;
  }
  return null;
}

/**
 * Build zone polygons for every Morocco region, colored by the worst
 * controller state reported in that region's intersections.
 */
function buildZones(points: ControllerPoint[]): ZoneDescriptor[] {
  const rank: Record<ControllerTone, number> = {
    healthy: 0,
    watch: 1,
    critical: 2,
    offline: 3,
  };

  const byRegion = new Map<string, { tone: ControllerTone; count: number }>();
  for (const point of points) {
    const regionId = regionIdForDistrict(point.intersection.district);
    if (!regionId) continue;
    const existing = byRegion.get(regionId);
    if (!existing) {
      byRegion.set(regionId, { tone: point.tone, count: 1 });
      continue;
    }
    existing.count += 1;
    if (rank[point.tone] > rank[existing.tone]) {
      existing.tone = point.tone;
    }
  }

  const paths = regionPolygonPaths as Record<
    string,
    Array<{ lat: number; lng: number }>
  >;

  return moroccoGeography.regions.map((region) => {
    const realPaths = paths[region.id];
    const fallback = (() => {
      const { north, south, east, west } = region.bounds;
      return [
        { lat: north, lng: west },
        { lat: north, lng: east },
        { lat: south, lng: east },
        { lat: south, lng: west },
      ];
    })();
    const aggregate = byRegion.get(region.id);
    return {
      id: region.id,
      name: region.name,
      paths: realPaths && realPaths.length > 2 ? realPaths : fallback,
      tone: aggregate?.tone ?? "offline",
      controllerCount: aggregate?.count ?? 0,
    };
  });
}

/**
 * Build "flow" edges between nearby controllers within the same district.
 * Each district's controllers are sorted west→east and linked consecutively.
 * Color of each edge = worst tone among its two endpoints.
 */
function buildCorridorEdges(points: ControllerPoint[]): Array<{
  id: string;
  path: Array<{ lat: number; lng: number }>;
  tone: ControllerTone;
}> {
  const byDistrict = new Map<string, ControllerPoint[]>();
  for (const point of points) {
    const key =
      (point.intersection.district && point.intersection.district.trim()) ||
      "__default__";
    const bucket = byDistrict.get(key) ?? [];
    bucket.push(point);
    byDistrict.set(key, bucket);
  }

  const rank: Record<ControllerTone, number> = {
    healthy: 0,
    watch: 1,
    critical: 2,
    offline: 3,
  };

  const edges: Array<{
    id: string;
    path: Array<{ lat: number; lng: number }>;
    tone: ControllerTone;
  }> = [];

  for (const [district, bucket] of byDistrict) {
    if (bucket.length < 2) continue;
    const ordered = [...bucket].sort((a, b) => a.position.lng - b.position.lng);
    for (let i = 0; i < ordered.length - 1; i += 1) {
      const a = ordered[i];
      const b = ordered[i + 1];
      const tone: ControllerTone =
        rank[a.tone] >= rank[b.tone] ? a.tone : b.tone;
      edges.push({
        id: `${district}-${a.controller.id}-${b.controller.id}`,
        path: [a.position, b.position],
        tone,
      });
    }
  }

  return edges;
}

export function StudioMapView({ apiKey, intersections }: StudioMapViewProps) {
  const { theme, toggle } = useStudioThemeContext();
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey ?? "",
    id: GOOGLE_MAPS_LOADER_ID,
    libraries: GOOGLE_MAPS_LIBRARIES,
    region: GOOGLE_MAPS_REGION,
  });

  const [filter, setFilter] = useState<FilterValue>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [etudeBusy, setEtudeBusy] = useState(false);
  const [etudeError, setEtudeError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const mapRef = useRef<google.maps.Map | null>(null);
  const router = useRouter();

  const handleMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const focusController = useCallback(
    (point: ControllerPoint) => {
      setSelectedId(point.controller.id);
      setView("project");
      setSearchQuery("");
      setSearchFocused(false);
      if (mapRef.current) {
        mapRef.current.panTo(point.position);
        const currentZoom = mapRef.current.getZoom() ?? 12;
        if (currentZoom < 16) mapRef.current.setZoom(16);
      }
    },
    [],
  );

  // Build all controller points with positions + tones.
  const points = useMemo<ControllerPoint[]>(() => {
    const out: ControllerPoint[] = [];
    for (const intersection of intersections) {
      for (const controller of intersection.controllers) {
        const lat = Number(intersection.latitude);
        const lng = Number(intersection.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        out.push({
          controller,
          intersection,
          position: { lat, lng },
          tone: resolveControllerTone(controller, intersection),
        });
      }
    }
    return out;
  }, [intersections]);

  const filtered = useMemo(() => {
    if (filter === "all") return points;
    return points.filter(
      (p) => toneConnectionLabel(p.controller.connectionState) === filter ||
        p.controller.connectionState === filter,
    );
  }, [points, filter]);

  const edges = useMemo(() => buildCorridorEdges(filtered), [filtered]);
  const zones = useMemo(() => buildZones(points), [points]);

  const [view, setView] = useState<"country" | "project">("country");

  const projectCenter = useMemo(() => {
    if (filtered.length === 0) return CASABLANCA_CENTER;
    const lat =
      filtered.reduce((s, p) => s + p.position.lat, 0) / filtered.length;
    const lng =
      filtered.reduce((s, p) => s + p.position.lng, 0) / filtered.length;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return CASABLANCA_CENTER;
    }
    return { lat, lng };
  }, [filtered]);

  const center =
    view === "country" ? moroccoGeography.center : projectCenter;
  const zoom =
    view === "country"
      ? moroccoGeography.defaultZoom
      : filtered.length > 1
        ? 12
        : 14;

  const counts = useMemo(() => {
    return points.reduce(
      (acc, p) => {
        if (p.controller.connectionState === "online") acc.online += 1;
        else if (p.controller.connectionState === "degraded")
          acc.degraded += 1;
        else if (p.controller.connectionState === "offline") acc.offline += 1;
        return acc;
      },
      { online: 0, degraded: 0, offline: 0 },
    );
  }, [points]);

  const selected = selectedId
    ? points.find((p) => p.controller.id === selectedId)
    : null;

  const searchResults = useMemo<ControllerPoint[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const matches: ControllerPoint[] = [];
    for (const point of points) {
      const haystack = [
        point.controller.code,
        point.controller.id,
        point.controller.controllerType ?? "",
        point.intersection.code,
        point.intersection.name,
        point.intersection.district ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (haystack.includes(q)) {
        matches.push(point);
        if (matches.length >= 12) break;
      }
    }
    return matches;
  }, [points, searchQuery]);

  const isDark = theme === "dark";
  const mapStyles = isDark ? DARK_MAP_STYLES : LIGHT_MAP_STYLES;

  // Shell classes pivot on theme.
  const shellClass = isDark
    ? "bg-[radial-gradient(circle_at_top_left,#14100a_0%,#0a0c0e_28%,#050709_65%,#030405_100%)] text-[#edf3ee]"
    : "bg-[#f3f1ea] text-[#1b2322]";

  const chipBase = isDark
    ? "border-white/10 bg-[#070b0e]/85 text-[#edf3ee]"
    : "border-black/10 bg-white/90 text-[#1b2322]";

  const chipMuted = isDark
    ? "text-[#8fa39a]"
    : "text-[#56605b]";

  const legendBorder = isDark ? "border-white/10" : "border-black/10";

  return (
    <main className={`relative min-h-screen ${shellClass}`}>
      <div className="absolute inset-0">
        {!apiKey ? (
          <div className={`grid h-full place-items-center px-6 text-center text-[0.88rem] ${chipMuted}`}>
            Set <span className="font-mono">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</span>{" "}
            in the frontend environment to load the map.
          </div>
        ) : loadError ? (
          <div className="grid h-full place-items-center text-[0.88rem] text-[#ff6363]">
            Google Maps failed to load.
          </div>
        ) : !isLoaded ? (
          <div className={`grid h-full place-items-center text-[0.88rem] ${chipMuted}`}>
            Loading map…
          </div>
        ) : (
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "100%" }}
            center={center}
            zoom={zoom}
            onLoad={handleMapLoad}
            options={{
              disableDefaultUI: true,
              clickableIcons: false,
              gestureHandling: "greedy",
              backgroundColor: isDark ? "#0c1214" : "#eceae1",
              styles: mapStyles,
            }}
          >
            {zones.map((zone) => {
              const active = zone.controllerCount > 0;
              const color = TONE_COLORS[zone.tone];
              return (
                <PolygonF
                  key={zone.id}
                  paths={zone.paths}
                  options={{
                    strokeColor: color,
                    strokeOpacity: active ? 0.85 : 0.35,
                    strokeWeight: active ? 2 : 1,
                    fillColor: color,
                    fillOpacity: active
                      ? zone.tone === "critical"
                        ? 0.28
                        : zone.tone === "watch"
                          ? 0.22
                          : 0.18
                      : isDark
                        ? 0.05
                        : 0.08,
                    clickable: false,
                  }}
                />
              );
            })}

            {edges.map((edge) => (
              <PolylineF
                key={edge.id}
                path={edge.path}
                options={{
                  strokeColor: TONE_COLORS[edge.tone],
                  strokeOpacity: 0.9,
                  strokeWeight: 5,
                  geodesic: true,
                  icons: [
                    {
                      icon: {
                        path: "M 0,-1 0,1",
                        strokeColor: isDark ? "#0a0f12" : "#ffffff",
                        strokeOpacity: 0.9,
                        strokeWeight: 3,
                        scale: 3,
                      },
                      offset: "0",
                      repeat: "22px",
                    },
                  ],
                }}
              />
            ))}

            {filtered.map((point) => (
              <MarkerF
                key={point.controller.id}
                position={point.position}
                onClick={() => setSelectedId(point.controller.id)}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: selectedId === point.controller.id ? 11 : 8,
                  fillColor: TONE_COLORS[point.tone],
                  fillOpacity: 1,
                  strokeColor: isDark ? "#05070a" : "#ffffff",
                  strokeWeight: 2.5,
                }}
                zIndex={selectedId === point.controller.id ? 30 : 10}
              />
            ))}

            {selected ? (
              <InfoWindowF
                position={selected.position}
                onCloseClick={() => setSelectedId(null)}
              >
                <div
                  className={`min-w-[260px] rounded-[10px] border p-3 ${isDark ? "border-white/10 bg-[#07100d] text-[#edf3ee]" : "border-black/10 bg-white text-[#1b2322]"}`}
                >
                  <p className={`text-[0.62rem] font-semibold uppercase tracking-[0.22em] ${chipMuted}`}>
                    {selected.controller.code}
                  </p>
                  <p className="mt-0.5 text-[0.95rem] font-semibold">
                    {selected.intersection.name}
                  </p>
                  <p className={`mt-0.5 text-[0.7rem] ${chipMuted}`}>
                    {selected.intersection.district || "—"}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: TONE_COLORS[selected.tone] }}
                    />
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em]">
                      {selected.controller.connectionState}
                    </span>
                  </div>

                  <Link
                    href={`/studio/workspace/${selected.intersection.id}`}
                    className={`mt-3 block w-full rounded-[10px] border px-3 py-2 text-center text-[0.78rem] font-semibold transition ${
                      isDark
                        ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
                        : "border-emerald-700/30 bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
                    }`}
                  >
                    🛠 Ouvrir l’atelier ingénierie
                  </Link>
                  <p
                    className={`mt-3 text-[0.58rem] font-semibold uppercase tracking-[0.22em] ${chipMuted}`}
                  >
                    Outils dédiés
                  </p>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    <Link
                      href={`/studio/programmer/${selected.controller.id}`}
                      className="rounded-[8px] border border-[#5a4218] bg-gradient-to-b from-[#ffc45c] to-[#c38a29] px-2.5 py-1.5 text-center text-[0.72rem] font-semibold text-[#120a02] transition hover:brightness-110"
                    >
                      ⌨ Programmer
                    </Link>
                    <Link
                      href={`/studio/autocad/${selected.intersection.id}`}
                      className={`rounded-[8px] border px-2.5 py-1.5 text-center text-[0.72rem] font-semibold transition ${
                        isDark
                          ? "border-white/15 bg-[#0a1014] text-[#edf3ee] hover:border-white/30"
                          : "border-black/15 bg-white text-[#1b2322] hover:bg-[#f3f1ea]"
                      }`}
                    >
                      ▭ AutoCAD
                    </Link>
                  </div>
                  <button
                    type="button"
                    disabled={etudeBusy}
                    onClick={async () => {
                      if (etudeBusy) return;
                      setEtudeBusy(true);
                      setEtudeError(null);
                      try {
                        const created = await createEtude({
                          intersectionCode: selected.intersection.code,
                          intersectionLabel: selected.intersection.name,
                          latitude: Number(selected.intersection.latitude),
                          longitude: Number(selected.intersection.longitude),
                          scope: "standard",
                        });
                        router.push(`/studio/etude/${created.id}`);
                      } catch (err) {
                        setEtudeError(
                          err instanceof Error ? err.message : String(err),
                        );
                      } finally {
                        setEtudeBusy(false);
                      }
                    }}
                    className={`mt-2 w-full rounded-[8px] border px-2.5 py-1.5 text-center text-[0.72rem] font-semibold transition ${
                      isDark
                        ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
                        : "border-emerald-700/30 bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
                    } disabled:opacity-50`}
                  >
                    {etudeBusy ? "Création…" : "📝 Générer une étude"}
                  </button>
                  {etudeError ? (
                    <p className="mt-1 text-[0.6rem] text-red-400">
                      {etudeError}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    disabled={deleteBusy}
                    onClick={async () => {
                      if (deleteBusy) return;
                      const ok = window.confirm(
                        `Supprimer définitivement « ${selected.intersection.name} » (${selected.intersection.code}) ?\n\n` +
                          `Cette action supprime aussi le contrôleur, les phases, les détecteurs et les plans de feux associés. Irréversible.`,
                      );
                      if (!ok) return;
                      setDeleteBusy(true);
                      setDeleteError(null);
                      try {
                        const response = await fetch(
                          `/api/intersections/${selected.intersection.id}`,
                          { method: "DELETE" },
                        );
                        if (!response.ok) {
                          let detail = `${response.status} ${response.statusText}`;
                          try {
                            const body = (await response.json()) as {
                              detail?: string;
                            };
                            if (body?.detail) detail = body.detail;
                          } catch {
                            /* not json */
                          }
                          setDeleteError(
                            response.status === 403
                              ? "Permission refusée — droits intersections.manage requis."
                              : detail,
                          );
                          setDeleteBusy(false);
                          return;
                        }
                        // Success — close the popup, reset the
                        // busy flag, and refresh the server data so
                        // the deleted marker disappears.
                        setSelectedId(null);
                        setDeleteBusy(false);
                        setDeleteError(null);
                        router.refresh();
                      } catch (err) {
                        setDeleteError(
                          err instanceof Error ? err.message : String(err),
                        );
                        setDeleteBusy(false);
                      }
                    }}
                    className={`mt-2 w-full rounded-[8px] border px-2.5 py-1.5 text-center text-[0.72rem] font-semibold transition ${
                      isDark
                        ? "border-red-400/40 bg-red-500/10 text-red-100 hover:bg-red-500/20"
                        : "border-red-700/30 bg-red-50 text-red-900 hover:bg-red-100"
                    } disabled:opacity-50`}
                  >
                    {deleteBusy
                      ? "Suppression…"
                      : "✕ Supprimer ce carrefour"}
                  </button>
                  {deleteError ? (
                    <p className="mt-1 text-[0.6rem] text-red-400">
                      {deleteError}
                    </p>
                  ) : null}
                  <p className={`mt-2 text-[0.58rem] ${chipMuted}`}>
                    <span className="font-semibold">Programmer</span> — régulation,
                    phases, plans de feux. <br />
                    <span className="font-semibold">AutoCAD</span> — câblage, supports,
                    boucles, chambres. <br />
                    <span className="font-semibold">Étude</span> — dossier
                    d’ingénierie généré (situation, matrice, plans de feux,
                    affectations).
                  </p>
                </div>
              </InfoWindowF>
            ) : null}
          </GoogleMap>
        )}
      </div>

      {/* Top-left legend — mirrors the command platform aesthetic */}
      <div className="pointer-events-none absolute left-5 top-5 flex w-[420px] max-w-[calc(100vw-3rem)] flex-col gap-2">
        <div
          className={`pointer-events-auto relative flex flex-col rounded-[12px] border backdrop-blur ${chipBase}`}
        >
          <div className="flex items-center gap-2 px-4 py-2">
            <span className={`text-[0.6rem] font-semibold uppercase tracking-[0.22em] ${chipMuted}`}>
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => {
                // delay so click on a result still fires
                setTimeout(() => setSearchFocused(false), 150);
              }}
              placeholder="Rechercher contrôleur, carrefour, code, quartier…"
              className={`flex-1 bg-transparent text-[0.82rem] outline-none placeholder:opacity-50 ${
                isDark ? "text-[#edf3ee]" : "text-[#1b2322]"
              }`}
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className={`text-[0.7rem] uppercase tracking-[0.18em] ${chipMuted} hover:opacity-100`}
              >
                ✕
              </button>
            ) : null}
          </div>
          {searchFocused && searchQuery.trim() ? (
            <div
              className={`max-h-[320px] overflow-y-auto border-t text-[0.78rem] ${
                isDark ? "border-white/10" : "border-black/10"
              }`}
            >
              {searchResults.length === 0 ? (
                <p className={`px-4 py-3 ${chipMuted}`}>Aucun résultat.</p>
              ) : (
                <ul>
                  {searchResults.map((point) => (
                    <li key={point.controller.id}>
                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          focusController(point);
                        }}
                        className={`flex w-full items-start gap-2 px-4 py-2 text-left transition ${
                          isDark
                            ? "hover:bg-white/5"
                            : "hover:bg-black/5"
                        }`}
                      >
                        <span
                          aria-hidden
                          className="mt-1 inline-block h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: TONE_COLORS[point.tone],
                          }}
                        />
                        <span className="flex flex-col">
                          <span className="font-semibold">
                            {point.intersection.name}
                          </span>
                          <span className={`font-mono text-[0.68rem] ${chipMuted}`}>
                            {point.controller.code} · {point.intersection.code}{" "}
                            · {point.intersection.district || "—"}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
        <div
          className={`pointer-events-auto flex items-center gap-3 rounded-[12px] border px-4 py-2.5 backdrop-blur ${chipBase}`}
        >
          <span className={`text-[0.6rem] font-semibold uppercase tracking-[0.26em] ${chipMuted}`}>
            View
          </span>
          <button
            type="button"
            onClick={() => setView("country")}
            className={clsx(
              "rounded-[8px] px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.18em] transition",
              view === "country"
                ? "text-[#ffb547]"
                : isDark
                  ? "text-[#8fa39a] hover:text-[#edf3ee]"
                  : "text-[#56605b] hover:text-[#1b2322]",
            )}
          >
            Country
          </button>
          <span className={chipMuted}>·</span>
          <button
            type="button"
            onClick={() => setView("project")}
            className={clsx(
              "rounded-[8px] px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.18em] transition",
              view === "project"
                ? "text-[#ffb547]"
                : isDark
                  ? "text-[#8fa39a] hover:text-[#edf3ee]"
                  : "text-[#56605b] hover:text-[#1b2322]",
            )}
          >
            Project
          </button>
          <span className={`text-[0.62rem] font-medium ${chipMuted}`}>
            Royaume du Maroc
          </span>
        </div>
        <div
          className={`pointer-events-auto flex items-center gap-3 rounded-[12px] border px-4 py-2 backdrop-blur ${chipBase}`}
        >
          <span className={`text-[0.56rem] font-semibold uppercase tracking-[0.24em] ${chipMuted}`}>
            Zones
          </span>
          <span className="flex items-center gap-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-[#a8eac2]">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#39d98a]" />
            Healthy
          </span>
          <span className="flex items-center gap-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-[#ffd089]">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#ffb547]" />
            Watch
          </span>
          <span className="flex items-center gap-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-[#ff9a9a]">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#ff5f5f]" />
            Alert
          </span>
        </div>
        <div
          className={`pointer-events-auto flex items-center gap-3 rounded-[12px] border px-4 py-2 backdrop-blur ${chipBase}`}
        >
          <span className={`text-[0.56rem] font-semibold uppercase tracking-[0.24em] ${chipMuted}`}>
            Flow
          </span>
          <span className="flex items-center gap-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-[#a8eac2]">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#39d98a]" />
            Online · {counts.online}
          </span>
          <span className="flex items-center gap-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-[#ffd089]">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#ffb547]" />
            Degraded · {counts.degraded}
          </span>
          <span className="flex items-center gap-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-[#ff9a9a]">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#ff5f5f]" />
            Offline · {counts.offline}
          </span>
        </div>
      </div>

      {/* Top-right controls */}
      <div className="pointer-events-none absolute right-5 top-5 flex items-center gap-2">
        <div
          className={`pointer-events-auto flex items-center gap-1 rounded-[12px] border p-1 backdrop-blur ${chipBase}`}
        >
          {(
            [
              ["all", "All"],
              ["online", "Online"],
              ["degraded", "Degraded"],
              ["offline", "Offline"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={clsx(
                "rounded-[8px] px-3 py-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.18em] transition",
                filter === value
                  ? "border border-[#5a4218] bg-[#14100a] text-[#ffb547]"
                  : isDark
                    ? "border border-transparent text-[#8fa39a] hover:text-[#edf3ee]"
                    : "border border-transparent text-[#56605b] hover:text-[#1b2322]",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={toggle}
          aria-label="Toggle theme"
          className={`pointer-events-auto rounded-[12px] border px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.2em] backdrop-blur transition ${chipBase} hover:brightness-110`}
        >
          {isDark ? "☀ Light" : "☾ Dark"}
        </button>

        <Link
          href="/"
          className={`pointer-events-auto rounded-[12px] border px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.2em] backdrop-blur transition ${chipBase} hover:brightness-110`}
        >
          Command
        </Link>

        <Link
          href="/studio/zones"
          className={`pointer-events-auto rounded-[12px] border px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.2em] backdrop-blur transition ${chipBase} hover:brightness-110`}
        >
          + Zone
        </Link>

        <Link
          href="/studio/ai-etude"
          className="pointer-events-auto rounded-[12px] border border-emerald-700/40 bg-gradient-to-b from-emerald-500/90 to-emerald-700 px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-white backdrop-blur transition hover:brightness-110"
          title="AI Engineering Assistant — Générer une étude carrefour assistée"
        >
          AI Étude
        </Link>

        <Link
          href="/studio/workbench"
          className="pointer-events-auto rounded-[12px] border border-[#5a4218] bg-gradient-to-b from-[#ffc45c] to-[#c38a29] px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-[#120a02] backdrop-blur transition hover:brightness-110"
        >
          Workbench
        </Link>

        <Link
          href="/studio/references"
          className={`pointer-events-auto rounded-[12px] border px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.2em] backdrop-blur transition ${chipBase} hover:brightness-110`}
        >
          References
        </Link>
      </div>

      {/* Bottom-left status */}
      <div
        className={`pointer-events-auto absolute bottom-5 left-5 flex items-center gap-3 rounded-[12px] border px-4 py-2.5 backdrop-blur ${chipBase} ${legendBorder}`}
      >
        <span className={`text-[0.6rem] font-semibold uppercase tracking-[0.26em] ${chipMuted}`}>
          Coverage
        </span>
        <span className="text-[0.82rem] font-semibold">
          {filtered.length} / {points.length} controllers
        </span>
        <span className={`text-[0.68rem] ${chipMuted}`}>
          {edges.length} corridor link{edges.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Empty-state banner if no controllers at all */}
      {points.length === 0 ? (
        <div
          className={`pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[14px] border px-6 py-5 text-center backdrop-blur ${chipBase}`}
        >
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.26em] text-[#ffb547]">
            No controllers
          </p>
          <p className="mt-2 text-[0.88rem]">
            Set up an intersection in the workbench to see controllers here.
          </p>
        </div>
      ) : null}
    </main>
  );
}
