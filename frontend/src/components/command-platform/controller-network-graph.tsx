"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";

import type {
  CommandNetworkLink,
  CommandNetworkNode,
} from "@/components/command-platform/network-types";
import { useCommandTheme } from "@/components/command-platform/theme-context";
import { formatControllerType } from "@/lib/command-platform-format";
import type { TrafficFlowState } from "@/types/command-platform";

interface ControllerNetworkGraphProps {
  nodes: CommandNetworkNode[];
  links: CommandNetworkLink[];
  selectedIntersectionId?: string;
  onSelectIntersection: (intersectionId: string) => void;
  cityName?: string;
}

type LayoutMode = "relation" | "geo";

interface DistrictBadge {
  district: string;
  x: number;
  y: number;
  count: number;
}

interface GraphLayoutState {
  positions: Record<string, { x: number; y: number }>;
  featuredNodeIds: Set<string>;
  districtBadges: DistrictBadge[];
}

interface ThemeTokens {
  surface: string;
  panelBg: string;
  panelBorder: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  badgeFill: string;
  badgeStroke: string;
  badgeText: string;
  badgeSubText: string;
  nodeInner: string;
  districtLink: string;
  selectedDash: string;
  toggleActiveBg: string;
  toggleActiveText: string;
  toggleInactiveText: string;
  gridDot: string;
  gridDotOpacity: number;
  scanLine: string;
}

const VIEWBOX = { width: 1120, height: 720 };

const toneColor: Record<TrafficFlowState, string> = {
  smooth: "#39d98a",
  pressure: "#ffb547",
  congestion: "#ff5f5f",
};

const darkTokens: ThemeTokens = {
  surface:
    "bg-[radial-gradient(circle_at_top,#12212a_0%,#081015_42%,#05080c_100%)]",
  panelBg: "bg-[#071018]/88",
  panelBorder: "border-white/10",
  textPrimary: "#edf3ee",
  textSecondary: "#cdd7d0",
  textMuted: "#8fa39a",
  badgeFill: "#071018",
  badgeStroke: "#243138",
  badgeText: "#d6e2db",
  badgeSubText: "#83958c",
  nodeInner: "#091117",
  districtLink: "#3a4f5a",
  selectedDash: "#ffffff",
  toggleActiveBg: "#14100a",
  toggleActiveText: "#ffb547",
  toggleInactiveText: "#8fa39a",
  gridDot: "#3a8aa6",
  gridDotOpacity: 0.18,
  scanLine: "rgba(57, 217, 138, 0.10)",
};

const lightTokens: ThemeTokens = {
  surface:
    "bg-[radial-gradient(circle_at_top,#f3f8fb_0%,#e7eef3_50%,#d8e1e8_100%)]",
  panelBg: "bg-white/85",
  panelBorder: "border-[#cfd9e0]",
  textPrimary: "#0f1f2a",
  textSecondary: "#314556",
  textMuted: "#6b7c89",
  badgeFill: "#ffffff",
  badgeStroke: "#cfd9e0",
  badgeText: "#1e2c38",
  badgeSubText: "#6b7c89",
  nodeInner: "#ffffff",
  districtLink: "#a4b3bf",
  selectedDash: "#0f1f2a",
  toggleActiveBg: "#fff7e6",
  toggleActiveText: "#b97800",
  toggleInactiveText: "#5a6c79",
  gridDot: "#5d7a8b",
  gridDotOpacity: 0.22,
  scanLine: "rgba(20, 90, 140, 0.08)",
};

export function ControllerNetworkGraph({
  nodes,
  links,
  selectedIntersectionId,
  onSelectIntersection,
  cityName,
}: ControllerNetworkGraphProps) {
  const [layout, setLayout] = useState<LayoutMode>("relation");
  const { theme } = useCommandTheme();
  const t = theme === "light" ? lightTokens : darkTokens;

  const layoutState = useMemo(
    () =>
      layout === "geo"
        ? buildGeoLayout(nodes, links, selectedIntersectionId)
        : buildRelationLayout(nodes, links, selectedIntersectionId),
    [layout, links, nodes, selectedIntersectionId],
  );

  // Connections between district badges so cities/zones look like a network
  // (where traffic flows between groups), not isolated islands.
  const districtLinks = useMemo(() => {
    if (layout !== "relation") return [];
    return buildDistrictLinks(nodes, links, layoutState.districtBadges);
  }, [layout, nodes, links, layoutState.districtBadges]);

  const selectedNode = nodes.find(
    (node) => node.intersectionId === selectedIntersectionId,
  );

  // Always-show labels when the visible network is small enough to be readable.
  const showAllLabels = nodes.length <= 28;

  return (
    <div className={clsx("relative h-full w-full overflow-hidden", t.surface)}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
@keyframes ctrl-pulse-halo {
  0% { transform: scale(0.85); opacity: 0.55; }
  70% { transform: scale(1.55); opacity: 0; }
  100% { transform: scale(0.85); opacity: 0; }
}
@keyframes ctrl-grid-drift {
  0% { transform: translate(0, 0); }
  100% { transform: translate(48px, 48px); }
}
@keyframes ctrl-scan-line {
  0% { transform: translateY(-30%); opacity: 0; }
  15% { opacity: 1; }
  85% { opacity: 1; }
  100% { transform: translateY(130%); opacity: 0; }
}
.ctrl-halo {
  transform-origin: center;
  transform-box: fill-box;
  animation: ctrl-pulse-halo 2.6s ease-in-out infinite;
}
`,
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: "-64px",
          backgroundImage: `radial-gradient(circle, ${t.gridDot} 1.1px, transparent 1.6px)`,
          backgroundSize: "48px 48px",
          opacity: t.gridDotOpacity,
          animation: "ctrl-grid-drift 16s linear infinite",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: "22%",
          background: `linear-gradient(180deg, transparent 0%, ${t.scanLine} 50%, transparent 100%)`,
          animation: "ctrl-scan-line 6.4s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />
      <div
        className={clsx(
          "absolute left-5 top-[104px] z-10 flex max-w-[calc(100%-2.5rem)] flex-wrap items-center gap-3 rounded-[12px] border px-4 py-3 backdrop-blur",
          t.panelBg,
          t.panelBorder,
        )}
      >
        <div>
          <p
            className="text-[0.6rem] font-semibold uppercase tracking-[0.24em]"
            style={{ color: t.textMuted }}
          >
            {cityName ? `Vue contrôleurs · ${cityName}` : "Vue contrôleurs"}
          </p>
          <p
            className="mt-1 text-[0.88rem] font-semibold"
            style={{ color: t.textPrimary }}
          >
            Liens logiques et flux de trafic
          </p>
        </div>
        <div
          className={clsx(
            "ml-2 flex items-center gap-1 rounded-[10px] border p-1",
            t.panelBorder,
          )}
          style={{
            backgroundColor: theme === "light" ? "#f1f5f8" : "#0b1115",
          }}
        >
          <button
            type="button"
            onClick={() => setLayout("relation")}
            className="rounded-[8px] px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.16em] transition"
            style={
              layout === "relation"
                ? {
                    backgroundColor: t.toggleActiveBg,
                    color: t.toggleActiveText,
                  }
                : { color: t.toggleInactiveText }
            }
          >
            Relation
          </button>
          <button
            type="button"
            onClick={() => setLayout("geo")}
            className="rounded-[8px] px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.16em] transition"
            style={
              layout === "geo"
                ? {
                    backgroundColor: t.toggleActiveBg,
                    color: t.toggleActiveText,
                  }
                : { color: t.toggleInactiveText }
            }
          >
            Géométrie
          </button>
        </div>
        <div
          className="ml-2 flex flex-wrap items-center gap-3 text-[0.66rem] font-semibold uppercase tracking-[0.14em]"
          style={{ color: t.textMuted }}
        >
          <LegendDot color={toneColor.smooth} label="Fluide" />
          <LegendDot color={toneColor.pressure} label="Sous pression" />
          <LegendDot color={toneColor.congestion} label="Congestion" />
        </div>
      </div>

      {nodes.length === 0 ? (
        <div className="grid h-full place-items-center px-6 text-center">
          <div>
            <p
              className="text-[1rem] font-semibold"
              style={{ color: t.textPrimary }}
            >
              Graphe indisponible
            </p>
            <p
              className="mt-2 max-w-[380px] text-[0.82rem] leading-6"
              style={{ color: t.textMuted }}
            >
              Aucun lien contrôleur exploitable n&apos;a encore été remonté pour la
              zone sélectionnée.
            </p>
          </div>
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
          className="h-full w-full"
          role="img"
          aria-label="Graph relationnel des contrôleurs"
        >
          <defs>
            <filter id="network-glow">
              <feGaussianBlur stdDeviation="6" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Inter-district connection lines — cities linked like a network */}
          {districtLinks.map((edge) => (
            <line
              key={edge.id}
              x1={edge.from.x}
              y1={edge.from.y}
              x2={edge.to.x}
              y2={edge.to.y}
              stroke={t.districtLink}
              strokeOpacity={0.55}
              strokeWidth={1.2}
              strokeDasharray="2 5"
            />
          ))}

          {links.map((link) => {
            const from = layoutState.positions[link.fromIntersectionId];
            const to = layoutState.positions[link.toIntersectionId];
            if (!from || !to) return null;
            const selected =
              link.fromIntersectionId === selectedIntersectionId ||
              link.toIntersectionId === selectedIntersectionId;
            const distance = Math.hypot(to.x - from.x, to.y - from.y);
            // Particle speed depends on flow state — congestion = slow, smooth = fast.
            const speedFactor =
              link.state === "congestion" ? 7 : link.state === "pressure" ? 5 : 3.5;
            const dur = Math.max(2.2, distance / (220 / speedFactor));
            const phaseDelay = (hashFloat(link.id) * dur).toFixed(2);
            const pathSpec = `M${from.x},${from.y} L${to.x},${to.y}`;
            return (
              <g key={link.id}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={toneColor[link.state]}
                  strokeOpacity={selected ? 0.92 : 0.34}
                  strokeWidth={selected ? 3.2 : 1.6}
                  filter={selected ? "url(#network-glow)" : undefined}
                />
                {/* Flowing traffic particle — visualises the link is alive */}
                <circle
                  r={selected ? 3.4 : 2.4}
                  fill={toneColor[link.state]}
                  opacity={selected ? 0.95 : 0.78}
                >
                  <animateMotion
                    dur={`${dur.toFixed(2)}s`}
                    repeatCount="indefinite"
                    path={pathSpec}
                    begin={`-${phaseDelay}s`}
                  />
                </circle>
                {selected ? (
                  <>
                    <circle r={5.2} fill={toneColor[link.state]} opacity={0.45}>
                      <animateMotion
                        dur={`${dur.toFixed(2)}s`}
                        repeatCount="indefinite"
                        path={pathSpec}
                        begin={`-${phaseDelay}s`}
                      />
                    </circle>
                    <line
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke={t.selectedDash}
                      strokeOpacity={0.22}
                      strokeWidth={0.8}
                      strokeDasharray="6 8"
                    />
                  </>
                ) : null}
              </g>
            );
          })}

          {layout === "relation"
            ? layoutState.districtBadges.map((badge) => (
                <g
                  key={badge.district}
                  transform={`translate(${badge.x} ${badge.y})`}
                >
                  <rect
                    x={-58}
                    y={-16}
                    width={116}
                    height={32}
                    rx={16}
                    fill={t.badgeFill}
                    fillOpacity={0.94}
                    stroke={t.badgeStroke}
                  />
                  <text
                    textAnchor="middle"
                    y={-2}
                    fill={t.badgeText}
                    fontSize={11}
                    fontWeight={700}
                    letterSpacing="1.4"
                  >
                    {truncateDistrict(badge.district)}
                  </text>
                  <text
                    textAnchor="middle"
                    y={11}
                    fill={t.badgeSubText}
                    fontSize={9}
                    fontWeight={600}
                    letterSpacing="1.2"
                  >
                    {badge.count} noeuds
                  </text>
                </g>
              ))
            : null}

          {nodes.map((node) => {
            const point = layoutState.positions[node.intersectionId];
            if (!point) return null;
            const selected = node.intersectionId === selectedIntersectionId;
            const featured = layoutState.featuredNodeIds.has(node.intersectionId);
            const radius = selected ? 16 : 11;
            const renderLabel = showAllLabels || featured || selected;
            return (
              <g
                key={node.intersectionId}
                transform={`translate(${point.x} ${point.y})`}
                className="cursor-pointer"
                onClick={() => onSelectIntersection(node.intersectionId)}
              >
                <circle
                  className="ctrl-halo"
                  r={radius + 10}
                  fill={toneColor[node.trafficState]}
                  opacity={selected ? 0.32 : featured ? 0.22 : 0.12}
                  style={{
                    animationDelay: `${(hashFloat(node.intersectionId) * 2.6).toFixed(2)}s`,
                    animationDuration:
                      node.trafficState === "congestion"
                        ? "1.8s"
                        : node.trafficState === "pressure"
                          ? "2.2s"
                          : "2.8s",
                  }}
                />
                <circle
                  r={radius}
                  fill={t.nodeInner}
                  stroke={toneColor[node.trafficState]}
                  strokeWidth={selected ? 3 : 2}
                  filter={selected ? "url(#network-glow)" : undefined}
                />
                <circle
                  r={selected ? 6 : 4}
                  fill={toneColor[node.trafficState]}
                />
                {renderLabel ? (
                  <>
                    <text
                      y={radius + 16}
                      textAnchor="middle"
                      fill={t.textPrimary}
                      fontSize={selected ? 13 : 11}
                      fontWeight={700}
                      paintOrder="stroke"
                      stroke={t.nodeInner}
                      strokeWidth={3}
                      strokeLinejoin="round"
                    >
                      {truncate(node.label, selected ? 22 : 16)}
                    </text>
                    <text
                      y={radius + 29}
                      textAnchor="middle"
                      fill={t.textMuted}
                      fontSize={10}
                      fontWeight={600}
                      paintOrder="stroke"
                      stroke={t.nodeInner}
                      strokeWidth={2.5}
                      strokeLinejoin="round"
                    >
                      {node.controllerId}
                    </text>
                  </>
                ) : null}
              </g>
            );
          })}
        </svg>
      )}

      <div
        className={clsx(
          "absolute bottom-5 left-5 rounded-[12px] border px-4 py-3 backdrop-blur",
          t.panelBg,
          t.panelBorder,
        )}
      >
        <p
          className="text-[0.62rem] font-semibold uppercase tracking-[0.2em]"
          style={{ color: t.textMuted }}
        >
          Réseau affiché
        </p>
        <p
          className="mt-1 text-[0.86rem] font-semibold"
          style={{ color: t.textPrimary }}
        >
          {nodes.length} contrôleurs · {links.length} liens
        </p>
        <p
          className="mt-1 text-[0.72rem]"
          style={{ color: t.textMuted }}
        >
          {layout === "relation"
            ? "Vue relationnelle centrée sur les carrefours les plus influents."
            : "Vue calée sur la géométrie réelle des carrefours."}
        </p>
      </div>

      {selectedNode ? (
        <div
          className={clsx(
            "absolute bottom-5 right-5 max-w-[300px] rounded-[12px] border px-4 py-3 backdrop-blur",
            t.panelBg,
            t.panelBorder,
          )}
        >
          <p
            className="text-[0.62rem] font-semibold uppercase tracking-[0.2em]"
            style={{ color: t.textMuted }}
          >
            Contrôleur sélectionné
          </p>
          <p
            className="mt-1 text-[0.96rem] font-semibold"
            style={{ color: t.textPrimary }}
          >
            {selectedNode.label}
          </p>
          <p
            className="mt-1 text-[0.74rem]"
            style={{ color: t.textMuted }}
          >
            {selectedNode.controllerId} ·{" "}
            {formatControllerType(selectedNode.controllerType)}
          </p>
          <p
            className="mt-1 text-[0.74rem]"
            style={{ color: t.textSecondary }}
          >
            {selectedNode.equipmentStatus} ·{" "}
            {selectedNode.averageDelaySeconds}s délai ·{" "}
            {selectedNode.queueLength} véhicules
          </p>
        </div>
      ) : null}
    </div>
  );
}

function buildDistrictLinks(
  nodes: CommandNetworkNode[],
  links: CommandNetworkLink[],
  badges: DistrictBadge[],
) {
  if (badges.length < 2) return [];
  const districtById = new Map<string, string>();
  for (const node of nodes) {
    districtById.set(
      node.intersectionId,
      node.district || "Sans district",
    );
  }
  const badgeByName = new Map<string, DistrictBadge>(
    badges.map((badge) => [badge.district, badge]),
  );
  const seen = new Set<string>();
  const edges: Array<{
    id: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
  }> = [];
  // Real links between controllers in different districts → connect badges.
  for (const link of links) {
    const fromDistrict = districtById.get(link.fromIntersectionId);
    const toDistrict = districtById.get(link.toIntersectionId);
    if (!fromDistrict || !toDistrict) continue;
    if (fromDistrict === toDistrict) continue;
    const key = [fromDistrict, toDistrict].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const from = badgeByName.get(fromDistrict);
    const to = badgeByName.get(toDistrict);
    if (!from || !to) continue;
    edges.push({
      id: `district-${key}`,
      from: { x: from.x, y: from.y },
      to: { x: to.x, y: to.y },
    });
  }
  // Fall back to a minimum spanning skeleton (each badge linked to its
  // closest neighbour) so the city panel never sits as isolated cards.
  if (edges.length === 0) {
    for (let i = 0; i < badges.length; i += 1) {
      const left = badges[i]!;
      let nearest: DistrictBadge | null = null;
      let bestDist = Infinity;
      for (let j = 0; j < badges.length; j += 1) {
        if (i === j) continue;
        const right = badges[j]!;
        const dist = Math.hypot(right.x - left.x, right.y - left.y);
        if (dist < bestDist) {
          bestDist = dist;
          nearest = right;
        }
      }
      if (!nearest) continue;
      const key = [left.district, nearest.district].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        id: `district-skel-${key}`,
        from: { x: left.x, y: left.y },
        to: { x: nearest.x, y: nearest.y },
      });
    }
  }
  return edges;
}

function buildGeoLayout(
  nodes: CommandNetworkNode[],
  links: CommandNetworkLink[],
  selectedIntersectionId?: string,
): GraphLayoutState {
  if (nodes.length === 0) {
    return { positions: {}, featuredNodeIds: new Set(), districtBadges: [] };
  }
  const padding = 88;
  const validNodes = nodes.filter((node) => isValidCoordinate(node.location));
  const invalidNodes = nodes.filter((node) => !isValidCoordinate(node.location));
  const sourceNodes = validNodes.length > 0 ? validNodes : nodes;
  const xs = sourceNodes.map((node) => node.location.lng);
  const ys = sourceNodes.map((node) => node.location.lat);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const positions = Object.fromEntries(
    sourceNodes.map((node) => {
      const x =
        padding +
        ((node.location.lng - minX) / Math.max(maxX - minX, 0.00001)) *
          (VIEWBOX.width - padding * 2);
      const y =
        padding +
        (1 - (node.location.lat - minY) / Math.max(maxY - minY, 0.00001)) *
          (VIEWBOX.height - padding * 2);
      return [node.intersectionId, { x, y }];
    }),
  ) as Record<string, { x: number; y: number }>;

  relaxGeoPositions(positions, sourceNodes);

  invalidNodes.forEach((node, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    positions[node.intersectionId] = {
      x: VIEWBOX.width - 150 + col * 42,
      y: VIEWBOX.height - 110 - row * 42,
    };
  });

  return {
    positions,
    featuredNodeIds: buildFeaturedNodeIds(nodes, links, selectedIntersectionId),
    districtBadges: [],
  };
}

function buildRelationLayout(
  nodes: CommandNetworkNode[],
  links: CommandNetworkLink[],
  selectedIntersectionId?: string,
): GraphLayoutState {
  if (nodes.length === 0) {
    return { positions: {}, featuredNodeIds: new Set(), districtBadges: [] };
  }
  const linkedCount = buildLinkedCount(links);
  const featuredNodeIds = buildFeaturedNodeIds(
    nodes,
    links,
    selectedIntersectionId,
  );
  const groups = new Map<string, CommandNetworkNode[]>();
  for (const node of nodes) {
    const key = node.district || "Sans district";
    const current = groups.get(key);
    if (current) {
      current.push(node);
    } else {
      groups.set(key, [node]);
    }
  }

  const orderedGroups = [...groups.entries()]
    .map(([district, districtNodes]) => ({
      district,
      nodes: [...districtNodes].sort(
        (left, right) =>
          nodePriority(right, linkedCount) - nodePriority(left, linkedCount),
      ),
    }))
    .sort((left, right) => right.nodes.length - left.nodes.length);

  const positions: Record<string, { x: number; y: number }> = {};
  const districtBadges: GraphLayoutState["districtBadges"] = [];
  const cols = Math.min(3, Math.max(2, Math.ceil(Math.sqrt(orderedGroups.length))));
  const rows = Math.ceil(orderedGroups.length / cols);
  const xStart = 200;
  const xEnd = VIEWBOX.width - 180;
  const yStart = 260;
  const yEnd = VIEWBOX.height - 160;
  const xStep = cols === 1 ? 0 : (xEnd - xStart) / Math.max(cols - 1, 1);
  const yStep = rows === 1 ? 0 : (yEnd - yStart) / Math.max(rows - 1, 1);

  orderedGroups.forEach((group, groupIndex) => {
    const col = groupIndex % cols;
    const row = Math.floor(groupIndex / cols);
    const center = {
      x: xStart + col * xStep,
      y: yStart + row * yStep,
    };
    const selectedIndex = group.nodes.findIndex(
      (node) => node.intersectionId === selectedIntersectionId,
    );
    const clusterNodes =
      selectedIndex <= 0
        ? group.nodes
        : [
            group.nodes[selectedIndex],
            ...group.nodes.filter((_, i) => i !== selectedIndex),
          ];

    clusterNodes.forEach((node, nodeIndex) => {
      if (nodeIndex === 0) {
        positions[node!.intersectionId] = center;
        return;
      }
      const ring = Math.floor((nodeIndex - 1) / 8);
      const ringIndex = (nodeIndex - 1) % 8;
      const ringSize = 8 + ring * 4;
      const angle =
        -Math.PI / 2 +
        (ringIndex / ringSize) * Math.PI * 2 +
        hashFloat(node!.intersectionId) * 0.2;
      const radius = 78 + ring * 56;
      positions[node!.intersectionId] = {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * (radius * 0.85),
      };
    });

    const maxRadius =
      clusterNodes.length <= 1
        ? 0
        : 78 + Math.floor((clusterNodes.length - 2) / 8) * 56;
    districtBadges.push({
      district: group.district,
      x: center.x,
      y: center.y - Math.max(96, maxRadius + 38),
      count: clusterNodes.length,
    });
  });

  return { positions, featuredNodeIds, districtBadges };
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function truncate(value: string, limit: number) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
}

function buildLinkedCount(links: CommandNetworkLink[]) {
  const linkedCount = new Map<string, number>();
  for (const link of links) {
    linkedCount.set(
      link.fromIntersectionId,
      (linkedCount.get(link.fromIntersectionId) ?? 0) + 1,
    );
    linkedCount.set(
      link.toIntersectionId,
      (linkedCount.get(link.toIntersectionId) ?? 0) + 1,
    );
  }
  return linkedCount;
}

function buildFeaturedNodeIds(
  nodes: CommandNetworkNode[],
  links: CommandNetworkLink[],
  selectedIntersectionId?: string,
) {
  const linkedCount = buildLinkedCount(links);
  const featured = new Set<string>();
  if (selectedIntersectionId) {
    featured.add(selectedIntersectionId);
  }

  const topNodes = [...nodes]
    .sort(
      (left, right) =>
        nodePriority(right, linkedCount) - nodePriority(left, linkedCount),
    )
    .slice(0, Math.min(16, nodes.length));
  for (const node of topNodes) {
    featured.add(node.intersectionId);
  }

  const topByDistrict = new Map<string, CommandNetworkNode>();
  for (const node of nodes) {
    const district = node.district || "Sans district";
    const current = topByDistrict.get(district);
    if (
      !current ||
      nodePriority(node, linkedCount) > nodePriority(current, linkedCount)
    ) {
      topByDistrict.set(district, node);
    }
  }
  for (const node of topByDistrict.values()) {
    featured.add(node.intersectionId);
  }

  return featured;
}

function nodePriority(
  node: CommandNetworkNode,
  linkedCount: Map<string, number>,
) {
  const stateWeight =
    node.trafficState === "congestion"
      ? 3
      : node.trafficState === "pressure"
        ? 2
        : 1;
  return (
    stateWeight * 100 +
    (linkedCount.get(node.intersectionId) ?? 0) * 14 +
    node.incidents * 18 +
    node.averageDelaySeconds +
    node.queueLength * 0.75
  );
}

function hashFloat(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash % 1000) / 1000;
}

function truncateDistrict(value: string) {
  return truncate(value, 16);
}

function isValidCoordinate(point: { lat: number; lng: number }) {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    !(point.lat === 0 && point.lng === 0)
  );
}

function relaxGeoPositions(
  positions: Record<string, { x: number; y: number }>,
  nodes: CommandNetworkNode[],
) {
  const minDistance = 38;
  for (let step = 0; step < 18; step += 1) {
    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
      const left = positions[nodes[leftIndex]!.intersectionId];
      if (!left) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
        const right = positions[nodes[rightIndex]!.intersectionId];
        if (!right) continue;
        const dx = right.x - left.x;
        const dy = right.y - left.y;
        const distance = Math.hypot(dx, dy);
        if (distance === 0) {
          const jitter = 10 + rightIndex * 0.3;
          right.x += jitter;
          right.y += jitter * 0.6;
          continue;
        }
        if (distance >= minDistance) continue;
        const push = (minDistance - distance) / 2;
        const nx = dx / distance;
        const ny = dy / distance;
        left.x -= nx * push;
        left.y -= ny * push;
        right.x += nx * push;
        right.y += ny * push;
      }
    }
  }
  for (const point of Object.values(positions)) {
    point.x = clamp(point.x, 70, VIEWBOX.width - 70);
    point.y = clamp(point.y, 110, VIEWBOX.height - 70);
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
