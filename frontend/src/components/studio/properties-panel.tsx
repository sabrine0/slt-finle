"use client";

import { useStudioProjectIntersection } from "@/components/studio/project-context";
import { useStudioIntersection } from "@/components/studio/state/store";
import type { ExplorerNode } from "@/components/studio/types";

interface PropertiesPanelProps {
  selection?: ExplorerNode;
}

export function PropertiesPanel({ selection }: PropertiesPanelProps) {
  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-stroke-0 bg-surface-1">
      <header className="flex items-center justify-between gap-2 border-b border-stroke-0 px-3 py-2">
        <div>
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
            Properties
          </p>
          <p className="mt-0.5 text-[0.78rem] font-medium text-ink-1">
            {selection ? selection.label : "—"}
          </p>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {!selection ? (
          <p className="text-[0.78rem] text-ink-3">
            Select a node in the project explorer to inspect its properties.
          </p>
        ) : selection.kind === "intersection" && selection.intersectionId ? (
          <IntersectionProperties intersectionId={selection.intersectionId} />
        ) : (
          <NodeProperties node={selection} />
        )}
      </div>
    </aside>
  );
}

function IntersectionProperties({ intersectionId }: { intersectionId: string }) {
  const config = useStudioIntersection(intersectionId);
  const intersection = useStudioProjectIntersection(intersectionId);
  const controller =
    intersection?.controllers.find((item) => item.id === config?.controllerId) ??
    intersection?.controllers[0];

  if (!config && !intersection) {
    return (
      <p className="text-[0.78rem] text-ink-3">
        Intersection record not yet available locally.
      </p>
    );
  }

  return (
    <dl className="space-y-3 text-[0.78rem]">
      <PropGroup label="Identity">
        <PropRow label="Code" value={intersection?.code ?? config?.id ?? "—"} mono />
        <PropRow label="Name" value={config?.identity.name ?? intersection?.name ?? "—"} />
        <PropRow label="District" value={config?.identity.district ?? intersection?.district ?? "—"} />
        <PropRow label="Address" value={config?.identity.address ?? intersection?.address ?? "—"} />
      </PropGroup>

      <PropGroup label="Geometry">
        <PropRow
          label="Latitude"
          value={(config?.identity.location.lat ?? intersection?.latitude ?? 0).toFixed(5)}
          mono
        />
        <PropRow
          label="Longitude"
          value={(config?.identity.location.lng ?? intersection?.longitude ?? 0).toFixed(5)}
          mono
        />
      </PropGroup>

      <PropGroup label="Operating">
        <PropRow label="Mode" value={intersection?.controlMode ?? "—"} />
        <PropRow label="Status" value={intersection?.status ?? "—"} />
        <PropRow label="Queue" value={`${intersection?.queueLength ?? 0} veh`} mono />
        <PropRow
          label="Avg delay"
          value={`${intersection?.averageDelaySeconds ?? 0} s`}
          mono
        />
      </PropGroup>

      <PropGroup label="Controller">
        <PropRow label="Controller ID" value={config?.controllerId ?? controller?.id ?? "—"} mono />
        <PropRow label="Controller code" value={controller?.code ?? "—"} mono />
        <PropRow label="Link" value={controller?.connectionState ?? "unknown"} />
        <PropRow label="Firmware" value={controller?.firmwareVersion ?? "—"} mono />
      </PropGroup>
    </dl>
  );
}

function NodeProperties({ node }: { node: ExplorerNode }) {
  return (
    <dl className="space-y-3 text-[0.78rem]">
      <PropGroup label="Node">
        <PropRow label="Type" value={node.kind} />
        <PropRow label="ID" value={node.id} mono />
        <PropRow label="Label" value={node.label} />
        {node.labelAr ? <PropRow label="Label (AR)" value={node.labelAr} /> : null}
        {node.hint ? <PropRow label="Hint" value={node.hint} /> : null}
      </PropGroup>
    </dl>
  );
}

function PropGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
        {label}
      </h3>
      <div className="mt-1.5 divide-y divide-stroke-0 rounded-[6px] border border-stroke-0 bg-surface-2">
        {children}
      </div>
    </section>
  );
}

function PropRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-2.5 py-1.5">
      <dt className="text-ink-2">{label}</dt>
      <dd
        className={
          mono
            ? "font-mono text-ink-1"
            : "truncate text-ink-1"
        }
      >
        {value}
      </dd>
    </div>
  );
}
