"use client";

import clsx from "clsx";
import {
  CircleF,
  GoogleMap,
  InfoWindowF,
  MarkerF,
  PolygonF,
  PolylineF,
  TrafficLayerF,
  useGoogleMap,
  useJsApiLoader,
} from "@react-google-maps/api";
import { useEffect, useMemo, useState } from "react";

import { AdminBoundaries } from "@/components/command-platform/admin-boundaries";
import type {
  CommandPredictionHeatPoint,
  CommandPredictionInsight,
} from "@/components/command-platform/network-types";
import { useCommandTheme } from "@/components/command-platform/theme-context";
import {
  GOOGLE_MAPS_LIBRARIES,
  GOOGLE_MAPS_LOADER_ID,
  GOOGLE_MAPS_REGION,
} from "@/lib/google-maps-loader";

// When set, we upgrade the map to vector mode and paint Morocco's real
// administrative-area-level-1 polygons via Google's FeatureLayer.  When
// missing, the map falls back to the existing rectangular bounds.
const GOOGLE_MAPS_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;
const USE_FEATURE_LAYER = Boolean(GOOGLE_MAPS_MAP_ID);

import type {
  CityMarker,
  MapView,
  RegionMarker,
  RegionPolygon,
} from "@/components/command-platform/types";
import type {
  CorridorSnapshot,
  IntersectionHealth,
  IntersectionSnapshot,
  LatLngPoint,
  ScenarioId,
  TrafficFlowState,
} from "@/types/command-platform";

const mapContainerStyle = {
  width: "100%",
  height: "100%",
};

const darkMapStyles = [
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
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#152025" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#071016" }],
  },
];

const markerIconByStatus = {
  healthy: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
  watch: "https://maps.google.com/mapfiles/ms/icons/yellow-dot.png",
  critical: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
} as const;

const corridorColorByState = {
  smooth: "#39d98a",
  pressure: "#ffb547",
  congestion: "#ff6363",
} as const;

const toneColor: Record<IntersectionHealth, string> = {
  healthy: "#39d98a",
  watch: "#ffb547",
  critical: "#ff6363",
};

const controllerLinkArrowPath = "M 0,-1 2,0 0,1";

interface CommandMapProps {
  apiKey?: string;
  cityCenter: LatLngPoint;
  intersections: IntersectionSnapshot[];
  corridors: CorridorSnapshot[];
  controllerLinks?: Array<{
    id: string;
    path: LatLngPoint[];
    state: TrafficFlowState;
    relationKind: string;
  }>;
  predictionHeat?: CommandPredictionHeatPoint[];
  heatSegments?: Array<{
    id: string;
    path: LatLngPoint[];
    state: TrafficFlowState;
    intensity: number;
  }>;
  predictionInsights?: CommandPredictionInsight[];
  selectedIntersectionId?: string;
  onSelectIntersection: (intersectionId: string) => void;
  view?: MapView;
  onSelectRegion?: (regionId: string) => void;
  onSelectCity?: (cityId: string) => void;
  scenarioId?: ScenarioId;
  flashIntersectionId?: string;
  overlayMode?: "controllers" | "heatmap";
}

const scenarioOverlay: Record<
  ScenarioId,
  { tint: string; borderGlow: string; flowSpeedMs: number; corridorBoost: number }
> = {
  normal_traffic: {
    tint: "transparent",
    borderGlow: "rgba(255,255,255,0)",
    flowSpeedMs: 900,
    corridorBoost: 1,
  },
  peak_traffic: {
    tint:
      "radial-gradient(ellipse at top, rgba(255,181,71,0.12), transparent 55%), radial-gradient(ellipse at bottom, rgba(255,181,71,0.06), transparent 55%)",
    borderGlow: "rgba(255,181,71,0.35)",
    flowSpeedMs: 620,
    corridorBoost: 1.1,
  },
  emergency: {
    tint:
      "radial-gradient(ellipse at center, rgba(255,95,95,0.14), transparent 55%), radial-gradient(ellipse at bottom, rgba(255,95,95,0.08), transparent 65%)",
    borderGlow: "rgba(255,95,95,0.55)",
    flowSpeedMs: 380,
    corridorBoost: 1.25,
  },
};

export function CommandMap({
  apiKey,
  cityCenter,
  intersections,
  corridors,
  controllerLinks = [],
  selectedIntersectionId,
  onSelectIntersection,
  view,
  onSelectRegion,
  onSelectCity,
  scenarioId = "normal_traffic",
  flashIntersectionId,
  predictionHeat = [],
  heatSegments = [],
  predictionInsights = [],
  overlayMode = "controllers",
}: CommandMapProps) {
  const selectedIntersection =
    intersections.find(
      (intersection) => intersection.id === selectedIntersectionId,
    ) ?? null;

  const mode = view?.mode ?? "city";
  const showOperationalLayer = mode !== "country";
  const showControllerLayer = showOperationalLayer && overlayMode === "controllers";
  const showHeatLayer = showOperationalLayer && overlayMode === "heatmap";
  const center = view?.center ?? cityCenter;
  const zoom = view?.zoom ?? 13;
  const regionMarkers = view?.regionMarkers ?? [];
  const cityMarkers = view?.cityMarkers ?? [];
  const regionPolygons = view?.regionPolygons ?? [];
  const focusRegionId = view?.focusRegionId;
  const scenarioPalette = scenarioOverlay[scenarioId];
  const emphasizeAll = scenarioId === "emergency";
  const flashIntersection = flashIntersectionId
    ? intersections.find((intersection) => intersection.id === flashIntersectionId)
    : undefined;
  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);
  const [selectedInsightId, setSelectedInsightId] = useState<string | null>(null);
  const { theme: cmdTheme } = useCommandTheme();
  const isLightTheme = cmdTheme === "light";
  const selectedInsight =
    predictionInsights.find((entry) => entry.id === selectedInsightId) ?? null;

  const fallback = (
    <MapFallback
      cityCenter={cityCenter}
      corridors={corridors}
      intersections={intersections}
      selectedIntersectionId={selectedIntersection?.id}
      onSelectIntersection={onSelectIntersection}
      mode={mode}
      regionMarkers={regionMarkers}
      cityMarkers={cityMarkers}
      regionPolygons={regionPolygons}
      focusRegionId={focusRegionId}
      onSelectRegion={onSelectRegion}
      onSelectCity={onSelectCity}
      focusCenter={center}
      flashIntersectionId={flashIntersectionId}
      predictionHeat={predictionHeat}
      predictionInsights={predictionInsights}
      overlayMode={overlayMode}
      showBanners
    />
  );

  const quietFallback = (
    <MapFallback
      cityCenter={cityCenter}
      corridors={corridors}
      intersections={intersections}
      selectedIntersectionId={selectedIntersection?.id}
      onSelectIntersection={onSelectIntersection}
      mode={mode}
      regionMarkers={regionMarkers}
      cityMarkers={cityMarkers}
      regionPolygons={regionPolygons}
      focusRegionId={focusRegionId}
      onSelectRegion={onSelectRegion}
      onSelectCity={onSelectCity}
      focusCenter={center}
      flashIntersectionId={flashIntersectionId}
      predictionHeat={predictionHeat}
      predictionInsights={predictionInsights}
      overlayMode={overlayMode}
      showBanners={false}
    />
  );

  if (!apiKey) {
    return (
      <ScenarioFrame palette={scenarioPalette} scenarioId={scenarioId}>
        {fallback}
      </ScenarioFrame>
    );
  }

  return (
    <ScenarioFrame palette={scenarioPalette} scenarioId={scenarioId}>
      <GoogleMapsHost
        apiKey={apiKey}
        fallback={quietFallback}
      >
        <GoogleMap
          center={center}
          zoom={zoom}
          mapContainerStyle={mapContainerStyle}
          options={{
            disableDefaultUI: true,
            clickableIcons: false,
            gestureHandling: "greedy",
            backgroundColor: isLightTheme ? "#eceae1" : "#05070a",
            // When a Map ID is supplied, the map runs in vector mode and
            // the cloud-side style is applied; JSON `styles` is ignored.
            // Otherwise we stay on raster with the dark JSON style (or
            // default Google light tiles when light theme is active).
            ...(USE_FEATURE_LAYER
              ? { mapId: GOOGLE_MAPS_MAP_ID }
              : { styles: isLightTheme ? undefined : darkMapStyles }),
          }}
        >
          <SmoothPan center={center} zoom={zoom} />
          {showOperationalLayer ? <TrafficLayerF /> : null}

        {mode === "city" && showControllerLayer &&
          corridors.map((corridor) => (
            <PolylineF
              key={corridor.id}
              path={corridor.path}
              options={{
                strokeColor: corridorColorByState[corridor.state],
                strokeOpacity: 0.95,
                strokeWeight: 6,
                geodesic: true,
                icons: [
                  {
                    icon: {
                      path: "M 0,-1 0,1",
                      strokeColor: "#0a0f12",
                      strokeOpacity: 0.95,
                      strokeWeight: 3,
                      scale: 3,
                    },
                    offset: "0",
                    repeat: "26px",
                  },
                ],
              }}
            />
          ))}

        {showHeatLayer &&
          heatSegments.map((segment) => (
            <PolylineF
              key={`heat-segment-${segment.id}`}
              path={segment.path}
              options={{
                strokeColor: corridorColorByState[segment.state],
                strokeOpacity: Math.min(
                  0.85,
                  Math.max(0.25, 0.25 + segment.intensity * 0.55),
                ),
                strokeWeight: 3 + segment.intensity * 5,
                zIndex: 1,
              }}
            />
          ))}

        {showHeatLayer &&
          predictionHeat.flatMap((entry) => {
            const layers =
              entry.trafficState === "congestion"
                ? [
                    { suffix: "outer", radius: entry.radiusMetres * 1.7, color: "#28d7ff", opacity: 0.12, zIndex: 2 },
                    { suffix: "mid", radius: entry.radiusMetres * 1.28, color: "#52f07b", opacity: 0.16, zIndex: 3 },
                    { suffix: "warm", radius: entry.radiusMetres * 0.92, color: "#fff04a", opacity: 0.24, zIndex: 4 },
                    { suffix: "hot", radius: entry.radiusMetres * 0.62, color: "#ff5c43", opacity: 0.34, zIndex: 5 },
                    { suffix: "core", radius: entry.radiusMetres * 0.38, color: "#ff2b2b", opacity: 0.46, zIndex: 6 },
                  ]
                : entry.trafficState === "pressure"
                  ? [
                      { suffix: "outer", radius: entry.radiusMetres * 1.45, color: "#2cd4ff", opacity: 0.1, zIndex: 2 },
                      { suffix: "mid", radius: entry.radiusMetres * 1.08, color: "#7ef874", opacity: 0.13, zIndex: 3 },
                      { suffix: "warm", radius: entry.radiusMetres * 0.76, color: "#ffe75b", opacity: 0.2, zIndex: 4 },
                      { suffix: "hot", radius: entry.radiusMetres * 0.46, color: "#ff9640", opacity: 0.26, zIndex: 5 },
                    ]
                  : [
                      { suffix: "outer", radius: entry.radiusMetres * 1.2, color: "#42ceff", opacity: 0.08, zIndex: 2 },
                      { suffix: "mid", radius: entry.radiusMetres * 0.86, color: "#67ef9c", opacity: 0.12, zIndex: 3 },
                      { suffix: "core", radius: entry.radiusMetres * 0.5, color: "#c8ff63", opacity: 0.16, zIndex: 4 },
                    ];

            return layers.map((layer) => (
              <CircleF
                key={`heat-${entry.id}-${layer.suffix}`}
                center={entry.location}
                radius={layer.radius}
                options={{
                  fillColor: layer.color,
                  fillOpacity: layer.opacity,
                  strokeOpacity: 0,
                  strokeWeight: 0,
                  clickable: false,
                  zIndex: layer.zIndex,
                }}
              />
            ));
          })}

        {showControllerLayer &&
          controllerLinks.map((link) => (
            <PolylineF
              key={link.id}
              path={link.path}
              options={{
                strokeColor: corridorColorByState[link.state],
                strokeOpacity: 0.42,
                strokeWeight: 3,
              zIndex: 4,
                icons: [
                  {
                    icon: {
                      path: controllerLinkArrowPath,
                      strokeColor: corridorColorByState[link.state],
                      strokeOpacity: 0.95,
                      strokeWeight: 2.2,
                      scale: 2.4,
                    },
                    offset: "60%",
                  },
                ],
              }}
            />
          ))}

        {showControllerLayer &&
          predictionInsights.map((entry) => (
            <MarkerF
              key={`insight-${entry.id}`}
              position={entry.location}
              onClick={() =>
                setSelectedInsightId((current) =>
                  current === entry.id ? null : entry.id,
                )
              }
              icon={buildEmojiMarkerIcon(entry.emoji, corridorColorByState[entry.trafficState])}
              zIndex={18}
            />
          ))}

        {showControllerLayer &&
          intersections
            .filter((intersection) =>
              emphasizeAll
                ? intersection.status !== "healthy"
                : intersection.status === "critical",
            )
            .map((intersection) => (
              <CriticalPulse
                key={`pulse-${intersection.id}`}
                position={intersection.location}
              />
            ))}

        {showControllerLayer && flashIntersection ? (
          <CommandFlash
            key={`flash-${flashIntersection.id}-${flashIntersectionId}`}
            position={flashIntersection.location}
          />
        ) : null}

        {showControllerLayer &&
          intersections.map((intersection) => (
            <MarkerF
              key={intersection.id}
              position={intersection.location}
              onClick={() => onSelectIntersection(intersection.id)}
              icon={{
                url: markerIconByStatus[intersection.status],
              }}
              zIndex={intersection.id === selectedIntersection?.id ? 20 : 10}
            />
          ))}

        {showControllerLayer && selectedIntersection ? (
          <InfoWindowF
            position={selectedIntersection.location}
            onCloseClick={() => onSelectIntersection(selectedIntersection.id)}
          >
            <div className="min-w-[248px] rounded-[8px] border border-white/10 bg-[#07100d] p-3 text-[#edf3ee] shadow-[0_18px_36px_rgba(0,0,0,0.34)]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#8fa69a]">
                  {selectedIntersection.district}
                </p>
                <span className="rounded-[8px] border border-white/10 bg-[#0b1512] px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-[#d9e3dc]">
                  {toLabel(selectedIntersection.status)}
                </span>
              </div>
              <p className="mt-2 text-base font-semibold text-[#f1f6f2]">
                {selectedIntersection.name}
              </p>
              <p className="mt-1 text-xs text-[#8fa69a]">
                {selectedIntersection.address}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <MetricChip
                  label="Queue"
                  value={String(selectedIntersection.queueLength)}
                />
                <MetricChip
                  label="Delay"
                  value={`${selectedIntersection.averageDelaySeconds}s`}
                />
                <MetricChip
                  label="Incidents"
                  value={String(selectedIntersection.incidents)}
                />
              </div>
            </div>
          </InfoWindowF>
        ) : null}

        {showControllerLayer && selectedInsight ? (
          <InfoWindowF
            position={selectedInsight.location}
            onCloseClick={() => setSelectedInsightId(null)}
          >
            <div className="min-w-[268px] rounded-[8px] border border-white/10 bg-[#07100d] p-3 text-[#edf3ee] shadow-[0_18px_36px_rgba(0,0,0,0.34)]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl" aria-hidden>
                    {selectedInsight.emoji}
                  </span>
                  <div>
                    <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#8fa69a]">
                      Signal prédictif
                    </p>
                    <p className="mt-1 text-[0.95rem] font-semibold text-[#f1f6f2]">
                      {selectedInsight.title}
                    </p>
                  </div>
                </div>
                <span className="rounded-[8px] border border-white/10 bg-[#0b1512] px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-[#d9e3dc]">
                  {toLabel(selectedInsight.trafficState)}
                </span>
              </div>
              <p className="mt-2 text-[0.78rem] leading-5 text-[#cdd7d0]">
                {selectedInsight.summary}
              </p>
              <p className="mt-2 text-[0.74rem] leading-5 text-[#8fa69a]">
                {selectedInsight.detail}
              </p>
            </div>
          </InfoWindowF>
        ) : null}

        {mode === "country" && USE_FEATURE_LAYER ? (
          <AdminBoundaries
            regions={regionPolygons}
            focusRegionId={focusRegionId ?? null}
            hoveredRegionId={hoveredRegionId}
            onSelectRegion={onSelectRegion}
            onHoverRegion={setHoveredRegionId}
          />
        ) : null}

        {mode === "country" && !USE_FEATURE_LAYER &&
          regionPolygons.map((polygon) => {
            const hovered = polygon.id === hoveredRegionId;
            const color = toneColor[polygon.tone];
            return (
              <PolygonF
                key={`polygon-${polygon.id}`}
                paths={polygon.paths}
                onClick={() => onSelectRegion?.(polygon.id)}
                onMouseOver={() => setHoveredRegionId(polygon.id)}
                onMouseOut={() => setHoveredRegionId(null)}
                options={{
                  fillColor: color,
                  fillOpacity: hovered ? 0.32 : polygon.isWorst ? 0.24 : 0.14,
                  strokeColor: color,
                  strokeOpacity: hovered ? 0.95 : polygon.isWorst ? 0.8 : 0.45,
                  strokeWeight: hovered ? 2.4 : polygon.isWorst ? 2 : 1.2,
                  clickable: true,
                  zIndex: polygon.isWorst ? 4 : hovered ? 5 : 2,
                }}
              />
            );
          })}

        {mode === "country" &&
          regionPolygons
            .filter(
              (polygon) =>
                polygon.isWorst &&
                (polygon.tone === "critical" || polygon.tone === "watch"),
            )
            .map((polygon) => (
              <WorstZonePulse
                key={`worst-pulse-${polygon.id}`}
                position={polygon.center}
                tone={polygon.tone}
              />
            ))}

        {mode === "country" &&
          regionMarkers.map((marker) => (
            <MarkerF
              key={marker.id}
              position={marker.center}
              onClick={() => onSelectRegion?.(marker.id)}
              icon={buildCircleIcon(toneColor[marker.tone], marker.intersectionCount)}
              label={{
                text: marker.name,
                color: "#f1f6f2",
                fontSize: "11px",
                fontWeight: "600",
                className: "command-map-region-label",
              }}
            />
          ))}

        {mode === "region" && focusRegionId
          ? regionPolygons
              .filter((polygon) => polygon.id === focusRegionId)
              .map((polygon) => (
                <PolygonF
                  key={`focus-${polygon.id}`}
                  paths={polygon.paths}
                  options={{
                    fillColor: toneColor[polygon.tone],
                    fillOpacity: 0.1,
                    strokeColor: "#ffb547",
                    strokeOpacity: 0.85,
                    strokeWeight: 2,
                    clickable: false,
                    zIndex: 2,
                  }}
                />
              ))
          : null}

        {mode === "region" &&
          cityMarkers.map((marker) => (
            <MarkerF
              key={marker.id}
              position={marker.center}
              onClick={() => onSelectCity?.(marker.id)}
              icon={buildCircleIcon(toneColor[marker.tone], marker.intersectionCount)}
              label={{
                text: marker.name,
                color: "#f1f6f2",
                fontSize: "11px",
                fontWeight: "600",
                className: "command-map-city-label",
              }}
            />
          ))}
        </GoogleMap>
      </GoogleMapsHost>
    </ScenarioFrame>
  );
}

function ScenarioFrame({
  palette,
  scenarioId,
  children,
}: {
  palette: (typeof scenarioOverlay)[ScenarioId];
  scenarioId: ScenarioId;
  children: React.ReactNode;
}) {
  const label =
    scenarioId === "emergency"
      ? "Emergency"
      : scenarioId === "peak_traffic"
        ? "Peak traffic"
        : null;

  return (
    <div
      className="relative h-full w-full"
      style={
        {
          "--stls-flow-speed": `${palette.flowSpeedMs}ms`,
          boxShadow:
            scenarioId === "normal_traffic"
              ? undefined
              : `inset 0 0 0 1px ${palette.borderGlow}, inset 0 0 80px ${palette.borderGlow}`,
        } as React.CSSProperties
      }
    >
      {children}
      {palette.tint !== "transparent" ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: palette.tint }}
        />
      ) : null}
      {label ? (
        <div
          className={clsx(
            "pointer-events-none absolute right-5 top-5 rounded-[10px] border px-3 py-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.28em] backdrop-blur",
            scenarioId === "emergency"
              ? "border-[#5a1d1d] bg-[#180d0d]/90 text-[#ff9a9a] stls-soft-blink"
              : "border-[#5c4418] bg-[#141008]/90 text-[#ffd089]",
          )}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
}

interface GoogleMapsHostProps {
  apiKey: string;
  fallback: React.ReactNode;
  children: React.ReactNode;
}

function GoogleMapsHost({
  apiKey,
  fallback,
  children,
}: GoogleMapsHostProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: apiKey,
    libraries: GOOGLE_MAPS_LIBRARIES,
    region: GOOGLE_MAPS_REGION,
  });

  const [authFailure, setAuthFailure] = useState(false);
  const origin =
    typeof window === "undefined" ? "" : window.location.origin;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const existing = (
      window as unknown as { gm_authFailure?: () => void }
    ).gm_authFailure;
    (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
      setAuthFailure(true);
    };
    return () => {
      (window as unknown as { gm_authFailure?: () => void }).gm_authFailure =
        existing;
    };
  }, []);

  if (loadError || authFailure) {
    const message = authFailure
      ? "Google rejected this API key. Most common causes: (1) billing is not enabled on the Google Cloud project, (2) the Maps JavaScript API is not activated on the key, (3) the key has HTTP-referrer restrictions that exclude the current origin."
      : loadError?.message ||
        "Check that Maps JavaScript API is enabled on the key, billing is on for the Google Cloud project, and that this origin is allowed.";
    return (
      <div className="relative h-full w-full">
        {fallback}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-4">
          <div className="pointer-events-auto max-w-md rounded-[10px] border border-[#6d2929]/70 bg-[#180d0d]/92 px-4 py-3 shadow-[0_16px_32px_rgba(0,0,0,0.4)] backdrop-blur">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-[#ff8f8f]">
              Google Maps failed to load
            </p>
            <p className="mt-2 text-[0.82rem] leading-5 text-[#f3d5d5]">
              {message}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[0.7rem] leading-5 text-[#caa6a6]">
              <li>
                Enable billing:{" "}
                <a
                  className="font-mono text-[#ffb547] underline"
                  href="https://console.cloud.google.com/billing"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  console.cloud.google.com/billing
                </a>
              </li>
              <li>
                Enable API:{" "}
                <a
                  className="font-mono text-[#ffb547] underline"
                  href="https://console.cloud.google.com/google/maps-apis/api-list"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Maps APIs
                </a>{" "}
                → activate{" "}
                <span className="font-mono">Maps JavaScript API</span>
              </li>
              {origin ? (
                <li>
                  Allow origin{" "}
                  <span className="font-mono text-[#ffb547]">{`${origin}/*`}</span>{" "}
                  on the key&apos;s referrer list, or use a key without referrer restrictions during development.
                </li>
              ) : null}
              <li>
                Or set <span className="font-mono">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=</span> (empty) in{" "}
                <span className="font-mono">frontend/.env.local</span> to hide the map until you have a working key.
              </li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="relative h-full w-full">
        {fallback}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-4">
          <div className="pointer-events-auto rounded-[10px] border border-white/8 bg-[#070b0e]/85 px-3 py-2 backdrop-blur">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-[#ffb547]">
              Loading Google Maps…
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function buildCircleIcon(color: string, count: number) {
  const size = count > 0 ? Math.min(34, 16 + Math.log2(count + 1) * 4) : 14;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="1.6"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${Math.max(2, size / 6)}" fill="${color}"/>
    </svg>
  `;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    anchor:
      typeof window !== "undefined" &&
      typeof (window as unknown as { google?: unknown }).google !== "undefined"
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          new (window as any).google.maps.Point(size / 2, size / 2)
        : undefined,
  };
}

function buildEmojiMarkerIcon(emoji: string, color: string) {
  const size = 40;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="#071018" fill-opacity="0.94" stroke="${color}" stroke-width="2"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 7}" fill="${color}" fill-opacity="0.12"/>
      <text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" font-size="18">${emoji}</text>
    </svg>
  `;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    anchor:
      typeof window !== "undefined" &&
      typeof (window as unknown as { google?: unknown }).google !== "undefined"
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          new (window as any).google.maps.Point(size / 2, size / 2)
        : undefined,
  };
}

interface MapFallbackProps {
  cityCenter: LatLngPoint;
  intersections: IntersectionSnapshot[];
  corridors: CorridorSnapshot[];
  predictionHeat?: CommandPredictionHeatPoint[];
  predictionInsights?: CommandPredictionInsight[];
  overlayMode?: "controllers" | "heatmap";
  selectedIntersectionId?: string;
  onSelectIntersection: (intersectionId: string) => void;
  mode: MapView["mode"];
  regionMarkers: RegionMarker[];
  cityMarkers: CityMarker[];
  regionPolygons: RegionPolygon[];
  focusRegionId?: string;
  onSelectRegion?: (regionId: string) => void;
  onSelectCity?: (cityId: string) => void;
  focusCenter: LatLngPoint;
  showBanners?: boolean;
  flashIntersectionId?: string;
}

function MapFallback({
  cityCenter,
  intersections,
  corridors,
  predictionHeat = [],
  predictionInsights = [],
  overlayMode = "controllers",
  selectedIntersectionId,
  onSelectIntersection,
  mode,
  regionMarkers,
  cityMarkers,
  regionPolygons,
  focusRegionId,
  onSelectRegion,
  onSelectCity,
  focusCenter,
  showBanners = true,
  flashIntersectionId,
}: MapFallbackProps) {
  const [hoveredFallbackRegion, setHoveredFallbackRegion] = useState<
    string | null
  >(null);
  const [selectedFallbackInsightId, setSelectedFallbackInsightId] = useState<
    string | null
  >(null);
  const points = useMemo(() => {
    if (mode === "country") {
      if (regionPolygons.length > 0) {
        return regionPolygons.flatMap((polygon) => polygon.paths);
      }
      return regionMarkers.map((marker) => marker.center);
    }
    if (mode === "region") {
      return cityMarkers.length > 0
        ? cityMarkers.map((marker) => marker.center)
        : [focusCenter];
    }
    return [
      cityCenter,
      ...intersections.map((intersection) => intersection.location),
      ...corridors.flatMap((corridor) => corridor.path),
      ...predictionHeat.map((entry) => entry.location),
      ...predictionInsights.map((entry) => entry.location),
    ];
  }, [
    mode,
    regionPolygons,
    regionMarkers,
    cityMarkers,
    focusCenter,
    cityCenter,
    intersections,
    corridors,
    predictionHeat,
    predictionInsights,
  ]);

  const bounds = useMemo(() => {
    const reference = points.length > 0 ? points : [focusCenter];
    const latitudes = reference.map((point) => point.lat);
    const longitudes = reference.map((point) => point.lng);
    const latSpan = Math.max(0.2, Math.max(...latitudes) - Math.min(...latitudes));
    const lngSpan = Math.max(0.2, Math.max(...longitudes) - Math.min(...longitudes));
    return {
      maxLat: Math.max(...latitudes) + latSpan * 0.08,
      minLat: Math.min(...latitudes) - latSpan * 0.08,
      maxLng: Math.max(...longitudes) + lngSpan * 0.08,
      minLng: Math.min(...longitudes) - lngSpan * 0.08,
    };
  }, [points, focusCenter]);

  const translatePoint = (point: LatLngPoint) => {
    const left =
      ((point.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100;
    const top =
      ((bounds.maxLat - point.lat) / (bounds.maxLat - bounds.minLat)) * 100;

    return { left, top };
  };

  const latSpanMetres = Math.max(
    1,
    (bounds.maxLat - bounds.minLat) * 111_320,
  );
  const lngSpanMetres = Math.max(
    1,
    (bounds.maxLng - bounds.minLng) *
      111_320 *
      Math.cos((focusCenter.lat * Math.PI) / 180),
  );
  const selectedFallbackInsight =
    predictionInsights.find((entry) => entry.id === selectedFallbackInsightId) ??
    null;
  const showOperationalLayer = mode !== "country";
  const showControllerLayer = showOperationalLayer && overlayMode === "controllers";
  const showHeatLayer = showOperationalLayer && overlayMode === "heatmap";

  const lineSegments =
    showControllerLayer
      ? corridors.flatMap((corridor) =>
          corridor.path.slice(0, -1).map((point, index) => {
            const nextPoint = corridor.path[index + 1];
            const from = translatePoint(point);
            const to = translatePoint(nextPoint);
            const dx = to.left - from.left;
            const dy = to.top - from.top;

            return {
              id: `${corridor.id}-${index}`,
              color: corridorColorByState[corridor.state],
              length: Math.sqrt(dx * dx + dy * dy),
              angle: Math.atan2(dy, dx) * (180 / Math.PI),
              left: from.left,
              top: from.top,
            };
          }),
        )
      : [];

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#070b0d]">
      <div className="absolute inset-0 bg-[#050907]" />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,181,71,0.08),transparent_26%),linear-gradient(315deg,rgba(57,217,138,0.08),transparent_34%),linear-gradient(180deg,transparent_0%,rgba(0,0,0,0.38)_100%)]" />
      <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:72px_72px]" />
      <div className="absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-[#020403]/70 to-transparent" />
      <div className="absolute inset-y-0 right-0 w-28 bg-gradient-to-l from-[#020403]/70 to-transparent" />

      {lineSegments.map((segment) => (
        <div
          key={segment.id}
          className="absolute h-[6px] rounded-full opacity-90 shadow-[0_0_18px_rgba(0,0,0,0.25)]"
          style={{
            backgroundColor: segment.color,
            left: `${segment.left}%`,
            top: `${segment.top}%`,
            width: `${segment.length}%`,
            transform: `translateY(-50%) rotate(${segment.angle}deg)`,
            transformOrigin: "0 50%",
          }}
        >
          <span
            aria-hidden
            className="absolute inset-0 rounded-full opacity-70 mix-blend-screen"
            style={{
              background: `repeating-linear-gradient(90deg, rgba(10,15,18,0.75) 0 8px, transparent 8px 22px)`,
              animation: "stls-flow-dash 900ms linear infinite",
            }}
          />
        </div>
      ))}

      {showHeatLayer &&
        predictionHeat.map((entry) => {
          const position = translatePoint(entry.location);
          const layers =
            entry.trafficState === "congestion"
              ? [
                  { suffix: "outer", scale: 1.8, color: "#2bd6ff", opacity: 0.12, blur: 18 },
                  { suffix: "mid", scale: 1.34, color: "#61f06c", opacity: 0.16, blur: 14 },
                  { suffix: "warm", scale: 0.96, color: "#fff04a", opacity: 0.24, blur: 10 },
                  { suffix: "hot", scale: 0.62, color: "#ff5d41", opacity: 0.34, blur: 8 },
                  { suffix: "core", scale: 0.38, color: "#ff2a2a", opacity: 0.48, blur: 4 },
                ]
              : entry.trafficState === "pressure"
                ? [
                    { suffix: "outer", scale: 1.5, color: "#2bd6ff", opacity: 0.1, blur: 16 },
                    { suffix: "mid", scale: 1.08, color: "#74f47a", opacity: 0.13, blur: 12 },
                    { suffix: "warm", scale: 0.72, color: "#ffe75b", opacity: 0.19, blur: 8 },
                    { suffix: "hot", scale: 0.42, color: "#ff9f3e", opacity: 0.24, blur: 5 },
                  ]
                : [
                    { suffix: "outer", scale: 1.24, color: "#42ceff", opacity: 0.08, blur: 12 },
                    { suffix: "mid", scale: 0.86, color: "#67ef9c", opacity: 0.12, blur: 8 },
                    { suffix: "core", scale: 0.5, color: "#c8ff63", opacity: 0.16, blur: 4 },
                  ];

          return layers.map((layer) => {
            const width = Math.max(
              6,
              ((entry.radiusMetres * 2 * layer.scale) * 100) / lngSpanMetres,
            );
            const height = Math.max(
              6,
              ((entry.radiusMetres * 2 * layer.scale) * 100) / latSpanMetres,
            );
            return (
              <div
                key={`fallback-heat-${entry.id}-${layer.suffix}`}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${position.left}%`,
                  top: `${position.top}%`,
                  width: `${width}%`,
                  height: `${height}%`,
                  backgroundColor: layer.color,
                  opacity: layer.opacity,
                  filter: `blur(${layer.blur}px)`,
                }}
              />
            );
          });
        })}

      {showControllerLayer &&
        predictionInsights.map((entry) => {
          const position = translatePoint(entry.location);
          return (
            <button
              key={`fallback-insight-${entry.id}`}
              type="button"
              onClick={() =>
                setSelectedFallbackInsightId((current) =>
                  current === entry.id ? null : entry.id,
                )
              }
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/14 bg-[#07100d]/92 p-2 text-lg shadow-[0_16px_28px_rgba(0,0,0,0.34)] transition hover:scale-105"
              style={{
                left: `${position.left}%`,
                top: `${position.top}%`,
                boxShadow: `0 0 0 1px ${corridorColorByState[entry.trafficState]}44, 0 18px 32px rgba(0,0,0,0.38)`,
              }}
              aria-label={entry.title}
            >
              <span aria-hidden>{entry.emoji}</span>
            </button>
          );
        })}

      {showControllerLayer &&
        intersections.map((intersection) => {
          const position = translatePoint(intersection.location);
          const isSelected = intersection.id === selectedIntersectionId;
          const isCritical = intersection.status === "critical";
          const isFlashed = intersection.id === flashIntersectionId;

          return (
            <button
              key={intersection.id}
              type="button"
              onClick={() => onSelectIntersection(intersection.id)}
              className="group absolute -translate-x-1/2 -translate-y-1/2 text-left transition duration-200 hover:z-20 hover:scale-110"
              style={{
                left: `${position.left}%`,
                top: `${position.top}%`,
              }}
            >
              <span className="relative grid h-8 w-8 place-items-center">
                {isFlashed ? (
                  <span
                    key={`flash-${flashIntersectionId}`}
                    aria-hidden
                    className="stls-pulse-ring absolute inset-[-18px] rounded-full"
                    style={{
                      backgroundColor: "#ffb547",
                      opacity: 0.55,
                    }}
                  />
                ) : null}
                {isCritical ? (
                  <span
                    aria-hidden
                    className="stls-pulse-ring absolute inset-[-12px] rounded-full"
                    style={{
                      backgroundColor: toneColor[intersection.status],
                      opacity: 0.35,
                    }}
                  />
                ) : null}
                <span
                  className={clsx(
                    "relative grid h-8 w-8 place-items-center rounded-full border transition",
                    isSelected
                      ? "border-[#ffb547]/80 bg-[#ffb547]/10 shadow-[0_0_0_8px_rgba(255,181,71,0.08)]"
                      : "border-white/16 bg-black/36 group-hover:border-white/35",
                  )}
                >
                  <span
                    className="block h-4 w-4 rounded-full border border-[#05070a]"
                    style={{
                      backgroundColor: toneColor[intersection.status],
                    }}
                  />
                </span>
              </span>
              <span
                className={clsx(
                  "mt-2 block max-w-[158px] truncate rounded-[8px] border px-3 py-1 text-xs font-semibold transition",
                  isSelected
                    ? "border-[#3c2e10] bg-[#14100a] text-[#ffb547]"
                    : "border-white/10 bg-black/45 text-[#d3ddd6] group-hover:border-white/25 group-hover:text-[#f1f6f2]",
                )}
              >
                {intersection.name}
              </span>
            </button>
          );
        })}

      {mode === "country" &&
        regionPolygons.map((polygon) => {
          const nw = translatePoint({ lat: polygon.paths[0].lat, lng: polygon.paths[0].lng });
          const se = translatePoint({ lat: polygon.paths[2].lat, lng: polygon.paths[2].lng });
          const left = Math.min(nw.left, se.left);
          const top = Math.min(nw.top, se.top);
          const width = Math.abs(se.left - nw.left);
          const height = Math.abs(se.top - nw.top);
          const color = toneColor[polygon.tone];
          const hovered = hoveredFallbackRegion === polygon.id;
          const focused = polygon.id === focusRegionId;
          return (
            <button
              key={`poly-${polygon.id}`}
              type="button"
              onClick={() => onSelectRegion?.(polygon.id)}
              onMouseEnter={() => setHoveredFallbackRegion(polygon.id)}
              onMouseLeave={() => setHoveredFallbackRegion(null)}
              className={clsx(
                "absolute transition duration-200 hover:z-10",
                polygon.isWorst && polygon.tone !== "healthy"
                  ? "stls-soft-blink"
                  : "",
              )}
              style={{
                left: `${left}%`,
                top: `${top}%`,
                width: `${width}%`,
                height: `${height}%`,
                border: `${hovered ? 2 : polygon.isWorst ? 1.6 : 1}px solid ${color}`,
                backgroundColor: `${color}${hovered ? "3a" : focused ? "30" : polygon.isWorst ? "28" : "18"}`,
                borderRadius: 6,
                boxShadow: focused
                  ? "0 0 0 1px rgba(255,181,71,0.6), 0 0 18px rgba(255,181,71,0.22)"
                  : undefined,
                cursor: "pointer",
              }}
            />
          );
        })}

      {mode === "country" &&
        regionMarkers.map((marker) => {
          const position = translatePoint(marker.center);
          const size = 14 + Math.log2(marker.intersectionCount + 1) * 4;
          return (
            <button
              key={marker.id}
              type="button"
              onClick={() => onSelectRegion?.(marker.id)}
              className="absolute -translate-x-1/2 -translate-y-1/2 text-left transition duration-200 hover:z-20 hover:scale-110"
              style={{ left: `${position.left}%`, top: `${position.top}%` }}
            >
              <span
                className="grid place-items-center rounded-full border"
                style={{
                  width: `${size}px`,
                  height: `${size}px`,
                  borderColor: toneColor[marker.tone],
                  backgroundColor: `${toneColor[marker.tone]}24`,
                }}
              >
                <span
                  className="block rounded-full"
                  style={{
                    width: `${Math.max(4, size / 3)}px`,
                    height: `${Math.max(4, size / 3)}px`,
                    backgroundColor: toneColor[marker.tone],
                  }}
                />
              </span>
              <span className="mt-1 block max-w-[180px] truncate rounded-[6px] border border-white/10 bg-black/55 px-2 py-0.5 text-[0.68rem] font-semibold text-[#edf3ee]">
                {marker.name}
                {marker.intersectionCount > 0 ? (
                  <span className="ml-1 text-[#ffb547]">· {marker.intersectionCount}</span>
                ) : null}
              </span>
            </button>
          );
        })}

      {mode === "region" &&
        cityMarkers.map((marker) => {
          const position = translatePoint(marker.center);
          const size = 14 + Math.log2(marker.intersectionCount + 1) * 4;
          return (
            <button
              key={marker.id}
              type="button"
              onClick={() => onSelectCity?.(marker.id)}
              className="absolute -translate-x-1/2 -translate-y-1/2 text-left transition duration-200 hover:z-20 hover:scale-110"
              style={{ left: `${position.left}%`, top: `${position.top}%` }}
            >
              <span
                className="grid place-items-center rounded-full border"
                style={{
                  width: `${size}px`,
                  height: `${size}px`,
                  borderColor: toneColor[marker.tone],
                  backgroundColor: `${toneColor[marker.tone]}24`,
                }}
              >
                <span
                  className="block rounded-full"
                  style={{
                    width: `${Math.max(4, size / 3)}px`,
                    height: `${Math.max(4, size / 3)}px`,
                    backgroundColor: toneColor[marker.tone],
                  }}
                />
              </span>
              <span className="mt-1 block max-w-[180px] truncate rounded-[6px] border border-white/10 bg-black/55 px-2 py-0.5 text-[0.68rem] font-semibold text-[#edf3ee]">
                {marker.name}
                {marker.intersectionCount > 0 ? (
                  <span className="ml-1 text-[#ffb547]">· {marker.intersectionCount}</span>
                ) : null}
              </span>
            </button>
          );
        })}

      {showBanners ? (
        <>
          <div className="absolute left-5 top-5 max-w-xs rounded-[8px] border border-white/10 bg-[#07100d]/82 px-4 py-3 backdrop-blur">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-[#ffb547]">
              Map fallback
            </p>
            <p className="mt-2 max-w-xs text-sm text-[#e9edea]">
              Google Maps activates automatically after setting
              <span className="ml-1 rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs text-[#ffb547]">
                NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
              </span>
              .
            </p>
          </div>

          <div className="absolute bottom-5 right-5 rounded-[8px] border border-white/10 bg-[#07100d]/82 px-4 py-3 backdrop-blur">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#7c8b83]">
              Level
            </p>
            <p className="mt-1 text-sm font-semibold text-[#edf3ee]">{toLabel(mode)}</p>
          </div>
        </>
      ) : null}

      {showControllerLayer && selectedFallbackInsight ? (
        <div className="absolute bottom-5 left-1/2 z-20 w-[min(420px,calc(100%-2rem))] -translate-x-1/2 rounded-[12px] border border-white/10 bg-[#07100d]/92 px-4 py-3 shadow-[0_22px_40px_rgba(0,0,0,0.42)] backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xl" aria-hidden>
                {selectedFallbackInsight.emoji}
              </span>
              <div>
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-[#8fa69a]">
                  Signal prédictif
                </p>
                <p className="mt-1 text-[0.92rem] font-semibold text-[#edf3ee]">
                  {selectedFallbackInsight.title}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedFallbackInsightId(null)}
              className="rounded-[8px] border border-white/10 px-2 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-[#cdd7d0] transition hover:border-white/20 hover:text-[#edf3ee]"
            >
              Fermer
            </button>
          </div>
          <p className="mt-2 text-[0.78rem] leading-5 text-[#cdd7d0]">
            {selectedFallbackInsight.summary}
          </p>
          <p className="mt-2 text-[0.74rem] leading-5 text-[#8fa69a]">
            {selectedFallbackInsight.detail}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function toLabel(value: string) {
  return value
    .split(/[_-]/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-white/8 bg-[#0b1512] px-2.5 py-2">
      <p className="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-[#8fa69a]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[#f1f6f2]">{value}</p>
    </div>
  );
}

function SmoothPan({ center, zoom }: { center: LatLngPoint; zoom: number }) {
  const map = useGoogleMap();
  const lat = center.lat;
  const lng = center.lng;

  useEffect(() => {
    if (!map) return;
    try {
      map.panTo({ lat, lng });
    } catch {
      map.setCenter({ lat, lng });
    }
  }, [map, lat, lng]);

  useEffect(() => {
    if (!map) return;
    const current = map.getZoom();
    if (current === undefined || Math.abs(current - zoom) < 0.25) {
      return;
    }
    const step = current < zoom ? 1 : -1;
    let next = Math.round(current);
    const tick = () => {
      next += step;
      if ((step > 0 && next >= zoom) || (step < 0 && next <= zoom)) {
        map.setZoom(zoom);
        return;
      }
      map.setZoom(next);
      window.setTimeout(tick, 90);
    };
    window.setTimeout(tick, 90);
  }, [map, zoom]);

  return null;
}

function WorstZonePulse({
  position,
  tone,
}: {
  position: LatLngPoint;
  tone: IntersectionHealth;
}) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => {
      const elapsed = (performance.now() - start) / 1000;
      setPhase((Math.sin(elapsed * 1.5) + 1) / 2);
    }, 110);
    return () => clearInterval(id);
  }, []);

  const color = tone === "critical" ? "#ff5f5f" : "#ffb547";
  const innerMeters = 22000 + phase * 14000;
  const outerMeters = 60000 + phase * 40000;

  return (
    <>
      <CircleF
        center={position}
        radius={outerMeters}
        options={{
          fillColor: color,
          fillOpacity: 0.05 + phase * 0.06,
          strokeColor: color,
          strokeOpacity: 0.2 + phase * 0.2,
          strokeWeight: 1.1,
          clickable: false,
          zIndex: 3,
        }}
      />
      <CircleF
        center={position}
        radius={innerMeters}
        options={{
          fillColor: color,
          fillOpacity: 0.1 + phase * 0.12,
          strokeColor: color,
          strokeOpacity: 0.45 + phase * 0.3,
          strokeWeight: 1.2,
          clickable: false,
          zIndex: 3,
        }}
      />
    </>
  );
}

function CommandFlash({ position }: { position: LatLngPoint }) {
  const [phase, setPhase] = useState(1);

  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => {
      const elapsed = (performance.now() - start) / 1000;
      const decayed = Math.max(0, 1 - elapsed / 1.2);
      setPhase(decayed);
      if (decayed <= 0) clearInterval(id);
    }, 60);
    return () => clearInterval(id);
  }, []);

  if (phase <= 0) return null;

  const radius = 90 + (1 - phase) * 140;

  return (
    <CircleF
      center={position}
      radius={radius}
      options={{
        fillColor: "#ffb547",
        fillOpacity: 0.18 * phase,
        strokeColor: "#ffb547",
        strokeOpacity: 0.55 * phase + 0.3,
        strokeWeight: 2,
        clickable: false,
        zIndex: 30,
      }}
    />
  );
}

function CriticalPulse({ position }: { position: LatLngPoint }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => {
      const elapsed = (performance.now() - start) / 1000;
      setPhase((Math.sin(elapsed * 2.6) + 1) / 2);
    }, 55);
    return () => clearInterval(id);
  }, []);

  const inner = 60 + phase * 40;
  const outer = 140 + phase * 120;

  return (
    <>
      <CircleF
        center={position}
        radius={outer}
        options={{
          fillColor: "#ff5f5f",
          fillOpacity: 0.08 + phase * 0.1,
          strokeColor: "#ff5f5f",
          strokeOpacity: 0.25 + phase * 0.25,
          strokeWeight: 1.2,
          clickable: false,
          zIndex: 5,
        }}
      />
      <CircleF
        center={position}
        radius={inner}
        options={{
          fillColor: "#ff5f5f",
          fillOpacity: 0.18 + phase * 0.22,
          strokeColor: "#ff5f5f",
          strokeOpacity: 0.6,
          strokeWeight: 1.2,
          clickable: false,
          zIndex: 6,
        }}
      />
    </>
  );
}
