"use client";

import clsx from "clsx";
import {
  GoogleMap,
  MarkerF,
  PolylineF,
  useJsApiLoader,
} from "@react-google-maps/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  useStudioBackendIntersections,
  useStudioMapCarrefours,
  useStudioNetworkLinks,
} from "@/components/studio/project-context";
import {
  GOOGLE_MAPS_LIBRARIES,
  GOOGLE_MAPS_LOADER_ID,
  GOOGLE_MAPS_REGION,
} from "@/lib/google-maps-loader";
import {
  addIntersectionLink,
  addMapCarrefour,
  bearingDeg,
  distanceMetres,
  makeCarrefourId,
  makeLinkId,
  removeIntersectionLink,
  removeMapCarrefour,
  setIntersectionLinks,
  suggestLinks,
} from "@/lib/network-store";
import { findNearestCity, moroccoGeography } from "@/lib/morocco-geography";
import type { EngineeringIntersectionRecord } from "@/types/engineering-studio";
import type {
  IntersectionLink,
  IntersectionLinkKind,
} from "@/types/network";

interface NetworkWorkspaceProps {
  onOpenIntersection?: (record: EngineeringIntersectionRecord) => void;
}

type Tool = "select" | "create" | "link";

const LINK_STYLE: Record<
  IntersectionLinkKind,
  { stroke: string; weight: number; dash?: number[] }
> = {
  road: { stroke: "#39d98a", weight: 4 },
  corridor: { stroke: "#ffb547", weight: 5 },
  suggested: { stroke: "#8ed2ef", weight: 2, dash: [4, 6] },
};

const CASABLANCA_CENTER = { lat: 33.5876, lng: -7.6114 };

export function NetworkWorkspace({
  onOpenIntersection,
}: NetworkWorkspaceProps) {
  const backend = useStudioBackendIntersections();
  const mapCarrefours = useStudioMapCarrefours();
  const links = useStudioNetworkLinks();

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    id: GOOGLE_MAPS_LOADER_ID,
    libraries: GOOGLE_MAPS_LIBRARIES,
    region: GOOGLE_MAPS_REGION,
  });

  const [tool, setTool] = useState<Tool>("select");
  const [linkStart, setLinkStart] = useState<string | null>(null);
  const [pendingLinkKind, setPendingLinkKind] =
    useState<IntersectionLinkKind>("road");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: "info" | "error"; text: string } | null>(
    null,
  );
  const [newCarrefourName, setNewCarrefourName] = useState("");
  const mapRef = useRef<google.maps.Map | null>(null);

  // Unified list of "nodes" the map knows about — whether from backend
  // or from the local map-created carrefours.  Both are plotted as
  // markers and both can participate in links.
  const nodes = useMemo(() => {
    const out: Array<{
      id: string;
      code: string;
      name: string;
      location: { lat: number; lng: number };
      isMap: boolean;
    }> = [];
    for (const intersection of backend) {
      const lat = Number(intersection.latitude);
      const lng = Number(intersection.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      out.push({
        id: intersection.id,
        code: intersection.code,
        name: intersection.name,
        location: { lat, lng },
        isMap: false,
      });
    }
    for (const carrefour of mapCarrefours) {
      // Defensive guard: a carrefour with NaN/null coordinates (e.g.
      // from a half-completed upstream record) would otherwise reach
      // <MarkerF position={...}/> below and trigger setPosition errors
      // from the Google Maps SDK.
      const lat = Number(carrefour.location?.lat);
      const lng = Number(carrefour.location?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      out.push({
        id: carrefour.id,
        code: carrefour.code,
        name: carrefour.name,
        location: { lat, lng },
        isMap: true,
      });
    }
    return out;
  }, [backend, mapCarrefours]);

  const nodeById = useMemo(() => {
    const m = new Map<string, (typeof nodes)[number]>();
    for (const node of nodes) m.set(node.id, node);
    return m;
  }, [nodes]);

  const center = useMemo(() => {
    // Prefer the most recently added valid carrefour, then the centroid
    // of all valid nodes, then a hard-coded city fallback. Every branch
    // returns finite numbers — the GoogleMap setCenter call must never
    // see NaN.
    for (let i = mapCarrefours.length - 1; i >= 0; i -= 1) {
      const candidate = mapCarrefours[i]!.location;
      const lat = Number(candidate?.lat);
      const lng = Number(candidate?.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
      }
    }
    if (nodes.length === 0) return CASABLANCA_CENTER;
    const sum = nodes.reduce(
      (acc, node) => ({
        lat: acc.lat + node.location.lat,
        lng: acc.lng + node.location.lng,
      }),
      { lat: 0, lng: 0 },
    );
    const lat = sum.lat / nodes.length;
    const lng = sum.lng / nodes.length;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return CASABLANCA_CENTER;
    }
    return { lat, lng };
  }, [mapCarrefours, nodes]);

  const linksWithCoords = useMemo(() => {
    return links
      .map((link) => {
        const from = nodeById.get(link.fromIntersectionId);
        const to = nodeById.get(link.toIntersectionId);
        if (!from || !to) return null;
        return {
          link,
          from,
          to,
          path: link.path ?? [from.location, to.location],
        };
      })
      .filter((entry): entry is {
        link: IntersectionLink;
        from: (typeof nodes)[number];
        to: (typeof nodes)[number];
        path: Array<{ lat: number; lng: number }>;
      } => entry !== null);
  }, [links, nodeById]);

  const selected = selectedId ? nodeById.get(selectedId) ?? null : null;
  const selectedLinks = useMemo(
    () =>
      linksWithCoords.filter(
        (entry) =>
          entry.link.fromIntersectionId === selectedId ||
          entry.link.toIntersectionId === selectedId,
      ),
    [linksWithCoords, selectedId],
  );

  useEffect(() => {
    if (!selectedId) return;
    if (!nodeById.has(selectedId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedId(null);
    }
  }, [nodeById, selectedId]);

  const handleMapClick = useCallback(
    (event: google.maps.MapMouseEvent) => {
      if (tool !== "create") return;
      const lat = event.latLng?.lat();
      const lng = event.latLng?.lng();
      if (lat == null || lng == null) return;
      const name =
        newCarrefourName.trim() ||
        `Carrefour ${mapCarrefours.length + 1}`;
      const id = makeCarrefourId();
      const code = name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "-")
        .slice(0, 24);
      const city = findNearestCity({ lat, lng });
      const now = new Date().toISOString();
      addMapCarrefour({
        id,
        code: code || id,
        name,
        location: { lat, lng },
        city: city?.name ?? null,
        cityId: city?.id ?? null,
        regionId: city?.regionId ?? null,
        district: city?.name ?? null,
        source: "map",
        createdAt: now,
      });
      setNewCarrefourName("");
      setBanner({ tone: "info", text: `Carrefour "${name}" ajouté sur la carte.` });
      setSelectedId(id);
    },
    [mapCarrefours.length, newCarrefourName, tool],
  );

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (tool === "link") {
        if (!linkStart) {
          setLinkStart(nodeId);
          setBanner({
            tone: "info",
            text: `Pick a second carrefour to link with ${nodeById.get(nodeId)?.name ?? nodeId}.`,
          });
          return;
        }
        if (linkStart === nodeId) {
          setLinkStart(null);
          setBanner({ tone: "info", text: "Link cancelled." });
          return;
        }
        const from = nodeById.get(linkStart);
        const to = nodeById.get(nodeId);
        if (!from || !to) {
          setBanner({ tone: "error", text: "Unknown endpoint." });
          return;
        }
        const distance = distanceMetres(from.location, to.location);
        addIntersectionLink({
          id: makeLinkId(pendingLinkKind),
          fromIntersectionId: from.id,
          toIntersectionId: to.id,
          kind: pendingLinkKind,
          distanceMetres: Math.round(distance),
          bearingDeg: bearingDeg(from.location, to.location),
          createdAt: new Date().toISOString(),
        });
        setBanner({
          tone: "info",
          text: `Link ${from.name} ↔ ${to.name} (${Math.round(distance)} m).`,
        });
        setLinkStart(null);
        return;
      }

      setSelectedId(nodeId);
    },
    [linkStart, nodeById, pendingLinkKind, tool],
  );

  const handleAutoSuggest = useCallback(() => {
    if (nodes.length < 2) {
      setBanner({
        tone: "error",
        text: "Need at least two carrefours to suggest links.",
      });
      return;
    }
    const newLinks = suggestLinks(nodes, links, {
      maxNeighbors: 3,
      maxRadiusMetres: 800,
    });
    if (newLinks.length === 0) {
      setBanner({
        tone: "info",
        text: "No new suggestions — every carrefour already has its closest neighbours linked.",
      });
      return;
    }
    setIntersectionLinks([...links, ...newLinks]);
    setBanner({
      tone: "info",
      text: `${newLinks.length} suggested link(s) added.`,
    });
  }, [links, nodes]);

  const handleDeleteSelected = useCallback(() => {
    if (!selected) return;
    if (!selected.isMap) {
      setBanner({
        tone: "error",
        text: "Cannot delete backend intersections from here.",
      });
      return;
    }
    removeMapCarrefour(selected.id);
    setSelectedId(null);
  }, [selected]);

  const regionsInUse = useMemo(() => {
    const seen = new Set<string>();
    for (const carrefour of mapCarrefours) {
      if (carrefour.regionId) seen.add(carrefour.regionId);
    }
    return seen;
  }, [mapCarrefours]);

  if (!apiKey) {
    return (
      <div className="grid h-full place-items-center bg-surface-0 px-10 text-center">
        <div className="max-w-md space-y-3 text-[0.82rem] text-ink-2">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.24em] text-accent-ink">
            Network map
          </p>
          <h2 className="text-[1.1rem] font-semibold text-ink-1">
            Google Maps API key missing
          </h2>
          <p>
            Set <code className="rounded bg-surface-2 px-1 py-0.5 text-[0.72rem]">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>{" "}
            in <code>.env.local</code> and reload to enable the carrefour network view.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_320px] bg-surface-0">
      <div className="relative min-h-0 border-r border-stroke-0">
        <div className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-[10px] border border-stroke-0 bg-surface-1/95 p-1 shadow-md">
          {(
            [
              { id: "select", label: "Select" },
              { id: "create", label: "Create carrefour" },
              { id: "link", label: "Link" },
            ] as Array<{ id: Tool; label: string }>
          ).map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                setTool(entry.id);
                setLinkStart(null);
              }}
              className={clsx(
                "rounded-[6px] px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] transition",
                tool === entry.id
                  ? "bg-accent-surface text-accent-ink"
                  : "text-ink-2 hover:bg-hover hover:text-ink-0",
              )}
            >
              {entry.label}
            </button>
          ))}
          <span aria-hidden className="mx-1 h-5 w-px bg-stroke-1" />
          <select
            value={pendingLinkKind}
            onChange={(event) =>
              setPendingLinkKind(event.target.value as IntersectionLinkKind)
            }
            className="rounded-[6px] bg-surface-2 px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-1 outline-none"
            title="Link kind to apply when you click two carrefours"
          >
            <option value="road">road</option>
            <option value="corridor">corridor</option>
            <option value="suggested">suggested</option>
          </select>
          <button
            type="button"
            onClick={handleAutoSuggest}
            className="rounded-[6px] border border-accent-stroke bg-accent-surface px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-accent-ink transition hover:brightness-110"
          >
            Auto-suggest
          </button>
        </div>

        {tool === "create" ? (
          <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-[10px] border border-stroke-0 bg-surface-1/95 px-3 py-2 shadow-md">
            <label className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-ink-3">
              Nom
            </label>
            <input
              type="text"
              value={newCarrefourName}
              onChange={(event) => setNewCarrefourName(event.target.value)}
              placeholder="Carrefour Zerktouni × Gandhi"
              className="w-64 rounded-[6px] border border-stroke-0 bg-surface-2 px-2 py-1 text-[0.76rem] text-ink-1 outline-none"
            />
            <span className="text-[0.66rem] text-ink-3">
              Click on the map to place it
            </span>
          </div>
        ) : null}

        {loadError ? (
          <div className="grid h-full place-items-center text-[0.82rem] text-danger-ink">
            Map failed to load: {loadError.message}
          </div>
        ) : !isLoaded ? (
          <div className="grid h-full place-items-center text-[0.82rem] text-ink-3">
            Loading Google Maps…
          </div>
        ) : (
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "100%" }}
            center={center}
            zoom={14}
            onLoad={(map) => {
              mapRef.current = map;
            }}
            onClick={handleMapClick}
            options={{
              mapTypeId: "roadmap",
              disableDefaultUI: false,
              clickableIcons: false,
            }}
          >
            {linksWithCoords.map((entry) => {
              const style = LINK_STYLE[entry.link.kind];
              return (
                <PolylineF
                  key={entry.link.id}
                  path={entry.path}
                  options={{
                    strokeColor: style.stroke,
                    strokeWeight: style.weight,
                    strokeOpacity:
                      entry.link.kind === "suggested" ? 0 : 0.9,
                    icons: style.dash
                      ? [
                          {
                            icon: {
                              path: "M 0,-1 0,1",
                              strokeOpacity: 1,
                              scale: 3,
                              strokeColor: style.stroke,
                            },
                            offset: "0",
                            repeat: `${style.dash[0]! + style.dash[1]!}px`,
                          },
                        ]
                      : undefined,
                  }}
                />
              );
            })}
            {nodes.map((node) => (
              <MarkerF
                key={node.id}
                position={node.location}
                onClick={() => handleNodeClick(node.id)}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: node.id === selectedId ? 9 : 7,
                  fillColor: node.isMap ? "#ffb547" : "#39d98a",
                  fillOpacity: 1,
                  strokeColor: "#0a0d10",
                  strokeWeight: 2,
                }}
                title={`${node.name} · ${node.code}${node.isMap ? " · map" : ""}`}
              />
            ))}
          </GoogleMap>
        )}

        {banner ? (
          <div
            className={clsx(
              "absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-[6px] px-3 py-1 text-[0.72rem] font-semibold shadow",
              banner.tone === "error"
                ? "bg-danger-surface text-danger-ink"
                : "bg-accent-surface text-accent-ink",
            )}
          >
            {banner.text}
          </div>
        ) : null}
      </div>

      <aside className="flex min-h-0 flex-col overflow-y-auto">
        <section className="border-b border-stroke-0 px-4 py-3">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
            Network overview
          </p>
          <ul className="mt-2 space-y-1 text-[0.76rem] text-ink-2">
            <li className="flex items-center justify-between">
              <span>Backend intersections</span>
              <span className="font-mono text-ink-1">{backend.length}</span>
            </li>
            <li className="flex items-center justify-between">
              <span>Map-created carrefours</span>
              <span className="font-mono text-accent-ink">
                {mapCarrefours.length}
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span>Links (total)</span>
              <span className="font-mono text-ink-1">{links.length}</span>
            </li>
            <li className="flex items-center justify-between">
              <span>Regions covered</span>
              <span className="font-mono text-ink-1">{regionsInUse.size}</span>
            </li>
          </ul>
        </section>

        <section className="border-b border-stroke-0 px-4 py-3">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
            Selected carrefour
          </p>
          {selected ? (
            <div className="mt-2 space-y-1 text-[0.78rem]">
              <p className="font-semibold text-ink-0">{selected.name}</p>
              <p className="text-ink-2">
                {selected.code} ·{" "}
                {selected.isMap ? "Local (map)" : "Backend"}
              </p>
              <p className="text-[0.7rem] text-ink-3">
                {selected.location.lat.toFixed(5)},{" "}
                {selected.location.lng.toFixed(5)}
              </p>
              <div className="mt-2 flex items-center gap-2">
                {onOpenIntersection ? (
                  <button
                    type="button"
                    onClick={() => {
                      const record = [...backend, null].find(
                        (entry) => entry?.id === selected.id,
                      );
                      if (record) {
                        onOpenIntersection(record);
                      } else {
                        // A map carrefour — synthesize the record on the fly.
                        onOpenIntersection({
                          id: selected.id,
                          code: selected.code,
                          name: selected.name,
                          district: "",
                          address: "",
                          latitude: selected.location.lat,
                          longitude: selected.location.lng,
                          controlMode: "adaptive",
                          status: "healthy",
                          queueLength: 0,
                          incidents: 0,
                          averageDelaySeconds: 0,
                          lastHeartbeat: null,
                          controllers: [],
                          detectors: [],
                          phases: [],
                          timingPlans: [],
                          deployments: [],
                        });
                      }
                    }}
                    className="rounded-[6px] border border-accent-stroke bg-accent-surface px-2 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-accent-ink transition hover:brightness-110"
                  >
                    Open in Workbench
                  </button>
                ) : null}
                {selected.isMap ? (
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    className="rounded-[6px] border border-sig-red-stroke bg-sig-red-surface px-2 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-sig-red-ink transition hover:brightness-110"
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[0.74rem] text-ink-3">
              Click a marker to inspect.
            </p>
          )}
        </section>

        <section className="border-b border-stroke-0 px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
              Neighbours
            </p>
            {selected ? (
              <span className="text-[0.66rem] text-ink-3">
                {selectedLinks.length} link(s)
              </span>
            ) : null}
          </div>
          {selected && selectedLinks.length > 0 ? (
            <ul className="mt-2 space-y-1 text-[0.72rem]">
              {selectedLinks.map((entry) => {
                const other =
                  entry.link.fromIntersectionId === selected.id
                    ? entry.to
                    : entry.from;
                return (
                  <li
                    key={entry.link.id}
                    className="flex items-center justify-between gap-2 rounded-[6px] border border-stroke-0 bg-surface-1 px-2 py-1.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-1">
                        {other.name}
                      </p>
                      <p className="text-[0.64rem] text-ink-3">
                        {entry.link.kind} · {entry.link.distanceMetres} m ·{" "}
                        {Math.round(entry.link.bearingDeg)}°
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeIntersectionLink(entry.link.id)}
                      className="shrink-0 rounded-[4px] border border-stroke-0 bg-surface-2 px-1.5 py-0.5 text-[0.62rem] font-semibold text-ink-3 hover:text-ink-0"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-[0.72rem] text-ink-3">
              Select a carrefour to see its linked neighbours.
            </p>
          )}
        </section>

        <section className="px-4 py-3">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
            Map carrefours ({mapCarrefours.length})
          </p>
          {mapCarrefours.length === 0 ? (
            <p className="mt-2 text-[0.72rem] text-ink-3">
              No local carrefours yet. Switch to <strong>Create carrefour</strong>{" "}
              and click the map.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-[0.72rem]">
              {mapCarrefours
                .slice()
                .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
                .map((carrefour) => {
                  const linkCount = links.filter(
                    (link) =>
                      link.fromIntersectionId === carrefour.id ||
                      link.toIntersectionId === carrefour.id,
                  ).length;
                  return (
                    <li
                      key={carrefour.id}
                      className={clsx(
                        "flex items-center gap-2 rounded-[6px] border px-2 py-1.5",
                        selectedId === carrefour.id
                          ? "border-accent-stroke bg-accent-surface"
                          : "border-stroke-0 bg-surface-1",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(carrefour.id);
                          mapRef.current?.panTo(carrefour.location);
                        }}
                        className="flex-1 truncate text-left"
                      >
                        <span className="block truncate font-semibold text-ink-1">
                          {carrefour.name}
                        </span>
                        <span className="block truncate text-[0.64rem] text-ink-3">
                          {carrefour.city ?? "—"} ·{" "}
                          {resolveRegionLabel(carrefour.regionId) ?? "—"}
                        </span>
                      </button>
                      <span className="shrink-0 rounded-[3px] bg-surface-2 px-1 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-ink-2">
                        {linkCount} lnk
                      </span>
                    </li>
                  );
                })}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}

function resolveRegionLabel(regionId: string | null | undefined) {
  if (!regionId) return null;
  return (
    moroccoGeography.regions.find((region) => region.id === regionId)?.name ??
    null
  );
}
