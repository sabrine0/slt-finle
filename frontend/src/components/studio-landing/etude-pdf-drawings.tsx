"use client";
/* eslint-disable react/no-unescaped-entities, jsx-a11y/alt-text --
   French dossier text contains apostrophes that are valid inside
   @react-pdf <Text> children but trip the JSX entity rule. The
   `<Image>` from @react-pdf/renderer is a PDF primitive, not an
   HTML img, so the a11y alt rule does not apply. */

/**
 * SVG-based engineering drawings for the étude carrefour PDF.
 *
 * Each component renders a real vector drawing (lines, rectangles,
 * paths, labels) — not a text placeholder. The drawings target the
 * visual language of a bureau d'études infrastructure dossier :
 *
 *   - white-on-asphalt zebra crossings
 *   - dashed lane markings
 *   - signal head circles with code labels
 *   - directional arrows for permitted movements
 *   - loop detectors as filled rectangles in the chaussée
 *   - cartouche (title block) in the bottom-right
 *   - north arrow + scale bar
 *   - inset borders and frame
 */

import {
  Circle,
  G,
  Image,
  Line,
  Path,
  Polygon,
  Rect,
  Svg,
  Text as SvgText,
  View,
  Page,
  StyleSheet,
} from "@react-pdf/renderer";

import { pdfSafe } from "@/lib/pdf-sanitize";

const ASPHALT = "#1f1f1f";
const ASPHALT_LIGHT = "#2a2a2a";
const PAINT = "#f5f5e8";
const ISLAND = "#d8cda2";
const LOOP = "#0f5fa6";
const LOOP_FILL = "#0f5fa6";
const SIGNAL_FILL = "#0a0a0a";
const PED_BP = "#b8482c";
const ARMOIRE = "#4f3a1f";
const CABLE = "#7a5a23";
const FLOW_GREEN = "#1f7a3a";
const FLOW_GREY = "#8a8a8a";
const INK = "#0a0f0b";
const INK_MUTED = "#46514a";
const BORDER = "#000000";
const BORDER_LIGHT = "#6b6b6b";
const SOFT_BG = "#f4f6f3";
const RED_STOPLINE = "#d22a2a";

// ---------------------------------------------------------------
// Page + cartouche
// ---------------------------------------------------------------

export interface CartoucheMeta {
  project: string;
  carrefourCode: string;
  carrefourLabel: string;
  drawingTitle: string;
  scale: string;
  format: string;
  indice: string;
  date: string;
  redacteur: string;
  verificateur: string;
  approbateur: string;
  sheet: string;
  docCode: string;
}

const d = StyleSheet.create({
  drawingPage: {
    paddingTop: "5mm",
    paddingBottom: "5mm",
    paddingLeft: "5mm",
    paddingRight: "5mm",
    fontFamily: "Helvetica",
    color: INK,
  },
  outerFrame: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 4,
    flexDirection: "column",
  },
  innerFrame: {
    flex: 1,
    borderWidth: 0.4,
    borderColor: BORDER_LIGHT,
    flexDirection: "row",
  },
  drawingArea: {
    flex: 1,
    padding: 6,
  },
  cartoucheBox: {
    width: 175,
    borderLeftWidth: 0.4,
    borderLeftColor: BORDER_LIGHT,
    flexDirection: "column",
    backgroundColor: SOFT_BG,
  },
  cartoucheRow: {
    flexDirection: "row",
    borderBottomWidth: 0.4,
    borderBottomColor: BORDER_LIGHT,
  },
  cartoucheKey: {
    width: 55,
    padding: 3,
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: INK_MUTED,
    borderRightWidth: 0.4,
    borderRightColor: BORDER_LIGHT,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cartoucheValue: {
    flex: 1,
    padding: 3,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: INK,
  },
  cartoucheTitleBox: {
    padding: 4,
    borderBottomWidth: 0.4,
    borderBottomColor: BORDER_LIGHT,
    backgroundColor: "#dfe8da",
  },
  cartoucheTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#0e4d22",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  cartoucheSubtitle: {
    fontSize: 6.5,
    color: INK_MUTED,
    marginTop: 1,
  },
  cartoucheBottom: {
    padding: 3,
    fontSize: 6.5,
    color: INK_MUTED,
  },
  cartoucheBottomBold: {
    fontFamily: "Helvetica-Bold",
    color: INK,
    fontSize: 7,
  },
});

export function DrawingPage({
  meta,
  children,
}: {
  meta: CartoucheMeta;
  children: React.ReactNode;
}) {
  return (
    <Page size="A4" orientation="landscape" style={d.drawingPage}>
      <View style={d.outerFrame}>
        <View style={d.innerFrame}>
          <View style={d.drawingArea}>{children}</View>
          <Cartouche meta={meta} />
        </View>
      </View>
    </Page>
  );
}

function Cartouche({ meta }: { meta: CartoucheMeta }) {
  return (
    <View style={d.cartoucheBox}>
      <View style={d.cartoucheTitleBox}>
        <SvgText style={d.cartoucheTitle}>{pdfSafe(meta.drawingTitle)}</SvgText>
        <SvgText style={d.cartoucheSubtitle}>
          {pdfSafe(`${meta.carrefourCode} — ${meta.carrefourLabel}`)}
        </SvgText>
      </View>

      <CartoucheKV k="Projet" v={meta.project} />
      <CartoucheKV k="Site" v={meta.carrefourCode} />
      <CartoucheKV k="Echelle" v={meta.scale} />
      <CartoucheKV k="Format" v={meta.format} />
      <CartoucheKV k="Indice" v={meta.indice} />
      <CartoucheKV k="Date" v={meta.date} />

      <View style={d.cartoucheRow}>
        <SvgText style={[d.cartoucheKey, { width: 55 }]}>Redacteur</SvgText>
        <SvgText style={d.cartoucheValue}>{pdfSafe(meta.redacteur)}</SvgText>
      </View>
      <View style={d.cartoucheRow}>
        <SvgText style={[d.cartoucheKey, { width: 55 }]}>Verif.</SvgText>
        <SvgText style={d.cartoucheValue}>{pdfSafe(meta.verificateur)}</SvgText>
      </View>
      <View style={d.cartoucheRow}>
        <SvgText style={[d.cartoucheKey, { width: 55 }]}>Approb.</SvgText>
        <SvgText style={d.cartoucheValue}>{pdfSafe(meta.approbateur)}</SvgText>
      </View>

      <View
        style={[
          d.cartoucheRow,
          { borderBottomWidth: 0, paddingHorizontal: 4, paddingVertical: 3 },
        ]}
      >
        <View style={{ flex: 1 }}>
          <SvgText style={d.cartoucheBottom}>Code</SvgText>
          <SvgText style={d.cartoucheBottomBold}>{pdfSafe(meta.docCode)}</SvgText>
        </View>
        <View style={{ width: 50, alignItems: "flex-end" }}>
          <SvgText style={d.cartoucheBottom}>Feuille</SvgText>
          <SvgText style={d.cartoucheBottomBold}>{pdfSafe(meta.sheet)}</SvgText>
        </View>
      </View>
    </View>
  );
}

function CartoucheKV({ k, v }: { k: string; v: string }) {
  return (
    <View style={d.cartoucheRow}>
      <SvgText style={d.cartoucheKey}>{pdfSafe(k)}</SvgText>
      <SvgText style={d.cartoucheValue}>{pdfSafe(v)}</SvgText>
    </View>
  );
}

// ---------------------------------------------------------------
// Helpers (SVG primitives)
// ---------------------------------------------------------------

interface NorthArrowProps {
  x: number;
  y: number;
  size?: number;
}

function NorthArrow({ x, y, size = 36 }: NorthArrowProps) {
  const half = size / 2;
  return (
    <G>
      <Circle
        cx={x}
        cy={y}
        r={half}
        fill="#ffffff"
        stroke={BORDER}
        strokeWidth={0.6}
      />
      {/* Pointer (filled triangle) */}
      <Polygon
        points={`${x},${y - half + 4} ${x - 6},${y + 4} ${x + 6},${y + 4}`}
        fill={INK}
      />
      <Polygon
        points={`${x},${y + half - 4} ${x - 5},${y - 2} ${x + 5},${y - 2}`}
        fill="#ffffff"
        stroke={INK}
        strokeWidth={0.4}
      />
      <SvgText
        x={x}
        y={y - half - 3}
        textAnchor="middle"
        style={{ fontSize: 8, fontFamily: "Helvetica-Bold", fill: INK }}
      >
        N
      </SvgText>
    </G>
  );
}

interface ScaleBarProps {
  x: number;
  y: number;
  /** length in SVG units */
  length: number;
  label: string;
}

function ScaleBar({ x, y, length, label }: ScaleBarProps) {
  const halfLen = length / 2;
  return (
    <G>
      <Rect
        x={x}
        y={y}
        width={halfLen}
        height={5}
        fill={INK}
        stroke={INK}
        strokeWidth={0.4}
      />
      <Rect
        x={x + halfLen}
        y={y}
        width={halfLen}
        height={5}
        fill="#ffffff"
        stroke={INK}
        strokeWidth={0.4}
      />
      <SvgText
        x={x}
        y={y - 2}
        style={{ fontSize: 6, fill: INK }}
      >
        0
      </SvgText>
      <SvgText
        x={x + length}
        y={y - 2}
        style={{ fontSize: 6, fill: INK }}
        textAnchor="end"
      >
        {label}
      </SvgText>
    </G>
  );
}

interface LegendItem {
  swatch: string;
  swatchType?: "fill" | "line" | "dashed" | "circle";
  label: string;
}

function Legend({
  x,
  y,
  width,
  items,
  title = "Légende",
}: {
  x: number;
  y: number;
  width: number;
  items: LegendItem[];
  title?: string;
}) {
  const rowHeight = 10;
  const headerH = 14;
  const totalH = headerH + items.length * rowHeight + 6;
  return (
    <G>
      <Rect
        x={x}
        y={y}
        width={width}
        height={totalH}
        fill="#ffffff"
        stroke={BORDER}
        strokeWidth={0.6}
      />
      <Rect
        x={x}
        y={y}
        width={width}
        height={headerH}
        fill="#dfe8da"
      />
      <SvgText
        x={x + 4}
        y={y + 9}
        style={{ fontSize: 7, fontFamily: "Helvetica-Bold", fill: "#0e4d22" }}
      >
        {pdfSafe(title.toUpperCase())}
      </SvgText>
      {items.map((item, idx) => {
        const cy = y + headerH + 4 + idx * rowHeight;
        return (
          <G key={idx}>
            {renderLegendSwatch(item, x + 4, cy)}
            <SvgText
              x={x + 22}
              y={cy + 4}
              style={{ fontSize: 6.5, fill: INK }}
            >
              {pdfSafe(item.label)}
            </SvgText>
          </G>
        );
      })}
    </G>
  );
}

function renderLegendSwatch(item: LegendItem, x: number, y: number) {
  switch (item.swatchType ?? "fill") {
    case "line":
      return (
        <Line
          x1={x}
          y1={y + 2}
          x2={x + 14}
          y2={y + 2}
          stroke={item.swatch}
          strokeWidth={1.4}
        />
      );
    case "dashed":
      return (
        <Line
          x1={x}
          y1={y + 2}
          x2={x + 14}
          y2={y + 2}
          stroke={item.swatch}
          strokeWidth={1}
          strokeDasharray="2 2"
        />
      );
    case "circle":
      return (
        <Circle
          cx={x + 7}
          cy={y + 2}
          r={3}
          fill={item.swatch}
          stroke={INK}
          strokeWidth={0.3}
        />
      );
    default:
      return (
        <Rect
          x={x}
          y={y - 1}
          width={14}
          height={6}
          fill={item.swatch}
          stroke={BORDER}
          strokeWidth={0.3}
        />
      );
  }
}

// Draw an arrow at (x,y) pointing in `direction` (degrees, 0 = east).
function Arrow({
  x,
  y,
  direction,
  length = 24,
  color = FLOW_GREEN,
  width = 4,
}: {
  x: number;
  y: number;
  direction: number; // degrees
  length?: number;
  color?: string;
  width?: number;
}) {
  const rad = (direction * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const tailX = x - dx * length;
  const tailY = y - dy * length;
  // Arrowhead points
  const headLen = 7;
  const headWidth = 5;
  const perpX = -dy;
  const perpY = dx;
  const tipX = x;
  const tipY = y;
  const baseX = x - dx * headLen;
  const baseY = y - dy * headLen;
  const leftX = baseX + perpX * headWidth;
  const leftY = baseY + perpY * headWidth;
  const rightX = baseX - perpX * headWidth;
  const rightY = baseY - perpY * headWidth;
  return (
    <G>
      <Line
        x1={tailX}
        y1={tailY}
        x2={baseX}
        y2={baseY}
        stroke={color}
        strokeWidth={width}
      />
      <Polygon
        points={`${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`}
        fill={color}
      />
    </G>
  );
}

// ---------------------------------------------------------------
// Carrefour schematic (cross intersection)
//
// Coordinate system: viewBox 0 0 1000 700, center (500, 350).
// Boulevard E-W : horizontal asphalt strip, 2x2 lanes, total height
//   ~140. Avenue N-S : vertical strip, 1x1 lanes, total width ~100.
// Stop lines + zebras at the 4 entries. Signal heads on each
// approach with labels V1..V6 + P1..P4.
// ---------------------------------------------------------------

const CX = 500;
const CY = 350;
const BLVD_HALF_W = 70; // half-height of the boulevard strip = 70 → height 140
const AVE_HALF_W = 50; // half-width of the avenue strip = 50 → width 100

interface SchematicOptions {
  detection?: boolean;
}

export function CarrefourSchematic({ detection = false }: SchematicOptions) {
  return (
    <Svg viewBox="0 0 1000 700" style={{ flex: 1, width: "100%", height: "100%" }}>
      {/* Page background (slightly off-white) */}
      <Rect x={0} y={0} width={1000} height={700} fill="#fbfaf3" />

      {/* Sidewalks (rectangles framing the carrefour) */}
      {/* North-east sidewalk */}
      <Rect
        x={CX + AVE_HALF_W}
        y={0}
        width={1000 - (CX + AVE_HALF_W)}
        height={CY - BLVD_HALF_W}
        fill={ISLAND}
      />
      {/* North-west sidewalk */}
      <Rect
        x={0}
        y={0}
        width={CX - AVE_HALF_W}
        height={CY - BLVD_HALF_W}
        fill={ISLAND}
      />
      {/* South-east sidewalk */}
      <Rect
        x={CX + AVE_HALF_W}
        y={CY + BLVD_HALF_W}
        width={1000 - (CX + AVE_HALF_W)}
        height={700 - (CY + BLVD_HALF_W)}
        fill={ISLAND}
      />
      {/* South-west sidewalk */}
      <Rect
        x={0}
        y={CY + BLVD_HALF_W}
        width={CX - AVE_HALF_W}
        height={700 - (CY + BLVD_HALF_W)}
        fill={ISLAND}
      />

      {/* Boulevard (E-W) asphalt */}
      <Rect
        x={0}
        y={CY - BLVD_HALF_W}
        width={1000}
        height={BLVD_HALF_W * 2}
        fill={ASPHALT}
      />
      {/* Avenue (N-S) asphalt */}
      <Rect
        x={CX - AVE_HALF_W}
        y={0}
        width={AVE_HALF_W * 2}
        height={700}
        fill={ASPHALT}
      />
      {/* Intersection box (slightly lighter) */}
      <Rect
        x={CX - AVE_HALF_W}
        y={CY - BLVD_HALF_W}
        width={AVE_HALF_W * 2}
        height={BLVD_HALF_W * 2}
        fill={ASPHALT_LIGHT}
      />

      {/* Boulevard lane separators (dashed white centerline) */}
      <Line
        x1={0}
        y1={CY}
        x2={CX - AVE_HALF_W}
        y2={CY}
        stroke={PAINT}
        strokeWidth={2}
        strokeDasharray="10 8"
      />
      <Line
        x1={CX + AVE_HALF_W}
        y1={CY}
        x2={1000}
        y2={CY}
        stroke={PAINT}
        strokeWidth={2}
        strokeDasharray="10 8"
      />
      {/* Boulevard intra-direction lane lines (2 lanes per direction) */}
      <Line
        x1={0}
        y1={CY - 35}
        x2={CX - AVE_HALF_W}
        y2={CY - 35}
        stroke={PAINT}
        strokeWidth={1.2}
        strokeDasharray="6 6"
      />
      <Line
        x1={0}
        y1={CY + 35}
        x2={CX - AVE_HALF_W}
        y2={CY + 35}
        stroke={PAINT}
        strokeWidth={1.2}
        strokeDasharray="6 6"
      />
      <Line
        x1={CX + AVE_HALF_W}
        y1={CY - 35}
        x2={1000}
        y2={CY - 35}
        stroke={PAINT}
        strokeWidth={1.2}
        strokeDasharray="6 6"
      />
      <Line
        x1={CX + AVE_HALF_W}
        y1={CY + 35}
        x2={1000}
        y2={CY + 35}
        stroke={PAINT}
        strokeWidth={1.2}
        strokeDasharray="6 6"
      />

      {/* Avenue lane centerline */}
      <Line
        x1={CX}
        y1={0}
        x2={CX}
        y2={CY - BLVD_HALF_W}
        stroke={PAINT}
        strokeWidth={2}
        strokeDasharray="10 8"
      />
      <Line
        x1={CX}
        y1={CY + BLVD_HALF_W}
        x2={CX}
        y2={700}
        stroke={PAINT}
        strokeWidth={2}
        strokeDasharray="10 8"
      />

      {/* Stop lines (solid white, drawn slightly inside intersection box) */}
      {/* East entry stop line (vehicles moving westward stop here, so on the east side of intersection — actually entry from east means coming from east, so stop line is east of intersection) */}
      {/* From west, vehicles enter on the right-hand carriageway (lower) — but for clarity we paint stop lines on each approach BEFORE entering the intersection square. */}
      <Line
        x1={CX - AVE_HALF_W - 2}
        y1={CY - BLVD_HALF_W}
        x2={CX - AVE_HALF_W - 2}
        y2={CY}
        stroke={PAINT}
        strokeWidth={3.5}
      />
      <Line
        x1={CX + AVE_HALF_W + 2}
        y1={CY}
        x2={CX + AVE_HALF_W + 2}
        y2={CY + BLVD_HALF_W}
        stroke={PAINT}
        strokeWidth={3.5}
      />
      <Line
        x1={CX - AVE_HALF_W}
        y1={CY - BLVD_HALF_W - 2}
        x2={CX}
        y2={CY - BLVD_HALF_W - 2}
        stroke={PAINT}
        strokeWidth={3.5}
      />
      <Line
        x1={CX}
        y1={CY + BLVD_HALF_W + 2}
        x2={CX + AVE_HALF_W}
        y2={CY + BLVD_HALF_W + 2}
        stroke={PAINT}
        strokeWidth={3.5}
      />

      {/* Zebra crossings (one per branch) */}
      <ZebraVertical x={CX - AVE_HALF_W - 30} y={CY - BLVD_HALF_W} height={BLVD_HALF_W * 2} />
      <ZebraVertical x={CX + AVE_HALF_W + 18} y={CY - BLVD_HALF_W} height={BLVD_HALF_W * 2} />
      <ZebraHorizontal x={CX - AVE_HALF_W} y={CY - BLVD_HALF_W - 30} width={AVE_HALF_W * 2} />
      <ZebraHorizontal x={CX - AVE_HALF_W} y={CY + BLVD_HALF_W + 18} width={AVE_HALF_W * 2} />

      {/* Lane direction arrows (movements per approach) */}
      {/* Eastbound — exits to East. Vehicles coming from West heading East. */}
      <Arrow x={CX - AVE_HALF_W - 80} y={CY + 18} direction={0} color={PAINT} width={2.5} />
      <Arrow x={CX - AVE_HALF_W - 80} y={CY + 50} direction={0} color={PAINT} width={2.5} />
      <Arrow x={CX - AVE_HALF_W - 110} y={CY - 18} direction={0} color={PAINT} width={2.5} />
      {/* Westbound */}
      <Arrow x={CX + AVE_HALF_W + 80} y={CY - 18} direction={180} color={PAINT} width={2.5} />
      <Arrow x={CX + AVE_HALF_W + 80} y={CY - 50} direction={180} color={PAINT} width={2.5} />
      <Arrow x={CX + AVE_HALF_W + 110} y={CY + 18} direction={180} color={PAINT} width={2.5} />
      {/* Northbound */}
      <Arrow x={CX - 18} y={CY + BLVD_HALF_W + 80} direction={-90} color={PAINT} width={2.5} />
      {/* Southbound */}
      <Arrow x={CX + 18} y={CY - BLVD_HALF_W - 80} direction={90} color={PAINT} width={2.5} />

      {/* Signal heads V1..V6 + P1..P4 */}
      {/* V1: east approach right side (vehicles going westward from east approach blocked here — meaning vehicles coming from East), top-right of intersection */}
      <SignalHead x={CX + AVE_HALF_W + 12} y={CY - BLVD_HALF_W + 14} label="V3" />
      <SignalHead x={CX + AVE_HALF_W + 12} y={CY - BLVD_HALF_W + 36} label="V4" />
      <SignalHead x={CX - AVE_HALF_W - 12} y={CY + BLVD_HALF_W - 14} label="V1" />
      <SignalHead x={CX - AVE_HALF_W - 12} y={CY + BLVD_HALF_W - 36} label="V2" />
      <SignalHead x={CX + AVE_HALF_W - 14} y={CY + BLVD_HALF_W + 12} label="V5" />
      <SignalHead x={CX - AVE_HALF_W + 14} y={CY - BLVD_HALF_W - 12} label="V6" />
      <PedestrianHead x={CX - AVE_HALF_W - 36} y={CY + BLVD_HALF_W - 5} label="P1" />
      <PedestrianHead x={CX + AVE_HALF_W + 24} y={CY + BLVD_HALF_W - 5} label="P2" />
      <PedestrianHead x={CX - AVE_HALF_W + 7} y={CY - BLVD_HALF_W - 36} label="P3" />
      <PedestrianHead x={CX - AVE_HALF_W + 7} y={CY + BLVD_HALF_W + 24} label="P4" />

      {/* Branch labels */}
      <BranchLabel x={50} y={CY} text="W" sub="Bd Mohammed VI ←" />
      <BranchLabel x={1000 - 50} y={CY} text="E" sub="→ Bd Mohammed VI" anchor="end" />
      <BranchLabel x={CX} y={30} text="N" sub="Av. d'Espagne" anchor="middle" />
      <BranchLabel x={CX} y={680} text="S" sub="Av. d'Espagne" anchor="middle" />

      {/* North arrow + scale bar */}
      <NorthArrow x={60} y={70} size={36} />
      <ScaleBar x={840} y={650} length={120} label="20 m" />

      {/* Detection overlay (loops, BP, armoire, cables) */}
      {detection ? <DetectionLayer /> : null}

      {/* Legend bottom-left */}
      <Legend
        x={20}
        y={530}
        width={210}
        title={detection ? "Plan de detection" : "Plan d'amenagement"}
        items={
          detection
            ? [
                { swatch: ASPHALT, label: "Chaussee (asphalte)" },
                { swatch: ISLAND, label: "Trottoir / espace pieton" },
                { swatch: PAINT, label: "Marquage routier (peinture)", swatchType: "line" },
                { swatch: LOOP_FILL, label: "Boucle inductive (BCL-*)" },
                { swatch: PED_BP, label: "Bouton-poussoir pieton (BP-*)" },
                { swatch: ARMOIRE, label: "Armoire technique" },
                { swatch: CABLE, label: "Cable d'alimentation/detection", swatchType: "dashed" },
              ]
            : [
                { swatch: ASPHALT, label: "Chaussee (asphalte)" },
                { swatch: ISLAND, label: "Trottoir / espace pieton" },
                { swatch: PAINT, label: "Marquage / fleches de mouvement", swatchType: "line" },
                { swatch: SIGNAL_FILL, label: "Feu tricolore VP (V1..V6)", swatchType: "circle" },
                { swatch: PED_BP, label: "Feu pieton (P1..P4)", swatchType: "fill" },
                { swatch: RED_STOPLINE, label: "Ligne d'arret", swatchType: "line" },
              ]
        }
      />
    </Svg>
  );
}

function ZebraVertical({
  x,
  y,
  height,
  stripeCount = 5,
}: {
  x: number;
  y: number;
  height: number;
  stripeCount?: number;
}) {
  const stripeHeight = height / (stripeCount * 2 - 1);
  const stripes: React.ReactElement[] = [];
  for (let i = 0; i < stripeCount; i += 1) {
    stripes.push(
      <Rect
        key={i}
        x={x}
        y={y + i * stripeHeight * 2}
        width={14}
        height={stripeHeight}
        fill={PAINT}
      />,
    );
  }
  return <G>{stripes}</G>;
}

function ZebraHorizontal({
  x,
  y,
  width,
  stripeCount = 5,
}: {
  x: number;
  y: number;
  width: number;
  stripeCount?: number;
}) {
  const stripeWidth = width / (stripeCount * 2 - 1);
  const stripes: React.ReactElement[] = [];
  for (let i = 0; i < stripeCount; i += 1) {
    stripes.push(
      <Rect
        key={i}
        x={x + i * stripeWidth * 2}
        y={y}
        width={stripeWidth}
        height={14}
        fill={PAINT}
      />,
    );
  }
  return <G>{stripes}</G>;
}

function SignalHead({
  x,
  y,
  label,
}: {
  x: number;
  y: number;
  label: string;
}) {
  return (
    <G>
      <Rect
        x={x - 7}
        y={y - 10}
        width={14}
        height={20}
        fill={SIGNAL_FILL}
        stroke="#ffffff"
        strokeWidth={0.4}
        rx={2}
      />
      <Circle cx={x} cy={y - 4} r={3} fill="#d22a2a" />
      <Circle cx={x} cy={y + 1} r={3} fill="#e6b400" />
      <Circle cx={x} cy={y + 6} r={3} fill="#1f7a3a" />
      <Rect
        x={x + 9}
        y={y - 6}
        width={20}
        height={12}
        fill="#ffffff"
        stroke={INK}
        strokeWidth={0.3}
      />
      <SvgText
        x={x + 19}
        y={y + 2}
        textAnchor="middle"
        style={{ fontSize: 7, fontFamily: "Helvetica-Bold", fill: INK }}
      >
        {label}
      </SvgText>
    </G>
  );
}

function PedestrianHead({
  x,
  y,
  label,
}: {
  x: number;
  y: number;
  label: string;
}) {
  return (
    <G>
      <Rect
        x={x - 6}
        y={y - 6}
        width={12}
        height={12}
        fill={SIGNAL_FILL}
        stroke="#ffffff"
        strokeWidth={0.4}
        rx={1.5}
      />
      <Circle cx={x} cy={y - 2} r={2} fill="#d22a2a" />
      <Circle cx={x} cy={y + 2} r={2} fill="#1f7a3a" />
      <Rect
        x={x + 8}
        y={y - 5}
        width={16}
        height={10}
        fill="#ffffff"
        stroke={INK}
        strokeWidth={0.3}
      />
      <SvgText
        x={x + 16}
        y={y + 2}
        textAnchor="middle"
        style={{ fontSize: 6, fontFamily: "Helvetica-Bold", fill: PED_BP }}
      >
        {label}
      </SvgText>
    </G>
  );
}

function BranchLabel({
  x,
  y,
  text,
  sub,
  anchor = "start",
}: {
  x: number;
  y: number;
  text: string;
  sub: string;
  anchor?: "start" | "middle" | "end";
}) {
  return (
    <G>
      <SvgText
        x={x}
        y={y}
        textAnchor={anchor}
        style={{
          fontSize: 14,
          fontFamily: "Helvetica-Bold",
          fill: INK,
          letterSpacing: 2,
        }}
      >
        {text}
      </SvgText>
      <SvgText
        x={x}
        y={y + 14}
        textAnchor={anchor}
        style={{ fontSize: 7, fill: INK_MUTED }}
      >
        {pdfSafe(sub)}
      </SvgText>
    </G>
  );
}

// ---------------------------------------------------------------
// Detection overlay (loops + BP + armoire + cables)
// ---------------------------------------------------------------

function DetectionLayer() {
  return (
    <G>
      {/* Vehicle loops — placed 25 m upstream of stop lines on each
          approach. Drawn as filled rectangles in the lane with a
          small ID tag. */}
      {/* East approach: BCL-E1 (right lane), BCL-E2 (left lane) — vehicles coming from east go west, so they enter from x>CX */}
      <DetectorLoop x={CX + AVE_HALF_W + 100} y={CY - 50} code="BCL-E1" />
      <DetectorLoop x={CX + AVE_HALF_W + 160} y={CY - 18} code="BCL-E2" />
      {/* West approach */}
      <DetectorLoop x={CX - AVE_HALF_W - 120} y={CY + 18} code="BCL-W1" />
      <DetectorLoop x={CX - AVE_HALF_W - 180} y={CY + 50} code="BCL-W2" />
      {/* North approach */}
      <DetectorLoop x={CX - 18} y={CY - BLVD_HALF_W - 130} code="BCL-N1" />
      {/* South approach */}
      <DetectorLoop x={CX + 18} y={CY + BLVD_HALF_W + 130} code="BCL-S1" />

      {/* BP piéton symbols on each crossing approach */}
      <BPSymbol x={CX - AVE_HALF_W - 50} y={CY + BLVD_HALF_W + 28} code="BP-P1" />
      <BPSymbol x={CX + AVE_HALF_W + 50} y={CY + BLVD_HALF_W + 28} code="BP-P2" />
      <BPSymbol x={CX - AVE_HALF_W - 50} y={CY - BLVD_HALF_W - 28} code="BP-P3" />
      <BPSymbol x={CX + AVE_HALF_W + 50} y={CY - BLVD_HALF_W - 28} code="BP-P4" />

      {/* Armoire technique south-east corner */}
      <Armoire x={CX + AVE_HALF_W + 80} y={CY + BLVD_HALF_W + 80} />

      {/* Cable runs (dashed) from each device to the armoire */}
      <CableRun
        from={{ x: CX + AVE_HALF_W + 100, y: CY - 50 }}
        to={{ x: CX + AVE_HALF_W + 80, y: CY + BLVD_HALF_W + 80 }}
      />
      <CableRun
        from={{ x: CX + AVE_HALF_W + 50, y: CY + BLVD_HALF_W + 28 }}
        to={{ x: CX + AVE_HALF_W + 80, y: CY + BLVD_HALF_W + 80 }}
      />
      <CableRun
        from={{ x: CX - 18, y: CY - BLVD_HALF_W - 130 }}
        to={{ x: CX + AVE_HALF_W + 80, y: CY + BLVD_HALF_W + 80 }}
      />
      <CableRun
        from={{ x: CX - AVE_HALF_W - 120, y: CY + 18 }}
        to={{ x: CX + AVE_HALF_W + 80, y: CY + BLVD_HALF_W + 80 }}
      />
    </G>
  );
}

function DetectorLoop({ x, y, code }: { x: number; y: number; code: string }) {
  return (
    <G>
      <Rect
        x={x - 18}
        y={y - 6}
        width={36}
        height={12}
        fill={LOOP_FILL}
        opacity={0.65}
        stroke={LOOP}
        strokeWidth={0.5}
      />
      <Rect
        x={x - 18}
        y={y - 6}
        width={36}
        height={12}
        fill="none"
        stroke={LOOP}
        strokeWidth={0.5}
        strokeDasharray="3 2"
      />
      <SvgText
        x={x}
        y={y + 3}
        textAnchor="middle"
        style={{ fontSize: 6.5, fontFamily: "Helvetica-Bold", fill: "#ffffff" }}
      >
        {code}
      </SvgText>
    </G>
  );
}

function BPSymbol({ x, y, code }: { x: number; y: number; code: string }) {
  return (
    <G>
      <Rect
        x={x - 6}
        y={y - 6}
        width={12}
        height={12}
        fill={PED_BP}
        stroke={INK}
        strokeWidth={0.4}
      />
      <SvgText
        x={x}
        y={y + 2.5}
        textAnchor="middle"
        style={{ fontSize: 6, fontFamily: "Helvetica-Bold", fill: "#ffffff" }}
      >
        BP
      </SvgText>
      <SvgText
        x={x}
        y={y + 16}
        textAnchor="middle"
        style={{ fontSize: 5.5, fill: INK }}
      >
        {code}
      </SvgText>
    </G>
  );
}

function Armoire({ x, y }: { x: number; y: number }) {
  return (
    <G>
      <Rect
        x={x - 14}
        y={y - 10}
        width={28}
        height={20}
        fill={ARMOIRE}
        stroke={INK}
        strokeWidth={0.5}
      />
      <SvgText
        x={x}
        y={y - 14}
        textAnchor="middle"
        style={{ fontSize: 6.5, fontFamily: "Helvetica-Bold", fill: ARMOIRE }}
      >
        ARMOIRE
      </SvgText>
      <SvgText
        x={x}
        y={y + 22}
        textAnchor="middle"
        style={{ fontSize: 5.5, fill: INK }}
      >
        Contrôleur ATC + RPi + UPS
      </SvgText>
    </G>
  );
}

function CableRun({
  from,
  to,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
}) {
  // Use a manhattan / L-shaped route for clarity.
  return (
    <Path
      d={`M ${from.x} ${from.y} L ${from.x} ${to.y} L ${to.x} ${to.y}`}
      stroke={CABLE}
      strokeWidth={0.7}
      strokeDasharray="3 3"
      fill="none"
    />
  );
}

// ---------------------------------------------------------------
// Plan de situation — real geographic imagery (Google Maps Static)
//
// The main view is a high-DPI hybrid satellite tile centred on the
// carrefour, embedded as a base64-encoded PNG. A locator inset
// (zoom 14, roadmap) sits in the top-left. SVG annotations sit on
// top : intersection callout, control-zone radius, corridor labels,
// direction arrows, north arrow, scale bar, frame border.
// ---------------------------------------------------------------

interface SituationMapRealProps {
  latitude: number | null;
  longitude: number | null;
  intersectionCode: string | null;
  intersectionLabel: string;
  district: string | null;
  mainDataUri: string | null;
  insetDataUri: string | null;
  mainZoom: number;
}

export function SituationMapReal({
  latitude,
  longitude,
  intersectionCode,
  intersectionLabel,
  district,
  mainDataUri,
  insetDataUri,
  mainZoom,
}: SituationMapRealProps) {
  if (!mainDataUri) {
    return (
      <SituationMap latitude={latitude} longitude={longitude} />
    );
  }

  const coordLabel =
    latitude != null && longitude != null
      ? `${latitude.toFixed(6)} N  /  ${longitude.toFixed(6)} E  (WGS 84)`
      : "Coordonnees a renseigner";

  // Approximate metres-per-pixel at the equator for Mercator :
  //   metres/pixel = 156543.03 * cos(lat) / 2^zoom (scale=1)
  // With scale=2 the value is halved when measured at PDF pixel
  // density. We just produce a sensible scale-bar label.
  const lat = latitude ?? 35.78;
  const mPerPx = (156543.03 * Math.cos((lat * Math.PI) / 180)) / 2 ** mainZoom;
  // Image is 640x440 native, rendered to roughly 700 SVG units wide.
  // 100 SVG units corresponds to about: mPerPx * (640/700) * 100 m.
  const metersFor100Units = Math.round(mPerPx * (640 / 700) * 100);
  const scaleLabel = `${metersFor100Units} m`;

  return (
    <View style={{ flex: 1 }}>
      {/* Map base layer (raster) */}
      <Image
        src={mainDataUri}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          objectFit: "cover",
        }}
      />

      {/* Vector annotation overlay (SVG over the raster) */}
      <Svg
        viewBox="0 0 1000 700"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
        }}
      >
        {/* Inner frame for the drawing area */}
        <Rect
          x={4}
          y={4}
          width={992}
          height={692}
          fill="none"
          stroke="#000000"
          strokeWidth={1}
        />

        {/* Control-zone circle around the intersection */}
        <Circle
          cx={500}
          cy={350}
          r={170}
          fill="#ffd64d"
          opacity={0.07}
          stroke="#ffd64d"
          strokeWidth={1.2}
          strokeDasharray="6 4"
        />
        <SvgText
          x={500}
          y={185}
          textAnchor="middle"
          style={{
            fontSize: 6,
            fontFamily: "Helvetica-Bold",
            fill: "#ffd64d",
            letterSpacing: 1.5,
          }}
        >
          ZONE DE CONTROLE STLS  -  R ~ 100 M
        </SvgText>

        {/* Intersection crosshair at centre */}
        <G>
          <Line x1={485} y1={350} x2={515} y2={350} stroke="#d22a2a" strokeWidth={1.2} />
          <Line x1={500} y1={335} x2={500} y2={365} stroke="#d22a2a" strokeWidth={1.2} />
          <Circle cx={500} cy={350} r={11} fill="none" stroke="#d22a2a" strokeWidth={1.6} />
        </G>

        {/* Callout connector from intersection to label box */}
        <Line
          x1={511}
          y1={350}
          x2={760}
          y2={230}
          stroke="#0a0a0a"
          strokeWidth={0.8}
        />
        <Rect
          x={760}
          y={210}
          width={220}
          height={68}
          fill="#ffffff"
          stroke="#0a0a0a"
          strokeWidth={0.8}
        />
        <Rect
          x={760}
          y={210}
          width={220}
          height={14}
          fill="#0e4d22"
        />
        <SvgText
          x={770}
          y={221}
          style={{
            fontSize: 8,
            fontFamily: "Helvetica-Bold",
            fill: "#ffffff",
            letterSpacing: 1,
          }}
        >
          {pdfSafe(`CARREFOUR ${intersectionCode ?? "—"}`)}
        </SvgText>
        <SvgText
          x={770}
          y={239}
          style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", fill: "#0a0a0a" }}
        >
          {pdfSafe(intersectionLabel)}
        </SvgText>
        {district ? (
          <SvgText
            x={770}
            y={252}
            style={{ fontSize: 6.5, fill: "#46514a" }}
          >
            {pdfSafe(`Quartier : ${district}`)}
          </SvgText>
        ) : null}
        <SvgText
          x={770}
          y={265}
          style={{ fontSize: 6.5, fontFamily: "Courier", fill: "#46514a" }}
        >
          {pdfSafe(coordLabel)}
        </SvgText>

        {/* Corridor name labels (top-left and bottom-right of the
            satellite, just outside the control-zone circle, on a
            white pill background for readability). */}
        <CorridorLabel
          x={170}
          y={335}
          width={150}
          text="BD MOHAMMED VI"
          sub="Corridor principal — E/W"
        />
        <CorridorLabel
          x={520}
          y={520}
          width={150}
          text="AV. D'ESPAGNE"
          sub="Voie secondaire — N/S"
        />

        {/* Directional arrows on the corridors (oriented per axis) */}
        <Arrow x={220} y={350} direction={180} length={36} color="#ffd64d" width={4} />
        <Arrow x={780} y={350} direction={0} length={36} color="#ffd64d" width={4} />
        <Arrow x={500} y={170} direction={-90} length={36} color="#ffd64d" width={4} />
        <Arrow x={500} y={540} direction={90} length={36} color="#ffd64d" width={4} />

        {/* North arrow top-right */}
        <G transform="translate(940, 50)">
          <Circle cx={0} cy={0} r={22} fill="#ffffff" stroke="#0a0a0a" strokeWidth={0.6} />
          <Polygon points="0,-18 -5,4 5,4" fill="#0a0a0a" />
          <Polygon points="0,18 -4,-2 4,-2" fill="#ffffff" stroke="#0a0a0a" strokeWidth={0.4} />
          <SvgText
            x={0}
            y={-24}
            textAnchor="middle"
            style={{ fontSize: 9, fontFamily: "Helvetica-Bold", fill: "#0a0a0a" }}
          >
            N
          </SvgText>
        </G>

        {/* Scale bar bottom-right (approx) */}
        <G transform="translate(820, 660)">
          <Rect x={0} y={0} width={50} height={5} fill="#0a0a0a" stroke="#0a0a0a" strokeWidth={0.4} />
          <Rect x={50} y={0} width={50} height={5} fill="#ffffff" stroke="#0a0a0a" strokeWidth={0.4} />
          <SvgText x={0} y={-2} style={{ fontSize: 6, fill: "#0a0a0a" }}>0</SvgText>
          <SvgText x={100} y={-2} textAnchor="end" style={{ fontSize: 6, fill: "#0a0a0a" }}>
            {pdfSafe(scaleLabel)}
          </SvgText>
          <SvgText
            x={50}
            y={16}
            textAnchor="middle"
            style={{ fontSize: 5.5, fill: "#0a0a0a" }}
          >
            Echelle approx.
          </SvgText>
        </G>

        {/* Locator inset (top-left) */}
        {insetDataUri ? (
          <G transform="translate(20, 20)">
            <Rect x={0} y={0} width={170} height={170} fill="#ffffff" stroke="#0a0a0a" strokeWidth={0.8} />
            <Rect x={0} y={0} width={170} height={14} fill="#0e4d22" />
            <SvgText
              x={6}
              y={10}
              style={{
                fontSize: 6.5,
                fontFamily: "Helvetica-Bold",
                fill: "#ffffff",
                letterSpacing: 1,
              }}
            >
              CONTEXTE URBAIN
            </SvgText>
          </G>
        ) : null}

        {/* Image-based attribution (Google) */}
        <SvgText
          x={10}
          y={695}
          style={{ fontSize: 5, fill: "#0a0a0a", fontFamily: "Helvetica" }}
        >
          {pdfSafe(
            "Imagerie : Google Maps Static / Maxar / Airbus (selon zone). Donnees cartographiques : Google. Annotations : STLS Engineering.",
          )}
        </SvgText>
      </Svg>

      {/* Locator inset image (positioned in absolute layer so it
          appears over the SVG inset frame). */}
      {insetDataUri ? (
        <Image
          src={insetDataUri}
          style={{
            position: "absolute",
            top: "20pt",
            left: "20pt",
            width: "170pt",
            height: "170pt",
            objectFit: "cover",
          }}
        />
      ) : null}
    </View>
  );
}

function CorridorLabel({
  x,
  y,
  width,
  text,
  sub,
}: {
  x: number;
  y: number;
  width: number;
  text: string;
  sub: string;
}) {
  return (
    <G>
      <Rect
        x={x}
        y={y - 12}
        width={width}
        height={26}
        fill="#ffffff"
        stroke="#0a0a0a"
        strokeWidth={0.6}
        opacity={0.92}
      />
      <SvgText
        x={x + 6}
        y={y - 1}
        style={{
          fontSize: 7.5,
          fontFamily: "Helvetica-Bold",
          fill: "#0a0a0a",
          letterSpacing: 1,
        }}
      >
        {pdfSafe(text)}
      </SvgText>
      <SvgText
        x={x + 6}
        y={y + 9}
        style={{ fontSize: 6, fill: "#46514a" }}
      >
        {pdfSafe(sub)}
      </SvgText>
    </G>
  );
}

// ---------------------------------------------------------------
// Plan de situation — synthetic fallback (when no API key / fetch fails)
// ---------------------------------------------------------------

export function SituationMap({
  latitude,
  longitude,
}: {
  latitude: number | null;
  longitude: number | null;
}) {
  // We render a stylised street network around the carrefour, with
  // a labelled pin at the centre and surrounding street names. The
  // real underlying map is left to the operator (placeholder image
  // can be inserted on top of this layer later).
  return (
    <Svg viewBox="0 0 1000 700" style={{ flex: 1, width: "100%", height: "100%" }}>
      <Rect x={0} y={0} width={1000} height={700} fill="#fbf9ee" />

      {/* Surrounding parcels (blocks) drawn as soft yellow rectangles */}
      <Rect x={40} y={40} width={400} height={260} fill="#f1e7c4" stroke="#cbb784" strokeWidth={0.4} />
      <Rect x={560} y={40} width={400} height={260} fill="#f1e7c4" stroke="#cbb784" strokeWidth={0.4} />
      <Rect x={40} y={400} width={400} height={260} fill="#f1e7c4" stroke="#cbb784" strokeWidth={0.4} />
      <Rect x={560} y={400} width={400} height={260} fill="#f1e7c4" stroke="#cbb784" strokeWidth={0.4} />

      {/* Two perpendicular major streets crossing at the carrefour */}
      <Rect x={0} y={300} width={1000} height={100} fill={ASPHALT_LIGHT} />
      <Rect x={440} y={0} width={120} height={700} fill={ASPHALT_LIGHT} />

      {/* Centerlines */}
      <Line x1={0} y1={350} x2={440} y2={350} stroke={PAINT} strokeWidth={1.5} strokeDasharray="10 8" />
      <Line x1={560} y1={350} x2={1000} y2={350} stroke={PAINT} strokeWidth={1.5} strokeDasharray="10 8" />
      <Line x1={500} y1={0} x2={500} y2={300} stroke={PAINT} strokeWidth={1.5} strokeDasharray="10 8" />
      <Line x1={500} y1={400} x2={500} y2={700} stroke={PAINT} strokeWidth={1.5} strokeDasharray="10 8" />

      {/* Carrefour intersection square */}
      <Rect x={440} y={300} width={120} height={100} fill={ASPHALT} />

      {/* Pin at the carrefour */}
      <Circle cx={500} cy={350} r={18} fill="#d22a2a" stroke="#0a0a0a" strokeWidth={1.5} />
      <Circle cx={500} cy={350} r={6} fill="#ffffff" />

      {/* Street name labels */}
      <SvgText
        x={220}
        y={290}
        style={{ fontSize: 10, fontFamily: "Helvetica-Bold", fill: INK }}
      >
        Bd Mohammed VI (vers O)
      </SvgText>
      <SvgText
        x={780}
        y={290}
        style={{ fontSize: 10, fontFamily: "Helvetica-Bold", fill: INK }}
        textAnchor="end"
      >
        Bd Mohammed VI (vers E)
      </SvgText>
      <SvgText
        x={530}
        y={130}
        style={{ fontSize: 10, fontFamily: "Helvetica-Bold", fill: INK }}
      >
        Av. d'Espagne (Nord)
      </SvgText>
      <SvgText
        x={530}
        y={580}
        style={{ fontSize: 10, fontFamily: "Helvetica-Bold", fill: INK }}
      >
        Av. d'Espagne (Sud)
      </SvgText>

      {/* Carrefour callout */}
      <Line x1={540} y1={350} x2={780} y2={200} stroke={INK} strokeWidth={0.6} />
      <Rect x={760} y={180} width={220} height={48} fill="#ffffff" stroke={INK} strokeWidth={0.6} />
      <SvgText x={770} y={198} style={{ fontSize: 9, fontFamily: "Helvetica-Bold", fill: "#0e4d22" }}>
        CARREFOUR INT-TNG-001
      </SvgText>
      <SvgText x={770} y={210} style={{ fontSize: 7, fill: INK }}>
        Bd Mohammed VI x Av. d'Espagne
      </SvgText>
      <SvgText x={770} y={220} style={{ fontSize: 6.5, fill: INK_MUTED }}>
        {latitude != null && longitude != null
          ? pdfSafe(
              `Coord. ${latitude.toFixed(5)} N / ${longitude.toFixed(5)} E (WGS 84)`,
            )
          : "Coord. WGS 84 — a renseigner"}
      </SvgText>

      <NorthArrow x={60} y={70} size={36} />
      <ScaleBar x={840} y={650} length={120} label="100 m" />

      <Legend
        x={20}
        y={530}
        width={220}
        title="Plan de situation"
        items={[
          { swatch: ASPHALT_LIGHT, label: "Chaussee" },
          { swatch: "#f1e7c4", label: "Ilots / parcelles" },
          { swatch: "#d22a2a", label: "Carrefour cible", swatchType: "circle" },
          { swatch: PAINT, label: "Marquage axe", swatchType: "line" },
        ]}
      />
    </Svg>
  );
}

// ---------------------------------------------------------------
// Phasage diagram — 3-panel mini-carrefour view
// ---------------------------------------------------------------

interface PhaseSpec {
  number: number;
  title: string;
  ewStraight: boolean;
  ewLeft: boolean;
  nsStraight: boolean;
  pedEW: boolean;
  pedNS: boolean;
}

const PHASES: PhaseSpec[] = [
  {
    number: 1,
    title: "Phase 1 — E/W tout droit + droite",
    ewStraight: true,
    ewLeft: false,
    nsStraight: false,
    pedEW: true,
    pedNS: false,
  },
  {
    number: 2,
    title: "Phase 2 — E/W tourne-à-gauche",
    ewStraight: false,
    ewLeft: true,
    nsStraight: false,
    pedEW: false,
    pedNS: false,
  },
  {
    number: 3,
    title: "Phase 3 — N/S tout droit + droite",
    ewStraight: false,
    ewLeft: false,
    nsStraight: true,
    pedEW: false,
    pedNS: true,
  },
];

export function PhasageDiagram() {
  return (
    <Svg viewBox="0 0 1000 600" style={{ flex: 1, width: "100%", height: "100%" }}>
      <Rect x={0} y={0} width={1000} height={600} fill="#fbfaf3" />

      <SvgText
        x={500}
        y={30}
        textAnchor="middle"
        style={{ fontSize: 11, fontFamily: "Helvetica-Bold", fill: INK }}
      >
        DIAGRAMME DE PHASAGE — 3 PHASES VEHICULES + PIETONS CONCOMITANTS
      </SvgText>

      {PHASES.map((phase, idx) => {
        const panelW = 300;
        const panelH = 460;
        const gap = 16;
        const totalW = panelW * 3 + gap * 2;
        const xOffset = (1000 - totalW) / 2;
        const px = xOffset + idx * (panelW + gap);
        const py = 70;
        return (
          <PhasePanel
            key={phase.number}
            x={px}
            y={py}
            width={panelW}
            height={panelH}
            phase={phase}
          />
        );
      })}

      <Legend
        x={20}
        y={540}
        width={300}
        title="Lecture phasage"
        items={[
          { swatch: FLOW_GREEN, label: "Mouvement vert (autorise)", swatchType: "line" },
          { swatch: FLOW_GREY, label: "Mouvement bloque (rouge)", swatchType: "line" },
          { swatch: "#1f7a3a", label: "Pieton vert", swatchType: "fill" },
        ]}
      />
    </Svg>
  );
}

function PhasePanel({
  x,
  y,
  width,
  height,
  phase,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  phase: PhaseSpec;
}) {
  const cx = x + width / 2;
  const cy = y + height / 2 + 10;
  const bvW = width * 0.7;
  const bvH = 60;
  const avW = 40;
  const avH = height * 0.6;

  const ewColor = phase.ewStraight ? FLOW_GREEN : FLOW_GREY;
  const ewLeftColor = phase.ewLeft ? FLOW_GREEN : FLOW_GREY;
  const nsColor = phase.nsStraight ? FLOW_GREEN : FLOW_GREY;

  return (
    <G>
      {/* Panel border + title */}
      <Rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="#ffffff"
        stroke={BORDER}
        strokeWidth={0.8}
      />
      <Rect
        x={x}
        y={y}
        width={width}
        height={22}
        fill="#dfe8da"
      />
      <SvgText
        x={cx}
        y={y + 15}
        textAnchor="middle"
        style={{ fontSize: 9, fontFamily: "Helvetica-Bold", fill: "#0e4d22" }}
      >
        {pdfSafe(phase.title.toUpperCase())}
      </SvgText>

      {/* Mini carrefour: boulevard + avenue + intersection square */}
      <Rect
        x={cx - bvW / 2}
        y={cy - bvH / 2}
        width={bvW}
        height={bvH}
        fill={ASPHALT}
      />
      <Rect
        x={cx - avW / 2}
        y={cy - avH / 2}
        width={avW}
        height={avH}
        fill={ASPHALT}
      />
      <Rect
        x={cx - avW / 2}
        y={cy - bvH / 2}
        width={avW}
        height={bvH}
        fill={ASPHALT_LIGHT}
      />

      {/* Lane separators */}
      <Line
        x1={cx - bvW / 2}
        y1={cy}
        x2={cx - avW / 2}
        y2={cy}
        stroke={PAINT}
        strokeWidth={0.8}
        strokeDasharray="4 4"
      />
      <Line
        x1={cx + avW / 2}
        y1={cy}
        x2={cx + bvW / 2}
        y2={cy}
        stroke={PAINT}
        strokeWidth={0.8}
        strokeDasharray="4 4"
      />
      <Line
        x1={cx}
        y1={cy - avH / 2}
        x2={cx}
        y2={cy - bvH / 2}
        stroke={PAINT}
        strokeWidth={0.8}
        strokeDasharray="4 4"
      />
      <Line
        x1={cx}
        y1={cy + bvH / 2}
        x2={cx}
        y2={cy + avH / 2}
        stroke={PAINT}
        strokeWidth={0.8}
        strokeDasharray="4 4"
      />

      {/* Movement arrows for this phase */}
      {/* E-W straight */}
      <Arrow
        x={cx + bvW / 2 - 4}
        y={cy + 12}
        direction={0}
        length={70}
        color={ewColor}
        width={4}
      />
      <Arrow
        x={cx - bvW / 2 + 4}
        y={cy - 12}
        direction={180}
        length={70}
        color={ewColor}
        width={4}
      />
      {/* E-W left turn — drawn as a curved arrow from EW lane bending into N or S */}
      {phase.ewLeft ? (
        <>
          <Path
            d={`M ${cx + 40} ${cy + 10} Q ${cx + 5} ${cy + 10} ${cx + 5} ${cy - 50}`}
            stroke={ewLeftColor}
            strokeWidth={4}
            fill="none"
          />
          <Arrow
            x={cx + 5}
            y={cy - 60}
            direction={-90}
            length={1}
            color={ewLeftColor}
            width={4}
          />
          <Path
            d={`M ${cx - 40} ${cy - 10} Q ${cx - 5} ${cy - 10} ${cx - 5} ${cy + 50}`}
            stroke={ewLeftColor}
            strokeWidth={4}
            fill="none"
          />
          <Arrow
            x={cx - 5}
            y={cy + 60}
            direction={90}
            length={1}
            color={ewLeftColor}
            width={4}
          />
        </>
      ) : null}
      {/* N-S straight */}
      <Arrow
        x={cx + 10}
        y={cy + avH / 2 - 4}
        direction={90}
        length={70}
        color={nsColor}
        width={4}
      />
      <Arrow
        x={cx - 10}
        y={cy - avH / 2 + 4}
        direction={-90}
        length={70}
        color={nsColor}
        width={4}
      />

      {/* Pedestrian indicators (small bars at the crossings) */}
      <PedBar
        x={cx - bvW / 2 + 14}
        y={cy - bvH / 2 - 8}
        orient="h"
        active={phase.pedNS}
      />
      <PedBar
        x={cx - bvW / 2 + 14}
        y={cy + bvH / 2 + 8 - 4}
        orient="h"
        active={phase.pedNS}
      />
      <PedBar
        x={cx - bvW / 2 - 8}
        y={cy - bvH / 2 + 4}
        orient="v"
        active={phase.pedEW}
      />
      <PedBar
        x={cx + bvW / 2 + 8 - 4}
        y={cy - bvH / 2 + 4}
        orient="v"
        active={phase.pedEW}
      />

      {/* Branch labels */}
      <SvgText x={x + 8} y={cy - 16} style={{ fontSize: 6.5, fill: INK_MUTED }}>
        W
      </SvgText>
      <SvgText
        x={x + width - 8}
        y={cy - 16}
        textAnchor="end"
        style={{ fontSize: 6.5, fill: INK_MUTED }}
      >
        E
      </SvgText>
      <SvgText
        x={cx}
        y={y + 38}
        textAnchor="middle"
        style={{ fontSize: 6.5, fill: INK_MUTED }}
      >
        N
      </SvgText>
      <SvgText
        x={cx}
        y={y + height - 12}
        textAnchor="middle"
        style={{ fontSize: 6.5, fill: INK_MUTED }}
      >
        S
      </SvgText>

      {/* Numbered tag bottom-right */}
      <Rect
        x={x + width - 38}
        y={y + height - 26}
        width={32}
        height={20}
        fill={FLOW_GREEN}
      />
      <SvgText
        x={x + width - 22}
        y={y + height - 11}
        textAnchor="middle"
        style={{ fontSize: 12, fontFamily: "Helvetica-Bold", fill: "#ffffff" }}
      >
        {`P${phase.number}`}
      </SvgText>
    </G>
  );
}

function PedBar({
  x,
  y,
  orient,
  active,
}: {
  x: number;
  y: number;
  orient: "h" | "v";
  active: boolean;
}) {
  const color = active ? FLOW_GREEN : FLOW_GREY;
  if (orient === "h") {
    return (
      <Rect
        x={x}
        y={y}
        width={36}
        height={4}
        fill={color}
        stroke={INK}
        strokeWidth={0.3}
      />
    );
  }
  return (
    <Rect
      x={x}
      y={y}
      width={4}
      height={36}
      fill={color}
      stroke={INK}
      strokeWidth={0.3}
    />
  );
}

// ---------------------------------------------------------------
// Timing diagram — stacked horizontal bars per signal head
// ---------------------------------------------------------------

interface TimingSegment {
  state: "G" | "Y" | "R" | "WALK" | "FLASH";
  duration: number; // seconds
}

interface TimingRow {
  label: string;
  segments: TimingSegment[];
}

const COLOR_BY_STATE: Record<TimingSegment["state"], string> = {
  G: "#1f7a3a",
  Y: "#e6b400",
  R: "#d22a2a",
  WALK: "#0f5fa6",
  FLASH: "#e07a1f",
};

/**
 * Build a timing-row plan for the HPM cycle (120 s) :
 *
 *   0..45 s : Phase 1 (E/W tout droit + droite)
 *   45..48 s : jaune
 *   48..50 s : all-red
 *   50..68 s : Phase 2 (E/W gauche)
 *   68..71 s : jaune
 *   71..73 s : all-red
 *   73..108 s : Phase 3 (N/S)
 *   108..111 s : jaune
 *   111..113 s : all-red
 *   113..120 s : extension / coordination
 *
 * Per signal head, a row describes green / yellow / red segments.
 */
function buildHpmTimingRows(): TimingRow[] {
  const cycle = 120;
  const row = (label: string, greens: Array<[number, number]>): TimingRow => {
    const segments: TimingSegment[] = [];
    let cursor = 0;
    for (const [start, end] of greens) {
      if (start > cursor) {
        segments.push({ state: "R", duration: start - cursor });
      }
      segments.push({ state: "G", duration: Math.max(0, end - start - 3) });
      segments.push({ state: "Y", duration: 3 });
      cursor = end;
    }
    if (cycle > cursor) {
      segments.push({ state: "R", duration: cycle - cursor });
    }
    return { label, segments };
  };
  return [
    row("V1 — E TD+D", [[0, 45]]),
    row("V2 — E gauche", [[50, 68]]),
    row("V3 — W TD+D", [[0, 45]]),
    row("V4 — W gauche", [[50, 68]]),
    row("V5 — N TD+D", [[73, 108]]),
    row("V6 — S TD+D", [[73, 108]]),
    {
      label: "P1 — Trav. P-NS",
      segments: [
        { state: "R", duration: 73 },
        { state: "WALK", duration: 22 },
        { state: "FLASH", duration: 8 },
        { state: "R", duration: 17 },
      ],
    },
    {
      label: "P2 — Trav. P-EW",
      segments: [
        { state: "WALK", duration: 32 },
        { state: "FLASH", duration: 8 },
        { state: "R", duration: 80 },
      ],
    },
  ];
}

export function TimingChart() {
  const rows = buildHpmTimingRows();
  const cycle = 120;
  const chartX = 90;
  const chartY = 70;
  const chartW = 850;
  const chartH = 360;
  const rowH = chartH / rows.length;
  return (
    <Svg viewBox="0 0 1000 600" style={{ flex: 1, width: "100%", height: "100%" }}>
      <Rect x={0} y={0} width={1000} height={600} fill="#fbfaf3" />
      <SvgText
        x={500}
        y={30}
        textAnchor="middle"
        style={{ fontSize: 11, fontFamily: "Helvetica-Bold", fill: INK }}
      >
        DIAGRAMME DE TIMING — PLAN HPM, CYCLE 120 S
      </SvgText>

      {/* Chart frame */}
      <Rect
        x={chartX}
        y={chartY}
        width={chartW}
        height={chartH}
        fill="#ffffff"
        stroke={BORDER}
        strokeWidth={0.8}
      />

      {/* Vertical grid every 10 s */}
      {Array.from({ length: cycle / 10 + 1 }, (_, i) => i * 10).map((t) => {
        const xx = chartX + (t / cycle) * chartW;
        return (
          <G key={t}>
            <Line
              x1={xx}
              y1={chartY}
              x2={xx}
              y2={chartY + chartH}
              stroke={BORDER_LIGHT}
              strokeWidth={t % 30 === 0 ? 0.6 : 0.3}
              strokeDasharray={t % 30 === 0 ? "" : "2 3"}
            />
            <SvgText
              x={xx}
              y={chartY + chartH + 12}
              textAnchor="middle"
              style={{ fontSize: 6, fill: INK_MUTED }}
            >
              {`${t}s`}
            </SvgText>
          </G>
        );
      })}

      {/* Phase boundary highlighters (dashed vertical green lines) */}
      {[45, 48, 50, 68, 71, 73, 108, 111, 113].map((t) => {
        const xx = chartX + (t / cycle) * chartW;
        return (
          <Line
            key={t}
            x1={xx}
            y1={chartY}
            x2={xx}
            y2={chartY + chartH}
            stroke={FLOW_GREEN}
            strokeWidth={0.4}
            strokeDasharray="2 3"
            opacity={0.6}
          />
        );
      })}

      {/* Rows */}
      {rows.map((row, idx) => {
        const ry = chartY + idx * rowH;
        const segs: React.ReactElement[] = [];
        let cursorT = 0;
        for (const seg of row.segments) {
          const startX = chartX + (cursorT / cycle) * chartW;
          const widthX = (seg.duration / cycle) * chartW;
          segs.push(
            <Rect
              key={`${idx}-${cursorT}`}
              x={startX}
              y={ry + 4}
              width={widthX}
              height={rowH - 8}
              fill={COLOR_BY_STATE[seg.state]}
              stroke={"#0a0a0a"}
              strokeWidth={0.3}
            />,
          );
          cursorT += seg.duration;
        }
        return (
          <G key={idx}>
            <Rect
              x={chartX - 86}
              y={ry}
              width={86}
              height={rowH}
              fill="#f4f6f3"
              stroke={BORDER_LIGHT}
              strokeWidth={0.3}
            />
            <SvgText
              x={chartX - 4}
              y={ry + rowH / 2 + 3}
              textAnchor="end"
              style={{ fontSize: 7, fontFamily: "Helvetica-Bold", fill: INK }}
            >
              {pdfSafe(row.label)}
            </SvgText>
            {segs}
            <Line
              x1={chartX}
              y1={ry + rowH}
              x2={chartX + chartW}
              y2={ry + rowH}
              stroke={BORDER_LIGHT}
              strokeWidth={0.3}
            />
          </G>
        );
      })}

      {/* Time axis title */}
      <SvgText
        x={chartX + chartW / 2}
        y={chartY + chartH + 30}
        textAnchor="middle"
        style={{ fontSize: 7, fontFamily: "Helvetica-Bold", fill: INK }}
      >
        TEMPS DANS LE CYCLE (s)
      </SvgText>

      {/* Phase blocks above chart */}
      <PhaseBlock x={chartX} t0={0} t1={45} label="PHASE 1" cycle={cycle} chartW={chartW} y={chartY - 18} />
      <PhaseBlock x={chartX} t0={50} t1={68} label="PHASE 2" cycle={cycle} chartW={chartW} y={chartY - 18} />
      <PhaseBlock x={chartX} t0={73} t1={108} label="PHASE 3" cycle={cycle} chartW={chartW} y={chartY - 18} />

      <Legend
        x={20}
        y={500}
        width={340}
        title="Legende etats signaux"
        items={[
          { swatch: COLOR_BY_STATE.G, label: "Vert vehicule (G)", swatchType: "fill" },
          { swatch: COLOR_BY_STATE.Y, label: "Jaune (Y) — degagement", swatchType: "fill" },
          { swatch: COLOR_BY_STATE.R, label: "Rouge (R)", swatchType: "fill" },
          { swatch: COLOR_BY_STATE.WALK, label: "Vert pieton (Walk)", swatchType: "fill" },
          { swatch: COLOR_BY_STATE.FLASH, label: "Vert pieton clignotant", swatchType: "fill" },
          { swatch: FLOW_GREEN, label: "Limite de phase", swatchType: "dashed" },
        ]}
      />
    </Svg>
  );
}

function PhaseBlock({
  x,
  t0,
  t1,
  label,
  cycle,
  chartW,
  y,
}: {
  x: number;
  t0: number;
  t1: number;
  label: string;
  cycle: number;
  chartW: number;
  y: number;
}) {
  const startX = x + (t0 / cycle) * chartW;
  const widthX = ((t1 - t0) / cycle) * chartW;
  return (
    <G>
      <Rect
        x={startX}
        y={y}
        width={widthX}
        height={14}
        fill={FLOW_GREEN}
        opacity={0.85}
      />
      <SvgText
        x={startX + widthX / 2}
        y={y + 10}
        textAnchor="middle"
        style={{ fontSize: 6.5, fontFamily: "Helvetica-Bold", fill: "#ffffff" }}
      >
        {label}
      </SvgText>
    </G>
  );
}
