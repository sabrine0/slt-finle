"use client";

/**
 * Zone builder — draw a rectangular study area on the map, then use
 * it as the context for adding a new controller / intersection.
 *
 * Visual references:
 *   - TopoExport's rectangle-with-corner-handles zone picker
 *   - The STLS command-platform dark map styling
 *
 * Behaviour:
 *   - The rectangle is defined by two corners (NW + SE) in lat/lng.
 *   - Four draggable Markers act as corner handles. Dragging a corner
 *     updates the opposite edge interactively.
 *   - Width / height labels are computed in metres from lat/lng.
 *   - "Add controller" opens a small form. On submit we POST to the
 *     command-platform overrides-audit endpoint as a stub — operators
 *     can later wire this to the real controllers endpoint.
 */

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GoogleMap,
  MarkerF,
  PolylineF,
  RectangleF,
  useJsApiLoader,
} from "@react-google-maps/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useStudioThemeContext } from "@/components/studio-landing/theme-context";
import { logOverride } from "@/lib/command-platform-api";
import {
  GOOGLE_MAPS_LIBRARIES,
  GOOGLE_MAPS_LOADER_ID,
  GOOGLE_MAPS_REGION,
} from "@/lib/google-maps-loader";

const PROPOSALS_STORAGE_KEY = "stls.zone-builder.proposals";

interface ZoneProposal {
  id: string;
  code: string;
  name: string;
  street: string;
  bounds: ZoneBounds;
  centre: { lat: number; lng: number };
  widthMetres: number;
  heightMetres: number;
  savedAt: string;
  syncedToAudit: boolean;
}

function loadProposals(): ZoneProposal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PROPOSALS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is ZoneProposal =>
        !!entry &&
        typeof entry === "object" &&
        "id" in entry &&
        "bounds" in entry,
    );
  } catch {
    return [];
  }
}

function saveProposals(list: ZoneProposal[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROPOSALS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* storage blocked — non-fatal */
  }
}

interface ZoneBuilderProps {
  apiKey?: string;
  projectName?: string;
  defaultCenter?: { lat: number; lng: number };
}

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
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#ffffff" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#bcd9e1" }],
  },
];

const CASABLANCA_CENTRE = { lat: 33.5731, lng: -7.5898 };

type Corner = "nw" | "ne" | "se" | "sw";

interface ZoneBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

function initialBounds(centre: { lat: number; lng: number }): ZoneBounds {
  // 600 m × 600 m by default — small enough to see the streets, big
  // enough to reach the next intersection.
  const metresLat = 300;
  const metresLng = 300;
  const latDelta = metresLat / 111_320;
  const lngDelta = metresLng / (111_320 * Math.cos((centre.lat * Math.PI) / 180));
  return {
    north: centre.lat + latDelta,
    south: centre.lat - latDelta,
    east: centre.lng + lngDelta,
    west: centre.lng - lngDelta,
  };
}

function metresBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

interface LayerToggle {
  id: string;
  label: string;
  emoji: string;
  locked?: boolean;
}

const MODEL_LAYERS: LayerToggle[] = [
  { id: "roads", label: "Routes", emoji: "🛣️" },
  { id: "buildings", label: "Bâtiments", emoji: "🏛️" },
  { id: "crosswalks", label: "Traversées piétons", emoji: "🚶" },
  { id: "rails", label: "Voies ferrées", emoji: "🚆", locked: true },
  { id: "hydro", label: "Hydrographie", emoji: "💧", locked: true },
  { id: "vegetation", label: "Végétation", emoji: "🌳", locked: true },
  { id: "contours", label: "Courbes de niveau (5m)", emoji: "📐", locked: true },
];

const FORMAT_CHIPS = [
  { id: "dxf", label: "DXF", active: true },
  { id: "ifc", label: "IFC", badge: "PRO+" },
  { id: "obj", label: "OBJ" },
  { id: "gltf", label: "glTF" },
  { id: "stl", label: "STL" },
];

export function ZoneBuilder({
  apiKey,
  projectName,
  defaultCenter = CASABLANCA_CENTRE,
}: ZoneBuilderProps) {
  const { theme, toggle } = useStudioThemeContext();
  const isDark = theme === "dark";
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey ?? "",
    id: GOOGLE_MAPS_LOADER_ID,
    libraries: GOOGLE_MAPS_LIBRARIES,
    region: GOOGLE_MAPS_REGION,
  });

  const [bounds, setBounds] = useState<ZoneBounds>(() => initialBounds(defaultCenter));
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>({
    roads: true,
    buildings: false,
    crosswalks: false,
  });
  const [formatSelected, setFormatSelected] = useState("dxf");
  const [addController, setAddController] = useState(false);
  const [formState, setFormState] = useState({ code: "", name: "", street: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<null | {
    tone: "success" | "error";
    text: string;
  }>(null);
  const [proposals, setProposals] = useState<ZoneProposal[]>([]);
  const [pulseKey, setPulseKey] = useState(0);
  const [geocoding, setGeocoding] = useState(false);
  const mapRef = useRef<google.maps.Map | null>(null);
  const router = useRouter();

  useEffect(() => {
    setProposals(loadProposals());
  }, []);

  const widthMetres = useMemo(
    () =>
      metresBetween(
        { lat: bounds.north, lng: bounds.west },
        { lat: bounds.north, lng: bounds.east },
      ),
    [bounds],
  );
  const heightMetres = useMemo(
    () =>
      metresBetween(
        { lat: bounds.north, lng: bounds.west },
        { lat: bounds.south, lng: bounds.west },
      ),
    [bounds],
  );
  const areaKm2 = (widthMetres * heightMetres) / 1_000_000;

  const centre = useMemo(
    () => ({
      lat: (bounds.north + bounds.south) / 2,
      lng: (bounds.east + bounds.west) / 2,
    }),
    [bounds],
  );

  const moveCorner = useCallback((corner: Corner, lat: number, lng: number) => {
    setBounds((current) => {
      const next = { ...current };
      if (corner === "nw") {
        next.north = Math.max(lat, current.south + 0.0005);
        next.west = Math.min(lng, current.east - 0.0005);
      } else if (corner === "ne") {
        next.north = Math.max(lat, current.south + 0.0005);
        next.east = Math.max(lng, current.west + 0.0005);
      } else if (corner === "se") {
        next.south = Math.min(lat, current.north - 0.0005);
        next.east = Math.max(lng, current.west + 0.0005);
      } else {
        next.south = Math.min(lat, current.north - 0.0005);
        next.west = Math.min(lng, current.east - 0.0005);
      }
      return next;
    });
  }, []);

  const cornerPositions: Record<Corner, { lat: number; lng: number }> = {
    nw: { lat: bounds.north, lng: bounds.west },
    ne: { lat: bounds.north, lng: bounds.east },
    se: { lat: bounds.south, lng: bounds.east },
    sw: { lat: bounds.south, lng: bounds.west },
  };

  // When the Add Controller modal opens, reverse-geocode the zone
  // centre so the operator starts from a pre-filled proposal instead
  // of a blank form. The operator can still edit every field.
  useEffect(() => {
    if (!addController) return;
    if (typeof google === "undefined" || !google.maps?.Geocoder) return;
    if (formState.code || formState.name || formState.street) return;
    let cancelled = false;
    setGeocoding(true);
    const geocoder = new google.maps.Geocoder();
    geocoder
      .geocode({ location: centre })
      .then((response) => {
        if (cancelled) return;
        const fields = extractFields(response.results);
        if (fields) {
          setFormState((current) => ({
            code:
              current.code ||
              generateCodeFrom(fields.locality, fields.route, centre),
            name: current.name || fields.intersectionName,
            street: current.street || fields.street,
          }));
        }
      })
      .catch(() => {
        /* best-effort — leave blank */
      })
      .finally(() => {
        if (!cancelled) setGeocoding(false);
      });
    return () => {
      cancelled = true;
    };
  }, [addController, centre, formState.code, formState.name, formState.street]);

  const handleAddController = useCallback(async () => {
    setSubmitting(true);
    setSubmitMessage(null);
    const code =
      formState.code.trim() ||
      `NEW-${Date.now().toString(36).toUpperCase().slice(-5)}`;
    const proposal: ZoneProposal = {
      id: `zp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      code,
      name: formState.name.trim() || code,
      street: formState.street.trim(),
      bounds: { ...bounds },
      centre: { ...centre },
      widthMetres,
      heightMetres,
      savedAt: new Date().toISOString(),
      syncedToAudit: false,
    };

    // Persist locally first — that way the user always sees the
    // proposal even if the backend audit call fails. The audit call
    // is best-effort and only upgrades the `syncedToAudit` flag.
    const nextList = [proposal, ...proposals].slice(0, 25);
    setProposals(nextList);
    saveProposals(nextList);

    try {
      await logOverride(code, {
        action: "mode_change" as const,
        reasonCode: "other" as const,
        note: `Zone-builder · proposal ${proposal.id} · ${proposal.name} · ${widthMetres.toFixed(
          0,
        )}×${heightMetres.toFixed(0)} m at ${centre.lat.toFixed(5)},${centre.lng.toFixed(5)}`,
        targetReference: proposal.street || undefined,
      });
      // Flip syncedToAudit=true in storage.
      const synced = nextList.map((entry) =>
        entry.id === proposal.id ? { ...entry, syncedToAudit: true } : entry,
      );
      setProposals(synced);
      saveProposals(synced);
      setSubmitMessage({
        tone: "success",
        text: `Saved · ${code} · redirection vers l'espace de travail…`,
      });
    } catch (error) {
      setSubmitMessage({
        tone: "success",
        text: `Saved locally · ${code} · audit sync failed (${
          error instanceof Error ? error.message : "unknown error"
        }). Going to workspace…`,
      });
    } finally {
      setAddController(false);
      setFormState({ code: "", name: "", street: "" });
      setSubmitting(false);
      // Drop the operator straight into the proposal workspace so they
      // can see the freshly created controller rather than hunting for
      // it in a list.
      router.push(`/studio/zones/proposals/${proposal.id}`);
    }
  }, [bounds, centre, formState, heightMetres, proposals, router, widthMetres]);

  const handleVisualise = useCallback(() => {
    // 1. Fit the map to the zone bounds with a bit of padding.
    if (mapRef.current && typeof google !== "undefined") {
      const latLngBounds = new google.maps.LatLngBounds(
        { lat: bounds.south, lng: bounds.west },
        { lat: bounds.north, lng: bounds.east },
      );
      mapRef.current.fitBounds(latLngBounds, 64);
    }
    // 2. Trigger a pulse animation on the rectangle border by bumping
    //    a key — RectangleF is remounted with a brighter stroke.
    setPulseKey((k) => k + 1);
    setSubmitMessage({
      tone: "success",
      text: `Zone centred · ${widthMetres.toFixed(0)} × ${heightMetres.toFixed(
        0,
      )} m · ${areaKm2.toFixed(3)} km². Ready for Ajouter contrôleur.`,
    });
  }, [bounds, widthMetres, heightMetres, areaKm2]);

  const handleRevisitProposal = useCallback(
    (proposal: ZoneProposal) => {
      router.push(`/studio/zones/proposals/${proposal.id}`);
    },
    [router],
  );

  const handleCentreOnProposal = useCallback((proposal: ZoneProposal) => {
    setBounds(proposal.bounds);
    setPulseKey((k) => k + 1);
    if (mapRef.current && typeof google !== "undefined") {
      const latLngBounds = new google.maps.LatLngBounds(
        { lat: proposal.bounds.south, lng: proposal.bounds.west },
        { lat: proposal.bounds.north, lng: proposal.bounds.east },
      );
      mapRef.current.fitBounds(latLngBounds, 64);
    }
    setSubmitMessage({
      tone: "success",
      text: `Zone centrée · ${proposal.code}`,
    });
  }, []);

  const handleDeleteProposal = useCallback(
    (id: string) => {
      const next = proposals.filter((entry) => entry.id !== id);
      setProposals(next);
      saveProposals(next);
    },
    [proposals],
  );

  const shellClass = isDark
    ? "bg-[radial-gradient(circle_at_top_left,#14100a_0%,#0a0c0e_28%,#050709_65%,#030405_100%)] text-[#edf3ee]"
    : "bg-[#f3f1ea] text-[#1b2322]";
  const panelBg = isDark
    ? "border-white/10 bg-[#070b0e]/92 text-[#edf3ee]"
    : "border-black/10 bg-white/95 text-[#1b2322]";
  const muted = isDark ? "text-[#8fa39a]" : "text-[#56605b]";
  const mapStyles = isDark ? DARK_MAP_STYLES : LIGHT_MAP_STYLES;

  return (
    <main className={`relative min-h-screen ${shellClass}`}>
      <div className="absolute inset-0">
        {!apiKey ? (
          <FullScreenMessage theme={isDark}>
            Set <span className="font-mono">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</span>{" "}
            in the frontend environment to use the Zone builder.
          </FullScreenMessage>
        ) : loadError ? (
          <FullScreenMessage theme={isDark} tone="error">
            Google Maps failed to load.
          </FullScreenMessage>
        ) : !isLoaded ? (
          <FullScreenMessage theme={isDark}>Loading map…</FullScreenMessage>
        ) : (
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "100%" }}
            center={centre}
            zoom={15}
            onLoad={(map) => {
              mapRef.current = map;
            }}
            onUnmount={() => {
              mapRef.current = null;
            }}
            options={{
              disableDefaultUI: true,
              clickableIcons: false,
              gestureHandling: "greedy",
              backgroundColor: isDark ? "#0c1214" : "#eceae1",
              styles: mapStyles,
            }}
          >
            <RectangleF
              key={`zone-rect-${pulseKey}`}
              bounds={bounds}
              options={{
                strokeColor: "#ffb547",
                strokeWeight: pulseKey > 0 ? 4 : 2,
                strokeOpacity: 0.95,
                fillColor: "#ffb547",
                fillOpacity: pulseKey > 0 ? 0.2 : 0.08,
                clickable: false,
                zIndex: 10,
              }}
            />
            {/* Corner handles — draggable markers at each bbox corner. */}
            {(Object.keys(cornerPositions) as Corner[]).map((corner) => (
              <MarkerF
                key={corner}
                position={cornerPositions[corner]}
                draggable
                onDrag={(event) => {
                  const ll = event.latLng;
                  if (!ll) return;
                  moveCorner(corner, ll.lat(), ll.lng());
                }}
                onDragEnd={(event) => {
                  const ll = event.latLng;
                  if (!ll) return;
                  moveCorner(corner, ll.lat(), ll.lng());
                }}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 6,
                  fillColor: isDark ? "#0a0f12" : "#1b2322",
                  fillOpacity: 1,
                  strokeColor: isDark ? "#f6faf5" : "#ffffff",
                  strokeWeight: 2,
                }}
                zIndex={30}
              />
            ))}
            {/* Dimension guide lines + labels along the top and left edges. */}
            <PolylineF
              path={[
                { lat: bounds.north, lng: bounds.west },
                { lat: bounds.north, lng: bounds.east },
              ]}
              options={{
                strokeColor: isDark ? "#f6faf5" : "#1b2322",
                strokeWeight: 1.5,
                strokeOpacity: 0.8,
                geodesic: false,
                zIndex: 20,
              }}
            />
            <PolylineF
              path={[
                { lat: bounds.north, lng: bounds.west },
                { lat: bounds.south, lng: bounds.west },
              ]}
              options={{
                strokeColor: isDark ? "#f6faf5" : "#1b2322",
                strokeWeight: 1.5,
                strokeOpacity: 0.8,
                geodesic: false,
                zIndex: 20,
              }}
            />
          </GoogleMap>
        )}
      </div>

      {/* Top-left search + breadcrumb */}
      <div className="pointer-events-none absolute left-5 top-5 flex flex-col gap-2">
        <div
          className={clsx(
            "pointer-events-auto flex items-center gap-3 rounded-[12px] border px-4 py-2 backdrop-blur",
            panelBg,
          )}
        >
          <Link
            href="/studio"
            className={clsx(
              "text-[0.66rem] font-semibold uppercase tracking-[0.2em]",
              muted,
            )}
          >
            ← Studio
          </Link>
          <span className={clsx("text-[0.56rem] uppercase tracking-[0.24em]", muted)}>
            Zone builder
          </span>
          <span className="text-[0.92rem] font-semibold text-[#ffb547]">
            {projectName ?? "STLS Pilot — Casablanca"}
          </span>
        </div>
        <div
          className={clsx(
            "pointer-events-auto flex items-center gap-2 rounded-[12px] border px-3 py-1.5 backdrop-blur",
            panelBg,
          )}
        >
          <span aria-hidden className={muted}>
            🔍
          </span>
          <input
            type="search"
            placeholder="Rechercher une rue, un lieu…"
            className={clsx(
              "min-w-[280px] bg-transparent text-[0.82rem] outline-none placeholder:opacity-60",
              isDark ? "text-[#edf3ee]" : "text-[#1b2322]",
            )}
          />
        </div>
      </div>

      {/* Top-right chrome: area badge + theme toggle */}
      <div className="pointer-events-auto absolute right-5 top-5 flex items-center gap-2">
        <div
          className={clsx(
            "flex items-center gap-3 rounded-full border px-4 py-1.5 backdrop-blur",
            panelBg,
          )}
        >
          <span className="text-[0.95rem] font-semibold text-[#ffb547]">
            {areaKm2.toFixed(2)} km²
          </span>
          <span
            className={clsx(
              "rounded-full border px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.22em]",
              isDark
                ? "border-[#39d98a]/60 text-[#a8eac2]"
                : "border-[#1f8c55]/70 text-[#0a5732]",
            )}
          >
            Basic
          </span>
        </div>
        <button
          type="button"
          onClick={toggle}
          className={clsx(
            "rounded-[12px] border px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.2em] backdrop-blur transition hover:brightness-110",
            panelBg,
          )}
        >
          {isDark ? "☀ Light" : "☾ Dark"}
        </button>
      </div>

      {/* Right sidebar — TopoExport-style */}
      <aside
        className={clsx(
          "pointer-events-auto absolute right-5 top-24 flex max-h-[calc(100vh-9rem)] w-[360px] flex-col gap-3 overflow-y-auto rounded-[14px] border p-4 backdrop-blur",
          panelBg,
        )}
      >
        <section>
          <label
            className={clsx(
              "flex items-center gap-3 rounded-[10px] border px-3 py-2.5",
              isDark ? "border-white/10" : "border-black/10",
            )}
          >
            <input type="checkbox" className="h-4 w-4 accent-[#ffb547]" />
            <span className="text-[0.82rem] font-semibold">Carte vectorielle 2D</span>
          </label>
        </section>

        <section
          className={clsx(
            "rounded-[10px] border px-3 py-3",
            isDark ? "border-white/10" : "border-black/10",
          )}
        >
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              defaultChecked
              className="h-4 w-4 accent-[#ffb547]"
            />
            <span className="text-[0.82rem] font-semibold">Modélisation 3D</span>
            <span className={clsx("ml-auto", muted)}>🧊</span>
          </label>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {FORMAT_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setFormatSelected(chip.id)}
                className={clsx(
                  "relative rounded-[8px] border px-2 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] transition",
                  formatSelected === chip.id
                    ? "border-[#ffb547] text-[#ffb547]"
                    : isDark
                      ? "border-white/10 text-[#8fa39a] hover:text-[#edf3ee]"
                      : "border-black/10 text-[#56605b] hover:text-[#1b2322]",
                )}
              >
                {chip.label}
                {chip.badge ? (
                  <span className="absolute -top-1.5 right-1 rounded-full bg-[#ffb547] px-1 py-0.5 text-[0.5rem] font-bold text-[#120a02]">
                    {chip.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-1.5">
          {MODEL_LAYERS.map((layer) => (
            <label
              key={layer.id}
              className={clsx(
                "flex cursor-pointer items-center gap-3 rounded-[8px] border px-3 py-2 transition",
                activeLayers[layer.id]
                  ? "border-[#ffb547] bg-[#14100a]/50"
                  : isDark
                    ? "border-white/8"
                    : "border-black/8",
                layer.locked ? "opacity-60 cursor-not-allowed" : "hover:brightness-110",
              )}
            >
              <input
                type="checkbox"
                checked={!!activeLayers[layer.id]}
                disabled={layer.locked}
                onChange={(event) =>
                  setActiveLayers((current) => ({
                    ...current,
                    [layer.id]: event.target.checked,
                  }))
                }
                className="h-4 w-4 accent-[#ffb547]"
              />
              <span aria-hidden className="text-[1rem]">
                {layer.emoji}
              </span>
              <span className="text-[0.82rem] font-semibold">{layer.label}</span>
              {layer.locked ? (
                <span className={clsx("ml-auto text-[0.6rem] font-semibold", muted)}>
                  PRO
                </span>
              ) : null}
            </label>
          ))}
        </section>

        <section
          className={clsx(
            "rounded-[10px] border px-3 py-2.5 text-[0.75rem]",
            isDark ? "border-white/10 bg-[#0b1014]" : "border-black/10 bg-[#f7f5ec]",
          )}
        >
          <p className={clsx("text-[0.58rem] font-semibold uppercase tracking-[0.24em]", muted)}>
            Zone dimensions
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-1">
            <dt className={muted}>Largeur</dt>
            <dd className="font-mono font-semibold">{widthMetres.toFixed(0)} m</dd>
            <dt className={muted}>Hauteur</dt>
            <dd className="font-mono font-semibold">{heightMetres.toFixed(0)} m</dd>
            <dt className={muted}>Aire</dt>
            <dd className="font-mono font-semibold">{areaKm2.toFixed(3)} km²</dd>
            <dt className={muted}>Centre</dt>
            <dd className="truncate font-mono text-[0.68rem]">
              {centre.lat.toFixed(5)}, {centre.lng.toFixed(5)}
            </dd>
          </dl>
        </section>

        <div className="flex items-center justify-between pt-1">
          <span className={clsx("text-[0.72rem] font-semibold uppercase tracking-[0.18em]", muted)}>
            Total
          </span>
          <span className="rounded-full bg-[#39d98a]/15 px-2.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.22em] text-[#39d98a]">
            Free
          </span>
        </div>

        <button
          type="button"
          onClick={() => setAddController(true)}
          className="w-full rounded-[10px] border border-[#5a4218] bg-gradient-to-b from-[#ffc45c] to-[#c38a29] px-4 py-3 text-[0.82rem] font-bold uppercase tracking-[0.2em] text-[#120a02] shadow-[0_6px_18px_rgba(255,181,71,0.3)] transition hover:brightness-110"
        >
          + Ajouter contrôleur
        </button>

        <button
          type="button"
          onClick={handleVisualise}
          className="w-full rounded-[10px] border border-white/10 bg-[#0b1014] px-4 py-2.5 text-[0.78rem] font-semibold uppercase tracking-[0.18em] text-[#c3cdc6] transition hover:border-white/20 hover:text-[#edf3ee]"
        >
          Visualiser
        </button>

        {submitMessage ? (
          <div
            className={clsx(
              "rounded-[8px] border px-3 py-2 text-[0.7rem]",
              submitMessage.tone === "success"
                ? "border-[#1d4a34]/70 bg-[#0d1913]/70 text-[#a8eac2]"
                : "border-[#5a1d1d]/70 bg-[#180d0d]/60 text-[#ff9a9a]",
            )}
          >
            {submitMessage.text}
          </div>
        ) : null}

        <section
          className={clsx(
            "mt-1 rounded-[10px] border px-3 py-3",
            isDark ? "border-white/10 bg-[#070b0e]" : "border-black/10 bg-[#f7f5ec]",
          )}
        >
          <div className="flex items-center justify-between">
            <p
              className={clsx(
                "text-[0.58rem] font-semibold uppercase tracking-[0.24em]",
                muted,
              )}
            >
              Mes propositions
            </p>
            <span
              className={clsx(
                "rounded-full border px-2 py-0.5 text-[0.58rem] font-semibold",
                isDark ? "border-white/10 text-[#c3cdc6]" : "border-black/10 text-[#1b2322]",
              )}
            >
              {proposals.length}
            </span>
          </div>
          {proposals.length === 0 ? (
            <p className={clsx("mt-2 text-[0.7rem]", muted)}>
              Aucune zone enregistrée. Dessinez un rectangle et cliquez{" "}
              <span className="font-semibold">Ajouter contrôleur</span> pour
              enregistrer votre première proposition — elle apparaîtra ici et
              restera après rechargement de la page.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {proposals.map((proposal) => (
                <li
                  key={proposal.id}
                  className={clsx(
                    "rounded-[8px] border px-2.5 py-2",
                    isDark ? "border-white/8 bg-[#0b1014]" : "border-black/8 bg-white",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[0.72rem] font-semibold">
                        {proposal.code}
                      </p>
                      <p
                        className={clsx(
                          "truncate text-[0.68rem]",
                          isDark ? "text-[#edf3ee]" : "text-[#1b2322]",
                        )}
                      >
                        {proposal.name}
                      </p>
                      {proposal.street ? (
                        <p className={clsx("truncate text-[0.62rem]", muted)}>
                          {proposal.street}
                        </p>
                      ) : null}
                      <p
                        className={clsx("mt-0.5 font-mono text-[0.6rem]", muted)}
                      >
                        {proposal.widthMetres.toFixed(0)}×
                        {proposal.heightMetres.toFixed(0)} m ·{" "}
                        {proposal.centre.lat.toFixed(4)},
                        {proposal.centre.lng.toFixed(4)}
                      </p>
                    </div>
                    <span
                      className={clsx(
                        "rounded-full px-1.5 py-0.5 text-[0.52rem] font-bold uppercase tracking-[0.18em]",
                        proposal.syncedToAudit
                          ? "bg-[#39d98a]/20 text-[#39d98a]"
                          : "bg-[#ffb547]/20 text-[#ffb547]",
                      )}
                    >
                      {proposal.syncedToAudit ? "Sync" : "Local"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRevisitProposal(proposal)}
                      className="rounded-[6px] border border-[#5a4218] bg-[#14100a] px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-[#ffb547] transition hover:brightness-110"
                    >
                      Ouvrir
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCentreOnProposal(proposal)}
                      className={clsx(
                        "rounded-[6px] border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.18em] transition",
                        isDark
                          ? "border-white/10 text-[#c3cdc6] hover:border-white/20 hover:text-[#edf3ee]"
                          : "border-black/10 text-[#1b2322] hover:border-black/20",
                      )}
                    >
                      Centrer
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProposal(proposal.id)}
                      className="rounded-[6px] border border-[#5a1d1d]/50 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-[#ff9a9a] transition hover:brightness-110"
                    >
                      Supprimer
                    </button>
                    <span className={clsx("ml-auto font-mono text-[0.58rem]", muted)}>
                      {relativeTime(proposal.savedAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      {/* Bottom dimension strip matching TopoExport width label */}
      <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-[#070b0e]/92 px-4 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[#edf3ee] backdrop-blur">
        {widthMetres.toFixed(0)} m × {heightMetres.toFixed(0)} m ·{" "}
        {areaKm2.toFixed(2)} km²
      </div>

      {/* Add-controller modal */}
      {addController ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-8 backdrop-blur"
          onClick={(event) => {
            if (event.target === event.currentTarget) setAddController(false);
          }}
        >
          <div
            className={clsx(
              "w-full max-w-md rounded-[14px] border p-5",
              isDark ? "border-white/10 bg-[#0b1014] text-[#edf3ee]" : "border-black/10 bg-white text-[#1b2322]",
            )}
          >
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.26em] text-[#ffb547]">
              Nouveau contrôleur
            </p>
            <h2 className="mt-1 text-[1.1rem] font-semibold">Add controller inside zone</h2>
            <p className={clsx("mt-0.5 text-[0.72rem]", muted)}>
              Position based on zone centre · {centre.lat.toFixed(5)},{" "}
              {centre.lng.toFixed(5)}
            </p>

            <div className="mt-4 space-y-3">
              {geocoding ? (
                <div
                  className={clsx(
                    "flex items-center gap-2 rounded-[8px] border px-3 py-2 text-[0.7rem]",
                    isDark
                      ? "border-white/10 bg-[#070b0e] text-[#8fa39a]"
                      : "border-black/10 bg-white text-[#56605b]",
                  )}
                >
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#ffb547]"
                  />
                  Auto-remplissage depuis Google Maps…
                </div>
              ) : null}
              <Field
                label="Controller code"
                placeholder="e.g. INT-CAS-010"
                value={formState.code}
                onChange={(code) => setFormState((f) => ({ ...f, code }))}
                mono
              />
              <Field
                label="Intersection name"
                placeholder="e.g. Maarif / Zerktouni"
                value={formState.name}
                onChange={(name) => setFormState((f) => ({ ...f, name }))}
              />
              <Field
                label="Main street (optional)"
                placeholder="e.g. Av Mohammed V"
                value={formState.street}
                onChange={(street) => setFormState((f) => ({ ...f, street }))}
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddController(false)}
                disabled={submitting}
                className="rounded-[8px] border border-white/10 bg-[#0b1014] px-3 py-2 text-[0.76rem] font-semibold uppercase tracking-[0.18em] text-[#c3cdc6] transition hover:border-white/20 hover:text-[#edf3ee] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleAddController()}
                disabled={submitting || formState.code.trim().length === 0}
                className="rounded-[8px] border border-[#5a4218] bg-gradient-to-b from-[#ffc45c] to-[#c38a29] px-4 py-2 text-[0.76rem] font-bold uppercase tracking-[0.2em] text-[#120a02] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Saving…" : "Save zone proposal"}
              </button>
            </div>
            <p className={clsx("mt-3 text-[0.64rem]", muted)}>
              The proposal is recorded in the override-audit log for the BE to
              review. Real intersection / controller creation goes through the
              engineering approval path.
            </p>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  mono,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (next: string) => void;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-[#8fa39a]">
        {label}
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={clsx(
          "mt-1 w-full rounded-[8px] border border-white/10 bg-[#070b0e] px-3 py-2 text-[0.82rem] text-[#edf3ee] outline-none transition focus:border-[#ffb547]",
          mono ? "font-mono" : "",
        )}
      />
    </label>
  );
}

/**
 * Convert a reverse-geocoded set of Google results into the fields
 * our Add-controller form cares about. Picks the first `route` (the
 * street the zone centre sits on) and the first administrative or
 * neighbourhood-level name that can stand in for the intersection
 * label. Graceful when the response is sparse.
 */
function extractFields(
  results: google.maps.GeocoderResult[] | null | undefined,
): null | {
  route: string;
  locality: string;
  street: string;
  intersectionName: string;
} {
  if (!results || results.length === 0) return null;
  let route = "";
  let locality = "";
  let sublocality = "";
  let neighbourhood = "";
  let administrative = "";
  for (const result of results) {
    for (const component of result.address_components ?? []) {
      const types = component.types ?? [];
      if (!route && types.includes("route")) route = component.long_name;
      if (!neighbourhood && types.includes("neighborhood"))
        neighbourhood = component.long_name;
      if (!sublocality && types.includes("sublocality"))
        sublocality = component.long_name;
      if (!locality && types.includes("locality")) locality = component.long_name;
      if (!administrative && types.includes("administrative_area_level_2"))
        administrative = component.long_name;
    }
    if (route && (locality || sublocality || neighbourhood)) break;
  }
  const street = route || "";
  const district = sublocality || neighbourhood || locality || administrative || "";
  const intersectionName = street && district
    ? `${street} / ${district}`
    : street || district || "Nouveau carrefour";
  return {
    route,
    locality: locality || administrative || "",
    street,
    intersectionName,
  };
}

/** Build a plausible controller code from the geocoded context. */
function generateCodeFrom(
  locality: string,
  street: string,
  centre: { lat: number; lng: number },
): string {
  const localityTag = locality
    ? locality
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/[^A-Z]+/g, "")
        .slice(0, 3)
    : "CAS";
  const streetTag = street
    ? street
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/[^A-Z]+/g, "")
        .slice(0, 3)
    : "";
  const geoSeed = Math.abs(
    Math.round((centre.lat * 1000 + centre.lng * 1000) % 997),
  )
    .toString()
    .padStart(3, "0");
  return ["INT", localityTag, streetTag || geoSeed]
    .filter(Boolean)
    .join("-");
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const delta = Date.now() - then;
  if (delta < 0) return "just now";
  const s = Math.floor(delta / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} j`;
}

function FullScreenMessage({
  children,
  theme,
  tone,
}: {
  children: React.ReactNode;
  theme: boolean;
  tone?: "error";
}) {
  return (
    <div
      className={clsx(
        "grid h-full place-items-center px-6 text-center text-[0.88rem]",
        tone === "error"
          ? "text-[#ff6363]"
          : theme
            ? "text-[#8fa39a]"
            : "text-[#56605b]",
      )}
    >
      <div className="max-w-md space-y-2">{children}</div>
    </div>
  );
}
