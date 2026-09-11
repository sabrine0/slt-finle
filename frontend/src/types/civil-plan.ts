/**
 * Engineering plan data model for an intersection.
 *
 * All coordinates live in a local plan frame measured in METRES,
 * with +X → east, +Y → north and the origin near the intersection
 * centre. Keeping everything metric (not pixels) means the renderer
 * can draw to scale, the PDF exporter can stamp a real scale bar,
 * and DXF export later becomes a trivial unit match.
 */

export interface PlanPoint {
  x: number; // metres east of origin
  y: number; // metres north of origin
}

export type Bearing = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
export type LaneKind = "through" | "left" | "right" | "through-left" | "through-right";
export type SupportKind = "poteau" | "potelet" | "potence";
export type SignalHeadType =
  | "R11v" // vehicle 3-aspect 200mm
  | "R11"
  | "R12" // pedestrian
  | "R14dtd"
  | "R14tg"
  | "SAC";

/**
 * A single directional arm of the intersection — a road that enters
 * the node from one bearing. The `axis` line runs from the node
 * centre outwards along the road axis and defines the arm's local
 * direction; `halfWidth` is half the total roadway width so the
 * renderer can draw curbs on both sides.
 */
export interface RoadArm {
  id: string;
  label: string;
  bearing: Bearing;
  streetName: string;
  axis: { from: PlanPoint; to: PlanPoint };
  halfWidth: number;
  medianWidth?: number;
  lanes: Lane[];
  /** When true, the median carries a BHNS / tramway corridor (paired
   *  rails + ties).  The renderer draws a different median visual. */
  bhns?: boolean;
  /** When true, the rightmost outbound lane is reserved for buses
   *  (drawn with a coloured tint + "BUS" stencil). */
  busLane?: boolean;
}

export interface Lane {
  id: string;
  armId: string;
  offset: number; // signed metres from arm axis (negative = right, positive = left)
  width: number;
  direction: "in" | "out";
  kind: LaneKind;
}

export interface Crosswalk {
  id: string;
  label: string;
  armId: string;
  centre: PlanPoint;
  length: number; // metres across the roadway
  width: number; // metres along the road axis
  angle: number; // radians
}

/**
 * Raised pedestrian refuge island.  In a real Plan d'aménagement these
 * are the dominant visual element of the intersection: blue zebra-hatched
 * pill/oval shapes that vehicles drive around.  Pedestrians cross from
 * curb to refuge to refuge in stages, sheltered between flows.
 */
export interface RefugeIsland {
  id: string;
  label: string;
  centre: PlanPoint;
  shape: "pill" | "oval" | "diamond";
  /** Length along the major axis (metres). */
  length: number;
  /** Width along the minor axis (metres). */
  width: number;
  /** Rotation of the major axis (radians). */
  angle: number;
}

/**
 * A vehicle movement through the node — drawn as a curved arrow that
 * traces the trajectory from an inbound lane to an outbound lane.
 * When this list is omitted on a plan, the renderer derives default
 * movements from each inbound lane's `kind`.
 */
export interface MovementFlow {
  id: string;
  fromLaneId: string;
  toArmId: string;
  kind: "through" | "left" | "right";
  /** Optional explicit path; renderer derives one when omitted. */
  path?: PlanPoint[];
}

export interface StopLine {
  id: string;
  armId: string;
  centre: PlanPoint;
  length: number;
  angle: number;
}

export interface SignalSupport {
  id: string; // e.g. "A", "B", … "P"
  kind: SupportKind;
  position: PlanPoint;
  hardwareLabel: string; // e.g. "R14dtd + R12"
  signalHeads: SignalHead[];
}

export interface SignalHead {
  id: string;
  type: SignalHeadType;
  signalGroupId: string; // logical SG this head belongs to
  orientation: number; // radians; facing direction
}

export interface DetectorLoop {
  id: string; // e.g. "Bcl-01"
  label: string;
  centre: PlanPoint;
  width: number; // along the road axis
  length: number; // across the lane
  angle: number;
  assignedLaneId?: string;
}

export interface CableChamber {
  id: string; // e.g. "1"
  label: string;
  position: PlanPoint;
  size?: number;
  /** Glyph type — "slt" = signaling chamber (pink square), "boucle" =
   *  loop junction box (small dark square).  Defaults to "slt". */
  kind?: "slt" | "boucle";
}

export interface CableRun {
  id: string; // e.g. "C41-A-3.6"
  /** "ring" = ceinturage chamber loop, color magenta;
   *  "signal" = support feeder, color green;
   *  "loop" = loop detector feeder, color orange;
   *  "fiber" = optical fibre, color blue. */
  kind: "signal" | "loop" | "fiber" | "ring";
  /** Chambers traversed, in order. */
  path: PlanPoint[];
  /** Cable spec, e.g. "12 G 1.5mm²". */
  spec: string;
  /** Source equipment reference, e.g. "C04" or chamber id. */
  from: string;
  /** Destination equipment reference, e.g. "A" (support) or "Bcl-01". */
  to: string;
  /** Metres, derived from the path. */
  length: number;
  /** Optional human-readable label printed at the path midpoint
   *  ("C41-A-3.6"). */
  label?: string;
}

export interface ControllerCabinet {
  id: string;
  label: string;
  position: PlanPoint;
  footprint: number;
}

export interface PlanBounds {
  /** Plan frame extents, in metres. Consumer uses this for the SVG viewBox. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface CivilPlan {
  intersectionCode: string;
  intersectionName: string;
  streetNames: string[];
  /** 0 = north up; radians clockwise from geographic north. */
  rotation: number;
  bounds: PlanBounds;
  arms: RoadArm[];
  crosswalks: Crosswalk[];
  refugeIslands?: RefugeIsland[];
  movements?: MovementFlow[];
  stopLines: StopLine[];
  supports: SignalSupport[];
  loops: DetectorLoop[];
  chambers: CableChamber[];
  cableRuns: CableRun[];
  cabinet: ControllerCabinet;
  /** Paper scale for the PDF export, e.g. 1:200 means scale = 200. */
  defaultScale?: number;
  /** Real-world topographic / vector base plan imported for this
   *  intersection.  When present, the renderer draws these layers behind
   *  the engineering layers so the operator edits on top of real
   *  geometry instead of a template. */
  basePlan?: BasePlan;
  baseLayers?: BaseLayerFeature[];
  /** Optional raster/SVG backdrop of the actual consultant étude
   *  (PNG / JPG / SVG).  Rendered under every other layer so the
   *  operator can compose the engineering overlay on top of the real
   *  CAD plan instead of a synthetic template. */
  backdropImage?: BackdropImage;
}

/**
 * Raster (PNG/JPG) or inline-SVG backdrop image positioned in the plan
 * frame.  Image is stored as a data-URL so it survives localStorage
 * round-trips without a backend.
 *
 * Placement is defined by the image centre `(centreX, centreY)` and the
 * real-world width in metres — height is derived from the image's
 * intrinsic aspect ratio at render time.  `rotation` rotates the image
 * around its centre (radians, CCW).
 */
export interface BackdropImage {
  dataUrl: string;
  /** Image source filename, for display in the layer panel. */
  name: string;
  /** Image mime type — used to decide if it's a raster or SVG. */
  mime: string;
  /** Centre of the image in plan-frame metres. */
  centreX: number;
  centreY: number;
  /** Image width on the plan, in metres. */
  widthMetres: number;
  /** Image height on the plan, in metres. */
  heightMetres: number;
  /** Rotation around the centre, in radians (CCW). */
  rotation: number;
  /** Opacity 0–1 so the operator can dim the étude to see the overlay. */
  opacity: number;
}

// ───────────────────────── Base plan (map-located + imported topo)
//
// The plan is always anchored on a real-world place.  `BasePlan` carries
// the locator metadata (Google Map centre/zoom/extent) and records how
// the topographic / vector base was acquired, with per-file metadata
// for traceability.  `baseLayers` are normalised geometry (metres in the
// plan frame) that the renderer draws under the engineering layers.

export type BasePlanSource =
  | "google_located" // located on map; no vector yet
  | "topoexport" // exported from TopoExport (SVG / DXF / GeoJSON)
  | "dxf" // manual DXF upload
  | "svg" // manual SVG upload
  | "geojson" // manual GeoJSON upload
  | "osm" // fetched live from OpenStreetMap (Overpass API)
  | "template"; // fallback template seed only

export interface BasePlanFileMeta {
  name: string;
  sizeBytes: number;
  mime: string;
  /** The normalised layer this file populated. */
  layer?: BaseLayerKind;
  featureCount?: number;
}

export interface BasePlan {
  source: BasePlanSource;
  mapCenter: { lat: number; lng: number };
  mapZoom?: number;
  importExtent?: { widthMetres: number; heightMetres: number };
  /** Rotation of the plan frame relative to geographic north, in
   *  radians (clockwise).  0 = north-up.  Typically matches
   *  `CivilPlan.rotation`. */
  importRotation?: number;
  importedFiles?: BasePlanFileMeta[];
  importedAt?: string; // ISO 8601
  note?: string;
}

export type BaseLayerKind =
  | "roads"
  | "medians"
  | "lane_edges"
  | "crosswalks"
  | "parcels"
  | "buildings"
  | "contours";

export interface BaseLayerFeature {
  id: string;
  kind: BaseLayerKind;
  path: PlanPoint[];
  /** true = closed polygon; false = open polyline. */
  closed: boolean;
  label?: string;
  /** Carriageway width in metres (curb-to-curb).  When set on a road
   *  feature, the renderer paints it as an asphalt strip with red curb
   *  edges instead of a thin centerline. */
  width?: number;
  /** OSM highway category (`primary`, `secondary`, `residential`…) used
   *  by the renderer to tune the asphalt tone and centerline marking. */
  category?: string;
  /** True for closed roundabout perimeters — the renderer draws an
   *  inner curb to produce the dual-ring carriageway look. */
  roundabout?: boolean;
}

export type CivilPlanLayer =
  | "backdrop"
  | "roads"
  | "lanes"
  | "crosswalks"
  | "islands"
  | "movements"
  | "supports"
  | "loops"
  | "chambers"
  | "cables"
  | "labels"
  | "legend";

export const defaultLayerVisibility: Record<CivilPlanLayer, boolean> = {
  backdrop: true,
  roads: true,
  lanes: true,
  crosswalks: true,
  islands: true,
  movements: true,
  supports: true,
  loops: true,
  chambers: true,
  cables: true,
  labels: true,
  legend: true,
};
