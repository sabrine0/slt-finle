export type ExplorerNodeKind =
  | "country"
  | "region"
  | "city"
  | "intersection"
  | "proposals-root"
  | "proposal"
  | "network-root";

export interface ExplorerNode {
  id: string;
  kind: ExplorerNodeKind;
  label: string;
  labelAr?: string;
  hint?: string;
  children?: ExplorerNode[];
  intersectionId?: string;
  cityId?: string;
  regionId?: string;
  /** For locally-saved zone proposals (stored in localStorage). */
  proposalId?: string;
  /** True when this intersection node represents a locally-created
   *  map carrefour rather than a backend engineering intersection. */
  isMapCarrefour?: boolean;
  /** Number of explicit links this intersection is part of, used for
   *  the neighbour-count hint in the tree. */
  linkCount?: number;
}

export type StudioTabKind =
  | "intersection"
  | "plans"
  | "simulation"
  | "deployment"
  | "diagnostics"
  | "network";

export interface StudioTab {
  id: string;
  kind: StudioTabKind;
  label: string;
  closable: boolean;
  intersectionId?: string;
}

export type OutputChannel = "output" | "problems" | "system";

export interface OutputLine {
  channel: OutputChannel;
  level: "info" | "warn" | "error";
  text: string;
  timestamp: string;
}

export interface StudioSelection {
  nodeId?: string;
  intersectionId?: string;
}
