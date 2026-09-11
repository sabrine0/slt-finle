"use client";

import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";

import {
  findNearestCity,
  moroccoGeography,
  type MoroccoCity,
} from "@/lib/morocco-geography";
import {
  findCityForEngineeringIntersection,
  findRegionForEngineeringIntersection,
} from "@/lib/engineering-to-geography";
import {
  useStudioMapCarrefours,
  useStudioNetworkLinks,
  useStudioProjectIntersections,
} from "@/components/studio/project-context";
import type { ExplorerNode } from "@/components/studio/types";

interface ProjectExplorerProps {
  selectedNodeId?: string;
  onSelectNode: (node: ExplorerNode) => void;
  /** When provided, the header shows an "Open network map" button that
   *  opens the map-backed carrefour network view. */
  onOpenNetwork?: () => void;
}

const PROPOSALS_STORAGE_KEY = "stls.zone-builder.proposals";

interface LocalProposal {
  id: string;
  code: string;
  name: string;
  street: string;
  centre?: { lat: number; lng: number };
  savedAt: string;
  syncedToAudit?: boolean;
}

function loadProposals(): LocalProposal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PROPOSALS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is LocalProposal =>
        !!entry &&
        typeof entry === "object" &&
        typeof (entry as LocalProposal).id === "string" &&
        typeof (entry as LocalProposal).code === "string",
    );
  } catch {
    return [];
  }
}

interface BuildTreeInput {
  proposals: LocalProposal[];
  intersections: ReturnType<typeof useStudioProjectIntersections>;
  linksByIntersection: Map<string, number>;
  mapCarrefourIds: Set<string>;
}

function buildExplorerTree({
  proposals,
  intersections,
  linksByIntersection,
  mapCarrefourIds,
}: BuildTreeInput): ExplorerNode {
  const proposalsByCity = new Map<string, LocalProposal[]>();
  for (const proposal of proposals) {
    if (!proposal.centre) continue;
    const city: MoroccoCity | undefined = findNearestCity(proposal.centre);
    if (!city) continue;
    const bucket = proposalsByCity.get(city.id) ?? [];
    bucket.push(proposal);
    proposalsByCity.set(city.id, bucket);
  }

  return {
    id: "country-ma",
    kind: "country",
    label: moroccoGeography.countryName,
    labelAr: moroccoGeography.countryNameAr,
    hint: `${moroccoGeography.regions.length} regions`,
    children: moroccoGeography.regions.map((region) => ({
      id: region.id,
      kind: "region",
      label: region.name,
      labelAr: region.nameAr,
      regionId: region.id,
      hint: `${region.cities.length} cities`,
      children: region.cities.map((city) => {
        const cityIntersections = intersections.filter(
          (intersection) =>
            findCityForEngineeringIntersection(intersection)?.id === city.id,
        );
        const cityProposals = proposalsByCity.get(city.id) ?? [];
        const proposalNodes: ExplorerNode[] = cityProposals
          .slice()
          .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))
          .map((proposal) => ({
            id: `proposal-${proposal.id}`,
            kind: "proposal",
            label: proposal.name || proposal.code,
            hint: proposal.code,
            regionId: region.id,
            cityId: city.id,
            proposalId: proposal.id,
          }));
        const totalCount = cityIntersections.length + cityProposals.length;
        const hint =
          cityProposals.length > 0
            ? `${totalCount} intersections · ${cityProposals.length} prop.`
            : `${totalCount} intersections`;
        return {
          id: city.id,
          kind: "city",
          label: city.name,
          labelAr: city.nameAr,
          regionId: region.id,
          cityId: city.id,
          hint,
          children: [
            ...cityIntersections.map((intersection) => {
              const linkCount = linksByIntersection.get(intersection.id) ?? 0;
              const isMap = mapCarrefourIds.has(intersection.id);
              return {
                id: `intersection-${intersection.id}`,
                kind: "intersection" as const,
                label: intersection.name,
                hint: linkCount > 0
                  ? `${intersection.district || ""}${intersection.district ? " · " : ""}${linkCount} lnk`
                  : intersection.district,
                regionId:
                  findRegionForEngineeringIntersection(intersection)?.id ??
                  region.id,
                cityId: city.id,
                intersectionId: intersection.id,
                isMapCarrefour: isMap,
                linkCount,
              };
            }),
            ...proposalNodes,
          ],
        };
      }),
    })),
  };
}

export function ProjectExplorer({
  selectedNodeId,
  onSelectNode,
  onOpenNetwork,
}: ProjectExplorerProps) {
  const intersections = useStudioProjectIntersections();
  const mapCarrefours = useStudioMapCarrefours();
  const links = useStudioNetworkLinks();
  const [proposals, setProposals] = useState<LocalProposal[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProposals(loadProposals());
    const handler = (event: StorageEvent) => {
      if (event.key === PROPOSALS_STORAGE_KEY) {
        setProposals(loadProposals());
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const mapCarrefourIds = useMemo(
    () => new Set(mapCarrefours.map((entry) => entry.id)),
    [mapCarrefours],
  );
  const linksByIntersection = useMemo(() => {
    const map = new Map<string, number>();
    for (const link of links) {
      map.set(
        link.fromIntersectionId,
        (map.get(link.fromIntersectionId) ?? 0) + 1,
      );
      map.set(
        link.toIntersectionId,
        (map.get(link.toIntersectionId) ?? 0) + 1,
      );
    }
    return map;
  }, [links]);

  const tree = useMemo(
    () =>
      buildExplorerTree({
        proposals,
        intersections,
        linksByIntersection,
        mapCarrefourIds,
      }),
    [intersections, proposals, linksByIntersection, mapCarrefourIds],
  );
  const [expanded, setExpanded] = useState<Set<string>>(
    () =>
      new Set([
        "country-ma",
        "reg-casablanca-settat",
        "city-casablanca",
      ]),
  );

  const toggle = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-stroke-0 bg-surface-1">
      <header className="flex items-center justify-between gap-2 border-b border-stroke-0 px-3 py-2">
        <div>
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
            Project explorer
          </p>
          <p className="mt-0.5 text-[0.78rem] font-medium text-ink-1">
            STLS — Royaume du Maroc
          </p>
        </div>
        <div className="flex items-center gap-1">
          {onOpenNetwork ? (
            <button
              type="button"
              onClick={onOpenNetwork}
              title="Open network map"
              className="flex items-center gap-1 rounded-[4px] border border-stroke-0 bg-surface-2 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-ink-2 transition hover:text-ink-0"
            >
              <span aria-hidden className="text-info-ink">◉</span>
              Network
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Refresh project tree"
            onClick={() => setProposals(loadProposals())}
            className="grid h-6 w-6 place-items-center rounded-[4px] text-ink-3 transition hover:bg-hover hover:text-ink-1"
          >
            <span aria-hidden className="text-[0.78rem] leading-none">
              ⟲
            </span>
          </button>
        </div>
      </header>

      <div className="border-b border-stroke-0 px-3 py-1.5 text-[0.66rem] text-ink-3">
        <div className="flex items-center justify-between">
          <span>
            {mapCarrefours.length} map carrefour{mapCarrefours.length === 1 ? "" : "s"}
          </span>
          <span>
            {links.length} link{links.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        <ExplorerRow
          node={tree}
          depth={0}
          expanded={expanded}
          selectedNodeId={selectedNodeId}
          onToggle={toggle}
          onSelectNode={onSelectNode}
        />
      </div>
    </aside>
  );
}

interface ExplorerRowProps {
  node: ExplorerNode;
  depth: number;
  expanded: Set<string>;
  selectedNodeId?: string;
  onToggle: (id: string) => void;
  onSelectNode: (node: ExplorerNode) => void;
}

const NODE_ICON: Record<ExplorerNode["kind"], string> = {
  country: "◆",
  region: "▣",
  city: "◯",
  intersection: "◈",
  "proposals-root": "✚",
  proposal: "◈",
  "network-root": "◉",
};

function ExplorerRow({
  node,
  depth,
  expanded,
  selectedNodeId,
  onToggle,
  onSelectNode,
}: ExplorerRowProps) {
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isExpanded = expanded.has(node.id);
  const isSelected = node.id === selectedNodeId;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (hasChildren) onToggle(node.id);
          onSelectNode(node);
        }}
        className={clsx(
          "relative flex w-full items-center gap-1.5 px-2 py-1 text-left text-[0.78rem] transition",
          isSelected &&
            (node.kind === "intersection" || node.kind === "proposal")
            ? "bg-accent-surface text-accent-ink font-semibold shadow-[inset_3px_0_0_0_var(--stls-accent)]"
            : isSelected
              ? "bg-accent-surface text-accent-ink ring-1 ring-inset ring-accent-stroke"
              : "text-ink-1 hover:bg-hover hover:text-ink-0",
        )}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <span
          aria-hidden
          className={clsx(
            "inline-block w-3 text-center text-[0.7rem] leading-none transition-transform",
            hasChildren ? "" : "opacity-30",
            isExpanded ? "rotate-90" : "",
          )}
        >
          {hasChildren ? "▸" : "•"}
        </span>
        <span
          aria-hidden
          className={clsx(
            "inline-block w-3 text-center text-[0.7rem] leading-none",
            node.kind === "intersection"
              ? node.isMapCarrefour
                ? "text-accent-ink"
                : "text-info-ink"
              : node.kind === "proposal"
                ? "text-accent-ink"
                : node.kind === "city"
                  ? "text-accent-ink"
                  : node.kind === "region"
                    ? "text-sig-green-ink"
                    : "text-ink-3",
          )}
        >
          {NODE_ICON[node.kind]}
        </span>
        <span className="flex-1 truncate">{node.label}</span>
        {node.kind === "intersection" && node.isMapCarrefour ? (
          <span className="mr-1 rounded-[3px] border border-accent-stroke bg-accent-surface px-1 py-px text-[0.52rem] font-semibold uppercase tracking-[0.18em] text-accent-ink">
            Map
          </span>
        ) : null}
        {node.kind === "intersection" && (node.linkCount ?? 0) > 0 ? (
          <span className="mr-1 rounded-[3px] border border-info-ink/40 bg-surface-2 px-1 py-px text-[0.52rem] font-semibold uppercase tracking-[0.18em] text-info-ink">
            {node.linkCount} lnk
          </span>
        ) : null}
        {node.kind === "proposal" ? (
          <span className="mr-1 rounded-[3px] border border-accent-stroke bg-accent-surface px-1 py-px text-[0.52rem] font-semibold uppercase tracking-[0.18em] text-accent-ink">
            Prop
          </span>
        ) : null}
        {node.labelAr ? (
          <span
            dir="rtl"
            lang="ar"
            className="ml-1 truncate text-[0.7rem] text-ink-3"
          >
            {node.labelAr}
          </span>
        ) : null}
        {node.hint ? (
          <span className="ml-2 shrink-0 text-[0.66rem] text-ink-3">
            {node.hint}
          </span>
        ) : null}
      </button>

      {isExpanded && hasChildren ? (
        <div>
          {node.children?.map((child) => (
            <ExplorerRow
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedNodeId={selectedNodeId}
              onToggle={onToggle}
              onSelectNode={onSelectNode}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
