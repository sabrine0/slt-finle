"use client";
/* eslint-disable react/no-unescaped-entities --
   This file emits French dossier content with many apostrophes
   ("d'urgence", "l'agent IA"). The rule's HTML-targeted escapes
   (&apos;) would be a step backwards for readability — `<Text>` from
   @react-pdf/renderer renders raw children, not HTML entities. */

/**
 * Étude carrefour — DOE / dossier de régulation PDF.
 *
 * Layout follows the Casablanca tramway reference dossier
 * (AL3_DOE_32_SLT_SPE_SCS_M7200_LI0000_002721_B.pdf) :
 *
 *   - Cover page with whitespace-heavy header, centered green title,
 *     revision table anchored bottom-right, GED codification table.
 *   - Compact technical layout (small font, grid-heavy tables, green
 *     table headers).
 *   - 8-section DOE structure : Plan de situation, Plan d'aménagement,
 *     Détection, Interface système, Description physique (5.1–5.7),
 *     Fonctionnement (6.1–6.5), Affectation DIASER, Équipements.
 *   - Framed drawing placeholders for plans and timing diagrams.
 *   - Page numbering "N/total" in the footer.
 *
 * All <Text> values are routed through `pdfSafe()` so curly quotes,
 * arrows and math symbols are coerced into Helvetica-compatible
 * glyphs (avoids the "=Î" / tofu artefacts caused by built-in
 * Helvetica's WinAnsi subset).
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";

import type {
  ContentBlock,
  StructuredContent,
  TableBlock,
  KeyValueBlock,
} from "@/lib/etude-blocks";
import { pdfSafe } from "@/lib/pdf-sanitize";
import type { EtudeView } from "@/lib/etudes-api";
import {
  CarrefourSchematic,
  DrawingPage,
  PhasageDiagram,
  SituationMap,
  SituationMapReal,
  TimingChart,
  type CartoucheMeta,
} from "@/components/studio-landing/etude-pdf-drawings";

/**
 * Pre-fetched assets passed in from the export caller. The Google
 * Maps Static API call happens before PDF rendering so the imagery
 * is embedded directly (no in-PDF network fetch).
 */
export interface EtudePdfAssets {
  situationMapDataUri: string | null;
  situationMapInsetDataUri: string | null;
  situationMapZoom: number;
}

const GREEN = "#1f7a3a";
const GREEN_DARK = "#0e4d22";
const GREEN_TINT = "#d7e8d8";
const INK = "#0a0f0b";
const INK_MUTED = "#46514a";
const BORDER = "#000000";
const BORDER_LIGHT = "#6b6b6b";

const s = StyleSheet.create({
  // ----- Page chrome -----
  page: {
    paddingTop: "18mm",
    paddingBottom: "14mm",
    paddingLeft: "12mm",
    paddingRight: "12mm",
    fontSize: 7.5,
    lineHeight: 1.28,
    fontFamily: "Helvetica",
    color: INK,
  },
  pageHeader: {
    position: "absolute",
    top: "7mm",
    left: "12mm",
    right: "12mm",
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 6.5,
    color: INK_MUTED,
    borderBottomWidth: 0.6,
    borderBottomColor: BORDER,
    paddingBottom: 2,
  },
  pageFooter: {
    position: "absolute",
    bottom: "7mm",
    left: "12mm",
    right: "12mm",
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 6.5,
    color: INK_MUTED,
    borderTopWidth: 0.6,
    borderTopColor: BORDER,
    paddingTop: 2,
  },

  // ----- Headings -----
  sectionNumber: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: GREEN_DARK,
    marginBottom: 1,
    letterSpacing: 1,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: INK,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  subSectionTitle: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: GREEN_DARK,
    marginTop: 7,
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  subSubSectionTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: INK,
    marginTop: 4,
    marginBottom: 1.5,
  },
  rule: {
    height: 0.8,
    backgroundColor: BORDER,
    marginBottom: 5,
  },

  // ----- Body text -----
  para: {
    fontSize: 7.5,
    lineHeight: 1.3,
    marginBottom: 2,
    textAlign: "justify",
  },
  note: {
    fontSize: 7,
    color: INK_MUTED,
    fontStyle: "italic",
    marginVertical: 2,
    paddingLeft: 4,
    borderLeftWidth: 0.8,
    borderLeftColor: BORDER_LIGHT,
  },
  listRow: {
    flexDirection: "row",
    marginBottom: 1.2,
  },
  listBullet: {
    width: 9,
    fontSize: 7.5,
  },
  listText: {
    flex: 1,
    fontSize: 7.5,
    lineHeight: 1.3,
  },

  // ----- Tables -----
  tableCaption: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: GREEN_DARK,
    marginTop: 4,
    marginBottom: 2,
  },
  table: {
    borderWidth: 0.8,
    borderColor: BORDER,
    marginBottom: 4,
  },
  tableHead: {
    flexDirection: "row",
    backgroundColor: GREEN_TINT,
    borderBottomWidth: 0.8,
    borderBottomColor: BORDER,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.4,
    borderBottomColor: BORDER,
  },
  th: {
    padding: 2,
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: GREEN_DARK,
    borderRightWidth: 0.4,
    borderRightColor: BORDER,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  td: {
    padding: 2,
    fontSize: 7,
    borderRightWidth: 0.4,
    borderRightColor: BORDER_LIGHT,
  },

  // ----- Key / value -----
  kvBox: {
    borderWidth: 0.6,
    borderColor: BORDER,
    marginVertical: 4,
  },
  kvRow: {
    flexDirection: "row",
    borderBottomWidth: 0.3,
    borderBottomColor: BORDER_LIGHT,
  },
  kvKey: {
    width: 110,
    padding: 3,
    fontSize: 7.5,
    color: INK_MUTED,
    backgroundColor: "#f4f6f3",
    borderRightWidth: 0.3,
    borderRightColor: BORDER_LIGHT,
  },
  kvValue: {
    flex: 1,
    padding: 3,
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
  },

  // ----- Code blocks -----
  code: {
    fontSize: 7,
    fontFamily: "Courier",
    backgroundColor: "#f4f6f3",
    padding: 4,
    marginVertical: 3,
    borderWidth: 0.3,
    borderColor: BORDER_LIGHT,
  },

  // ----- Framed drawing placeholder -----
  drawingFrame: {
    borderWidth: 0.8,
    borderColor: BORDER,
    height: 360,
    marginTop: 6,
    marginBottom: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  drawingFrameInner: {
    borderWidth: 0.3,
    borderColor: BORDER_LIGHT,
    borderStyle: "dashed",
    width: "92%",
    height: "92%",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  drawingTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: GREEN_DARK,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "center",
  },
  drawingDescription: {
    fontSize: 8,
    color: INK_MUTED,
    textAlign: "center",
    marginBottom: 4,
  },
  drawingHint: {
    fontSize: 7,
    fontFamily: "Courier",
    color: INK_MUTED,
    textAlign: "center",
  },

  // ----- Cover page -----
  coverPage: {
    paddingTop: "25mm",
    paddingBottom: "20mm",
    paddingLeft: "20mm",
    paddingRight: "20mm",
    fontFamily: "Helvetica",
    color: INK,
  },
  coverLogosRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    minHeight: 50,
  },
  coverLogoBox: {
    width: 100,
    height: 40,
    borderWidth: 0.5,
    borderColor: BORDER_LIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  coverLogoLabel: {
    fontSize: 7,
    color: INK_MUTED,
  },
  coverLogoMain: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: GREEN_DARK,
    letterSpacing: 2,
  },
  coverTitleArea: {
    marginTop: "55mm",
    alignItems: "center",
  },
  coverProjectLabel: {
    fontSize: 9,
    color: INK_MUTED,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  coverDossierLabel: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: GREEN_DARK,
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: 18,
  },
  coverTitleLineBox: {
    borderTopWidth: 1,
    borderTopColor: GREEN,
    borderBottomWidth: 1,
    borderBottomColor: GREEN,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  coverTitleMain: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: GREEN_DARK,
    textAlign: "center",
    letterSpacing: 1,
  },
  coverSubtitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: INK,
    textAlign: "center",
    marginTop: 10,
  },
  coverDocCode: {
    fontSize: 9,
    fontFamily: "Courier",
    color: INK_MUTED,
    textAlign: "center",
    marginTop: 18,
  },

  coverBottomRow: {
    position: "absolute",
    left: "20mm",
    right: "20mm",
    bottom: "20mm",
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  coverTablesStack: {
    width: "60%",
  },
  coverRevisionTable: {
    borderWidth: 0.6,
    borderColor: BORDER,
    marginBottom: 6,
  },
  coverGedTable: {
    borderWidth: 0.6,
    borderColor: BORDER,
  },
  coverTableHead: {
    flexDirection: "row",
    backgroundColor: GREEN_TINT,
    borderBottomWidth: 0.6,
    borderBottomColor: BORDER,
  },
  coverTableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.3,
    borderBottomColor: BORDER_LIGHT,
  },
  coverTh: {
    padding: 3,
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: GREEN_DARK,
    borderRightWidth: 0.3,
    borderRightColor: BORDER_LIGHT,
    textTransform: "uppercase",
  },
  coverTd: {
    padding: 3,
    fontSize: 7,
    borderRightWidth: 0.3,
    borderRightColor: BORDER_LIGHT,
  },

  // ----- Sommaire -----
  tocRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.3,
    borderBottomColor: BORDER_LIGHT,
  },
  tocSubRow: {
    flexDirection: "row",
    paddingVertical: 1.5,
    paddingLeft: 30,
  },
  tocNumber: {
    width: 32,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: GREEN_DARK,
  },
  tocSubNumber: {
    width: 32,
    fontSize: 7.5,
    color: INK_MUTED,
  },
  tocTitle: {
    flex: 1,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    color: INK,
  },
  tocSubTitle: {
    flex: 1,
    fontSize: 7.5,
    color: INK,
  },
});

// ===============================================================
// Helpers
// ===============================================================

interface DocMeta {
  docCode: string;
  carrefourCode: string;
  carrefourLabel: string;
  todayShort: string;
  indice: string;
}

function buildMeta(etude: EtudeView): DocMeta {
  const code = etude.intersectionCode ?? "STLS-CARREFOUR";
  const region = code.split("-")[1] ?? "MAR";
  const number = code.split("-").slice(-1)[0] ?? etude.id.slice(0, 6).toUpperCase();
  return {
    docCode: `STLS-DOE-RGL-${region}-${number}-A`,
    carrefourCode: code,
    carrefourLabel: etude.intersectionLabel,
    todayShort: new Date().toLocaleDateString("fr-FR"),
    indice: "A",
  };
}

function isStructured(value: unknown): value is StructuredContent {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: string }).kind === "blocks" &&
    Array.isArray((value as { blocks?: unknown }).blocks)
  );
}

function getSection(
  etude: EtudeView,
  id: string,
): StructuredContent | null {
  const record = etude.sections[id];
  if (!record) return null;
  return isStructured(record.content) ? record.content : null;
}

function findBlocks<T extends ContentBlock["kind"]>(
  content: StructuredContent | null,
  kind: T,
): Extract<ContentBlock, { kind: T }>[] {
  if (!content) return [];
  return content.blocks.filter(
    (b): b is Extract<ContentBlock, { kind: T }> => b.kind === kind,
  );
}

function colWidths(count: number): number[] {
  return Array.from({ length: count }, () => 100 / count);
}

// ===============================================================
// Block primitives (used inside section pages)
// ===============================================================

function ST({
  children,
  style,
}: {
  children: unknown;
  style?: Style | Style[];
}) {
  return <Text style={style}>{pdfSafe(children)}</Text>;
}

function PageHeader({ meta }: { meta: DocMeta }) {
  return (
    <View style={s.pageHeader} fixed>
      <View style={{ flexDirection: "column" }}>
        <ST style={{ fontFamily: "Helvetica-Bold", color: GREEN_DARK }}>
          STLS — Dossier de regulation carrefour
        </ST>
        <ST>
          {meta.carrefourCode} — {meta.carrefourLabel}
        </ST>
      </View>
      <View style={{ flexDirection: "column", alignItems: "flex-end" }}>
        <ST style={{ fontFamily: "Helvetica-Bold" }}>{meta.docCode}</ST>
        <ST>Indice {meta.indice} — {meta.todayShort}</ST>
      </View>
    </View>
  );
}

function PageFooter({ meta }: { meta: DocMeta }) {
  void meta;
  return (
    <View style={s.pageFooter} fixed>
      <ST>STLS Engineering — document confidentiel</ST>
      <Text
        render={({ pageNumber, totalPages }) =>
          pdfSafe(`${pageNumber}/${totalPages}`)
        }
      />
    </View>
  );
}

interface DrawingPlaceholderProps {
  title: string;
  description: string;
  hintFilename?: string;
}

function DrawingPlaceholder({
  title,
  description,
  hintFilename,
}: DrawingPlaceholderProps) {
  return (
    <View style={s.drawingFrame}>
      <View style={s.drawingFrameInner}>
        <ST style={s.drawingTitle}>{title}</ST>
        <ST style={s.drawingDescription}>{description}</ST>
        {hintFilename ? (
          <ST style={s.drawingHint}>Fichier source attendu : {hintFilename}</ST>
        ) : null}
      </View>
    </View>
  );
}

function Para({ children }: { children: unknown }) {
  return <ST style={s.para}>{children}</ST>;
}

function Note({ children }: { children: unknown }) {
  return <ST style={s.note}>{children}</ST>;
}

function ListBlockView({ items }: { items: string[] }) {
  return (
    <View>
      {items.map((item, idx) => (
        <View key={idx} style={s.listRow}>
          <ST style={s.listBullet}>-</ST>
          <ST style={s.listText}>{item}</ST>
        </View>
      ))}
    </View>
  );
}

function TableView({ table }: { table: TableBlock }) {
  const widths = colWidths(table.columns.length);
  return (
    <View>
      {table.caption ? (
        <ST style={s.tableCaption}>{table.caption}</ST>
      ) : null}
      <View style={s.table}>
        <View style={s.tableHead}>
          {table.columns.map((column, idx) => (
            <ST
              key={column.key}
              style={[
                s.th,
                {
                  width: `${widths[idx]}%`,
                  textAlign: column.align ?? "left",
                },
              ]}
            >
              {column.label}
            </ST>
          ))}
        </View>
        {table.rows.map((row, idx) => (
          <View key={idx} style={s.tableRow} wrap={false}>
            {table.columns.map((column, colIdx) => {
              const value = row[column.key];
              return (
                <ST
                  key={column.key}
                  style={[
                    s.td,
                    {
                      width: `${widths[colIdx]}%`,
                      textAlign: column.align ?? "left",
                    },
                  ]}
                >
                  {value === null || value === undefined ? "-" : String(value)}
                </ST>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

function KVView({ block }: { block: KeyValueBlock }) {
  return (
    <View>
      {block.caption ? (
        <ST style={s.tableCaption}>{block.caption}</ST>
      ) : null}
      <View style={s.kvBox}>
        {block.rows.map((row, idx) => (
          <View key={idx} style={s.kvRow}>
            <ST style={s.kvKey}>{row.key}</ST>
            <ST style={s.kvValue}>{row.value}</ST>
          </View>
        ))}
      </View>
    </View>
  );
}

function renderBlock(block: ContentBlock, key: number): React.ReactElement {
  switch (block.kind) {
    case "heading": {
      const style =
        block.level === 1
          ? s.subSectionTitle
          : block.level === 2
            ? s.subSectionTitle
            : s.subSubSectionTitle;
      return (
        <ST key={key} style={style}>
          {block.text}
        </ST>
      );
    }
    case "paragraph":
      return <Para key={key}>{block.text}</Para>;
    case "note":
      return <Note key={key}>{block.text}</Note>;
    case "list":
      return <ListBlockView key={key} items={block.items} />;
    case "table":
      return <TableView key={key} table={block} />;
    case "code":
      return (
        <ST key={key} style={s.code}>
          {block.text}
        </ST>
      );
    case "placeholder":
      return (
        <DrawingPlaceholder
          key={key}
          title={block.title}
          description={block.description}
          hintFilename={block.hintFilename}
        />
      );
    case "keyvalue":
      return <KVView key={key} block={block} />;
    default:
      return <View key={key} />;
  }
}

// Renders only the non-heading, non-placeholder body of a section
// (the section title is provided separately by the DOE layout).
function renderSectionBlocks(content: StructuredContent | null) {
  if (!content) return null;
  return content.blocks.map((block, idx) => renderBlock(block, idx));
}

// ===============================================================
// Cover page (DOE style)
// ===============================================================

function CoverPage({ etude, meta }: { etude: EtudeView; meta: DocMeta }) {
  return (
    <Page size="A4" style={s.coverPage}>
      <View style={s.coverLogosRow}>
        <View style={s.coverLogoBox}>
          <ST style={s.coverLogoMain}>STLS</ST>
          <ST style={s.coverLogoLabel}>Engineering</ST>
        </View>
        <View style={s.coverLogoBox}>
          <ST style={s.coverLogoLabel}>Maitrise d'oeuvre</ST>
          <ST style={s.coverLogoLabel}>Bureau d'etudes</ST>
        </View>
      </View>

      <View style={s.coverTitleArea}>
        <ST style={s.coverProjectLabel}>STLS — Smart Traffic Light System</ST>
        <ST style={s.coverDossierLabel}>Dossier de regulation</ST>
        <View style={s.coverTitleLineBox}>
          <ST style={s.coverTitleMain}>
            CARREFOUR {meta.carrefourCode}
          </ST>
        </View>
        <ST style={s.coverSubtitle}>{meta.carrefourLabel}</ST>
        <ST style={s.coverDocCode}>{meta.docCode}</ST>
      </View>

      <View style={s.coverBottomRow}>
        <View style={s.coverTablesStack}>
          <View style={s.coverRevisionTable}>
            <View style={s.coverTableHead}>
              <ST style={[s.coverTh, { width: 30 }]}>Ind.</ST>
              <ST style={[s.coverTh, { width: 60 }]}>Date</ST>
              <ST style={[s.coverTh, { flex: 1 }]}>Modification</ST>
              <ST style={[s.coverTh, { width: 60 }]}>Redacteur</ST>
              <ST style={[s.coverTh, { width: 60 }]}>Verif.</ST>
              <ST style={[s.coverTh, { width: 60 }]}>Approb.</ST>
            </View>
            <View style={s.coverTableRow}>
              <ST style={[s.coverTd, { width: 30 }]}>{meta.indice}</ST>
              <ST style={[s.coverTd, { width: 60 }]}>{meta.todayShort}</ST>
              <ST style={[s.coverTd, { flex: 1 }]}>Premiere emission</ST>
              <ST style={[s.coverTd, { width: 60 }]}>A. Karim</ST>
              <ST style={[s.coverTd, { width: 60 }]}>en attente</ST>
              <ST style={[s.coverTd, { width: 60 }]}>en attente</ST>
            </View>
          </View>

          <View style={s.coverGedTable}>
            <View style={s.coverTableHead}>
              <ST style={[s.coverTh, { flex: 1 }]}>Codification GED</ST>
            </View>
            <View style={s.coverTableRow}>
              <ST style={[s.coverTd, { width: 80 }]}>Projet</ST>
              <ST style={[s.coverTd, { flex: 1 }]}>STLS</ST>
            </View>
            <View style={s.coverTableRow}>
              <ST style={[s.coverTd, { width: 80 }]}>Site</ST>
              <ST style={[s.coverTd, { flex: 1 }]}>{meta.carrefourCode}</ST>
            </View>
            <View style={s.coverTableRow}>
              <ST style={[s.coverTd, { width: 80 }]}>Scope</ST>
              <ST style={[s.coverTd, { flex: 1 }]}>{etude.scope}</ST>
            </View>
            <View style={s.coverTableRow}>
              <ST style={[s.coverTd, { width: 80 }]}>Phase</ST>
              <ST style={[s.coverTd, { flex: 1 }]}>DOE</ST>
            </View>
            <View style={s.coverTableRow}>
              <ST style={[s.coverTd, { width: 80 }]}>Type</ST>
              <ST style={[s.coverTd, { flex: 1 }]}>RGL — Regulation</ST>
            </View>
            <View style={s.coverTableRow}>
              <ST style={[s.coverTd, { width: 80 }]}>Indice</ST>
              <ST style={[s.coverTd, { flex: 1 }]}>{meta.indice}</ST>
            </View>
          </View>
        </View>
      </View>

      <View style={s.pageFooter} fixed>
        <ST>{meta.docCode}</ST>
        <Text
          render={({ pageNumber, totalPages }) =>
            pdfSafe(`${pageNumber}/${totalPages}`)
          }
        />
      </View>
    </Page>
  );
}

// ===============================================================
// Sommaire
// ===============================================================

const SOMMAIRE_ENTRIES: Array<{
  number: string;
  title: string;
  sub?: Array<{ number: string; title: string }>;
}> = [
  { number: "1", title: "Plan de situation" },
  { number: "2", title: "Plan d'amenagement du carrefour" },
  { number: "3", title: "Detection" },
  { number: "4", title: "Interface systeme / SigFer" },
  {
    number: "5",
    title: "Description physique",
    sub: [
      { number: "5.1", title: "Affectation des entrees controleur" },
      { number: "5.2", title: "Affectation des entrees deportees / API" },
      { number: "5.3", title: "Table de configuration reseau" },
      { number: "5.4", title: "Gestion memoires / demandes" },
      { number: "5.5", title: "Affectation des lignes de feux" },
      { number: "5.6", title: "Distances de conflit" },
      { number: "5.7", title: "Matrice des temps de degagement" },
    ],
  },
  {
    number: "6",
    title: "Fonctionnement",
    sub: [
      { number: "6.1", title: "Principe de fonctionnement" },
      { number: "6.2", title: "Priorite urgence / regulation IA" },
      { number: "6.3", title: "Capacite" },
      { number: "6.4", title: "Diagrammes" },
      { number: "6.5", title: "Fonctionnements manuels" },
    ],
  },
  { number: "7", title: "Affectation DIASER / variables API" },
  { number: "8", title: "Equipements" },
];

function SommairePage({ meta }: { meta: DocMeta }) {
  return (
    <Page size="A4" style={s.page}>
      <PageHeader meta={meta} />
      <ST style={s.sectionNumber}>Sommaire</ST>
      <View style={s.rule} />

      <View>
        {SOMMAIRE_ENTRIES.map((entry) => (
          <View key={entry.number}>
            <View style={s.tocRow}>
              <ST style={s.tocNumber}>{entry.number}</ST>
              <ST style={s.tocTitle}>{entry.title}</ST>
            </View>
            {entry.sub?.map((sub) => (
              <View key={sub.number} style={s.tocSubRow}>
                <ST style={s.tocSubNumber}>{sub.number}</ST>
                <ST style={s.tocSubTitle}>{sub.title}</ST>
              </View>
            ))}
          </View>
        ))}
      </View>

      <PageFooter meta={meta} />
    </Page>
  );
}

// ===============================================================
// Section pages
// ===============================================================

interface SectionPageProps {
  meta: DocMeta;
  number: string;
  title: string;
  children: React.ReactNode;
}

function SectionPage({ meta, number, title, children }: SectionPageProps) {
  return (
    <Page size="A4" style={s.page} wrap>
      <PageHeader meta={meta} />
      <ST style={s.sectionNumber}>{number}</ST>
      <ST style={s.sectionTitle}>{title}</ST>
      <View style={s.rule} />
      <View>{children}</View>
      <PageFooter meta={meta} />
    </Page>
  );
}

// ---------------------------------------------------------------
// Section 1 — Plan de situation
// ---------------------------------------------------------------

function Section1PlanDeSituation({
  etude,
  meta,
}: {
  etude: EtudeView;
  meta: DocMeta;
}) {
  const content = getSection(etude, "plan_de_situation");
  const kvBlocks = findBlocks(content, "keyvalue");
  return (
    <SectionPage meta={meta} number="1" title="Plan de situation">
      <ST style={s.subSectionTitle}>1.1 Identification</ST>
      {kvBlocks[0] ? <KVView block={kvBlocks[0]} /> : null}
      <ST style={s.subSectionTitle}>1.2 Renvoi planche</ST>
      <Para>
        Vue cartographique en planche A4 paysage — voir feuille suivante
        ({meta.docCode}/01).
      </Para>
    </SectionPage>
  );
}

// ---------------------------------------------------------------
// Section 2 — Plan d'aménagement
// ---------------------------------------------------------------

function Section2PlanAmenagement({
  etude,
  meta,
}: {
  etude: EtudeView;
  meta: DocMeta;
}) {
  const content = getSection(etude, "presentation_carrefour");
  const tables = findBlocks(content, "table");
  return (
    <SectionPage meta={meta} number="2" title="Plan d'amenagement du carrefour">
      <ST style={s.subSectionTitle}>2.1 Geometrie generale</ST>
      {tables[0] ? <TableView table={tables[0]} /> : null}
      <ST style={s.subSectionTitle}>2.2 Voies de circulation par approche</ST>
      {tables[1] ? <TableView table={tables[1]} /> : null}
      <ST style={s.subSectionTitle}>2.3 Traversees pietonnes</ST>
      {tables[2] ? <TableView table={tables[2]} /> : null}
      <ST style={s.subSectionTitle}>2.4 Inventaire des feux</ST>
      {tables[3] ? <TableView table={tables[3]} /> : null}
      <ST style={s.subSectionTitle}>2.5 Renvoi planche</ST>
      <Para>
        Plan d'amenagement echelle 1/200 — voir planche {meta.docCode}/02.
      </Para>
    </SectionPage>
  );
}

// ---------------------------------------------------------------
// Section 3 — Détection
// ---------------------------------------------------------------

function Section3Detection({
  etude,
  meta,
}: {
  etude: EtudeView;
  meta: DocMeta;
}) {
  const content = getSection(etude, "presentation_carrefour");
  const tables = findBlocks(content, "table");
  const detTable = tables[4];
  const bpTable = tables[5];
  return (
    <SectionPage meta={meta} number="3" title="Detection">
      <ST style={s.subSectionTitle}>3.1 Detection vehicules</ST>
      {detTable ? <TableView table={detTable} /> : null}
      <ST style={s.subSectionTitle}>3.2 Detection pietons</ST>
      {bpTable ? <TableView table={bpTable} /> : null}
      <ST style={s.subSectionTitle}>3.3 Priorite vehicules d'urgence</ST>
      <Para>
        Couloir vert force par l'agent IA EmergencyVehicleAgent ou par
        l'operateur (permission emergency.override). API HMAC, TTL 60 s,
        retour automatique en fin de TTL.
      </Para>
      <ST style={s.subSectionTitle}>3.4 Renvoi planche</ST>
      <Para>
        Plan d'implantation de la detection — voir planche{" "}
        {meta.docCode}/03.
      </Para>
    </SectionPage>
  );
}

// ---------------------------------------------------------------
// Section 4 — Interface système / SigFer
// ---------------------------------------------------------------

function Section4Interface({
  etude,
  meta,
}: {
  etude: EtudeView;
  meta: DocMeta;
}) {
  const sigfer = getSection(etude, "affectation_entrees_sigfer");
  const isTram = etude.scope === "tram";
  return (
    <SectionPage meta={meta} number="4" title="Interface systeme / SigFer">
      <ST style={s.subSectionTitle}>4.1 Architecture systeme</ST>
      <Para>
        Chaine : Dashboard (Next.js) — Backend (NestJS + agents IA) —
        Runtime on-site (Go) — Controleur ATC. Liaisons backend/runtime
        signees HMAC SHA-256. Fallback offline sur le dernier plan valide.
      </Para>
      <ST style={s.subSubSectionTitle}>Cycle de vie d'une commande</ST>
      <TableView
        table={{
          kind: "table",
          caption:
            "Etats successifs d'une commande controleur (table traffic_commands)",
          columns: [
            { key: "state", label: "Etat", align: "center" },
            { key: "trigger", label: "Declencheur" },
            { key: "effet", label: "Effet" },
            { key: "audit", label: "Audit" },
          ],
          rows: [
            { state: "queued", trigger: "Decision agent / operateur", effet: "Commande mise en file", audit: "audit_logs" },
            { state: "dispatched", trigger: "Poller runtime", effet: "Dispatch hardware lance", audit: "audit_logs" },
            { state: "acknowledged", trigger: "Retour controleur", effet: "Application confirmee", audit: "audit_logs" },
            { state: "failed", trigger: "Driver ok:false", effet: "Note d'echec horodatee", audit: "audit_logs" },
            { state: "superseded", trigger: "Cmd prioritaire", effet: "Remplacement avant exec.", audit: "audit_logs" },
          ],
        }}
      />
      <ST style={s.subSectionTitle}>
        4.2 Priorite TC — SigFer {isTram ? "(actif)" : "(non applicable)"}
      </ST>
      {isTram ? (
        sigfer ? (
          renderSectionBlocks(sigfer)
        ) : (
          <Para>Section a generer depuis l'atelier ingenierie.</Para>
        )
      ) : (
        <Para>
          Section non applicable au present indice (scope standard, sans
          transport en commun en site propre). Une reserve de codification
          SigFer est neanmoins maintenue pour une eventuelle evolution
          tramway.
        </Para>
      )}
    </SectionPage>
  );
}

// ---------------------------------------------------------------
// Section 5 — Description physique (5.1 → 5.7)
// ---------------------------------------------------------------

function Section5DescriptionPhysique({
  etude,
  meta,
}: {
  etude: EtudeView;
  meta: DocMeta;
}) {
  const diaser = getSection(etude, "affectation_entrees_diaser");
  const lignes = getSection(etude, "affectation_lignes_de_feux");
  const degagement = getSection(etude, "tableau_degagement");
  const matrice = getSection(etude, "matrice_conflit");

  // Section 5 reuses the inputs DOE table from diaser ; outputs are
  // surfaced separately in §5.2 (deportees / API) and §7 (DIASER).
  const diaserTables = findBlocks(diaser, "table");
  const inputsTable = diaserTables[0];
  const lignesTable = findBlocks(lignes, "table")[0];
  const matriceTable = findBlocks(matrice, "table")[0];
  const degTable = findBlocks(degagement, "table")[0];

  return (
    <SectionPage meta={meta} number="5" title="Description physique">
      <ST style={s.subSectionTitle}>5.1 Affectation des entrees controleur</ST>
      {inputsTable ? (
        <TableView
          table={remapInputsToDoeColumns(inputsTable)}
        />
      ) : (
        <Para>Section non encore generee.</Para>
      )}

      <ST style={s.subSectionTitle}>
        5.2 Affectation des entrees deportees / API
      </ST>
      <Para>
        Declencheurs logiciels (agents IA, API operateur) injectes via
        commande HMAC signee. Pas de cablage physique.
      </Para>
      <TableView
        table={{
          kind: "table",
          caption: "Entrees deportees — API STLS",
          columns: [
            { key: "id", label: "N° API", align: "center" },
            { key: "mnemo", label: "Mnemo" },
            { key: "designation", label: "Designation" },
            { key: "source", label: "Source" },
            { key: "traitement", label: "Traitement" },
          ],
          rows: [
            { id: "A01", mnemo: "FORCE_PH1", designation: "Forcage phase 1", source: "Operateur", traitement: "Override + audit" },
            { id: "A02", mnemo: "FORCE_PH2", designation: "Forcage phase 2", source: "Operateur", traitement: "Override + audit" },
            { id: "A03", mnemo: "FORCE_PH3", designation: "Forcage phase 3", source: "Operateur", traitement: "Override + audit" },
            { id: "A04", mnemo: "EMERG_NS", designation: "Couloir urgence N-S", source: "Agent IA / operateur", traitement: "Vert force <=60 s + audit" },
            { id: "A05", mnemo: "EMERG_EW", designation: "Couloir urgence E-W", source: "Agent IA / operateur", traitement: "Vert force <=60 s + audit" },
            { id: "A06", mnemo: "PLAN_HPM", designation: "Bascule plan HPM", source: "Scheduler / IA", traitement: "Change plan + audit" },
            { id: "A07", mnemo: "PLAN_HPS", designation: "Bascule plan HPS", source: "Scheduler / IA", traitement: "Change plan + audit" },
            { id: "A08", mnemo: "PLAN_HC", designation: "Bascule plan HC", source: "Scheduler / IA", traitement: "Change plan + audit" },
            { id: "A09", mnemo: "PROLONG", designation: "Prolongation vert", source: "Agent IA", traitement: "Cap <=maxGreen" },
            { id: "A10", mnemo: "BLOQ_IA", designation: "Blocage commandes IA", source: "Operateur", traitement: "Verrou manuel" },
          ],
        }}
      />

      <ST style={s.subSectionTitle}>5.3 Table de configuration reseau</ST>
      <TableView
        table={{
          kind: "table",
          caption: "Plan d'adressage et liaisons IP",
          columns: [
            { key: "elt", label: "Element" },
            { key: "adresse", label: "Adresse" },
            { key: "vlan", label: "VLAN", align: "center" },
            { key: "proto", label: "Protocole" },
            { key: "role", label: "Role" },
          ],
          rows: [
            { elt: "Controleur ATC", adresse: "a attribuer (DHCP reserve)", vlan: "41", proto: "HTTPS + RS-485", role: "Execution feux" },
            { elt: "Runtime Go on-site", adresse: "192.168.41.10", vlan: "41", proto: "HTTPS REST + WS", role: "Dispatch + watchdog" },
            { elt: "Modem 4G de secours", adresse: "IP operateur", vlan: "-", proto: "WireGuard", role: "Tunnel WAN secours" },
            { elt: "Backend STLS", adresse: "api.stls.local", vlan: "-", proto: "HTTPS + WS", role: "Decision + audit" },
            { elt: "Switch armoire", adresse: "192.168.41.1", vlan: "41", proto: "L2", role: "Aggregation" },
            { elt: "DNS / NTP", adresse: "192.168.0.1", vlan: "-", proto: "UDP", role: "Resolution + horloge" },
          ],
        }}
      />

      <ST style={s.subSectionTitle}>5.4 Gestion memoires / demandes</ST>
      <TableView
        table={{
          kind: "table",
          caption: "Memorisation et expiration des demandes",
          columns: [
            { key: "demande", label: "Demande" },
            { key: "source", label: "Source" },
            { key: "memo", label: "Memo (s)", align: "right" },
            { key: "ttl", label: "TTL (s)", align: "right" },
            { key: "reset", label: "Reset" },
          ],
          rows: [
            { demande: "Presence boucle", source: "BCL-*", memo: 4, ttl: 8, reset: "Sortie zone" },
            { demande: "Appel pieton", source: "BP-P*", memo: 90, ttl: 90, reset: "Service vert pieton" },
            { demande: "Force phase", source: "API operateur", memo: 0, ttl: 60, reset: "Release override" },
            { demande: "Couloir urgence", source: "Agent IA / API", memo: 0, ttl: 60, reset: "TTL ou release" },
            { demande: "Prolongation", source: "Agent IA", memo: 0, ttl: 30, reset: "Application ou veto" },
            { demande: "Bascule plan", source: "Scheduler / IA", memo: 0, ttl: 30, reset: "Application ou veto" },
          ],
        }}
      />

      <ST style={s.subSectionTitle}>5.5 Affectation des lignes de feux</ST>
      {lignesTable ? (
        <TableView
          table={remapLignesToDoeColumns(lignesTable)}
        />
      ) : (
        <Para>Section non encore generee.</Para>
      )}

      <ST style={s.subSectionTitle}>5.6 Distances de conflit</ST>
      <Para>
        Mesures inter-feux (extremite la plus defavorable) ; vitesse de
        reference 50 km/h.
      </Para>
      <TableView
        table={{
          kind: "table",
          caption: "Matrice des distances de conflit (m)",
          columns: [
            { key: "from", label: "De \\ Vers", align: "center" },
            { key: "V1", label: "V1", align: "right" },
            { key: "V2", label: "V2", align: "right" },
            { key: "V3", label: "V3", align: "right" },
            { key: "V4", label: "V4", align: "right" },
            { key: "V5", label: "V5", align: "right" },
            { key: "V6", label: "V6", align: "right" },
          ],
          rows: [
            { from: "V1", V1: "-", V2: 5, V3: 12, V4: 14, V5: 11, V6: 10 },
            { from: "V2", V1: 5, V2: "-", V3: 14, V4: 12, V5: 11, V6: 10 },
            { from: "V3", V1: 12, V2: 14, V3: "-", V4: 5, V5: 11, V6: 10 },
            { from: "V4", V1: 14, V2: 12, V3: 5, V4: "-", V5: 11, V6: 10 },
            { from: "V5", V1: 11, V2: 11, V3: 11, V4: 11, V5: "-", V6: 7 },
            { from: "V6", V1: 10, V2: 10, V3: 10, V4: 10, V5: 7, V6: "-" },
          ],
        }}
      />
      <Note>
        Valeurs prescriptives a confirmer apres releve geometrique sur site.
      </Note>

      <ST style={s.subSectionTitle}>5.7 Matrice des temps de degagement</ST>
      {degTable ? (
        <TableView table={degTable} />
      ) : (
        <Para>Section non encore generee.</Para>
      )}
      <ST style={s.subSubSectionTitle}>Matrice de conflit (lecture)</ST>
      {matriceTable ? (
        <TableView table={matriceTable} />
      ) : (
        <Para>Matrice non encore generee.</Para>
      )}
    </SectionPage>
  );
}

// Reshape the basic DIASER inputs table into the DOE column set
// (N°, Adresse, Mnemo, Designation, Type, Traitement).
function remapInputsToDoeColumns(t: TableBlock): TableBlock {
  return {
    kind: "table",
    caption:
      "Entrees controleur — adresse physique / mnemonique / traitement",
    columns: [
      { key: "in", label: "N° entree", align: "center" },
      { key: "adresse", label: "Adresse" },
      { key: "mnemo", label: "Mnemo" },
      { key: "designation", label: "Designation" },
      { key: "type", label: "Type" },
      { key: "traitement", label: "Traitement" },
    ],
    rows: t.rows.map((row) => {
      const idStr = String(row.in ?? "");
      const sourceStr = String(row.source ?? "");
      const mnemo = sourceStr.replace(/[^A-Z0-9_]/g, "");
      return {
        in: idStr,
        adresse: idStr ? `@IN-${idStr.replace(/[^0-9]/g, "")}` : "-",
        mnemo: mnemo || sourceStr || "-",
        designation: row.fonction ?? "",
        type: row.type ?? "",
        traitement: `Filtrage ${row.filtre ?? "-"} / niveau ${row.niveau ?? "-"}`,
      };
    }),
  };
}

function remapLignesToDoeColumns(t: TableBlock): TableBlock {
  return {
    kind: "table",
    caption:
      "Affectation lignes de feux — appellation / type / fonctionnement / voie",
    columns: [
      { key: "line", label: "N° ligne", align: "center" },
      { key: "code", label: "Appellation" },
      { key: "type", label: "Type", align: "center" },
      { key: "fonctionnement", label: "Fonctionnement" },
      { key: "affect", label: "Affect. puissance", align: "right" },
      { key: "voie", label: "Designation voie" },
      { key: "vitesse", label: "Vitesse (km/h)", align: "right" },
    ],
    rows: t.rows.map((row) => {
      const type = String(row.type ?? "VP");
      return {
        line: row.line ?? "",
        code: row.code ?? "",
        type,
        fonctionnement: type === "PIE" ? "Pieton + son" : "Tricolore",
        affect: type === "PIE" ? "25 W" : "60 W",
        voie: row.mouvement ?? "",
        vitesse: type === "PIE" ? "-" : 50,
      };
    }),
  };
}

// ---------------------------------------------------------------
// Section 6 — Fonctionnement (6.1 → 6.5)
// ---------------------------------------------------------------

function Section6Fonctionnement({
  etude,
  meta,
}: {
  etude: EtudeView;
  meta: DocMeta;
}) {
  const micro = getSection(etude, "micro_regulation");
  const phasage = getSection(etude, "phasage");
  const manuel = getSection(etude, "fonctionnements_manuels");
  const hpm = getSection(etude, "plan_feux_hpm");
  const hps = getSection(etude, "plan_feux_hps");
  const hc = getSection(etude, "plan_feux_hc");
  const hm = getSection(etude, "plan_feux_hm");

  const phaseTable = findBlocks(phasage, "table")[0];
  const greenTable = findBlocks(phasage, "table")[1];
  const microTables = findBlocks(micro, "table");
  const manuelTables = findBlocks(manuel, "table");

  return (
    <SectionPage meta={meta} number="6" title="Fonctionnement">
      <ST style={s.subSectionTitle}>6.1 Principe de fonctionnement</ST>
      <Para>
        Boucle fermee 3 niveaux : controleur ATC (cycle local + lecture
        entrees), runtime on-site (watchdog + fallback), backend STLS +
        agents IA (adaptation + audit).
      </Para>
      <ST style={s.subSubSectionTitle}>Phasage</ST>
      {phaseTable ? <TableView table={phaseTable} /> : null}
      <ST style={s.subSubSectionTitle}>Plages temporelles</ST>
      {greenTable ? <TableView table={greenTable} /> : null}

      <ST style={s.subSectionTitle}>
        6.2 Priorite urgence / regulation IA
      </ST>
      <Para>
        Couloir d'urgence : operateur (perm. emergency.override) ou agent
        IA. TTL 60 s, sortie sur TTL ou release. Toute recommandation IA
        passe la grille de validation ci-dessous.
      </Para>
      {microTables[0] ? <TableView table={microTables[0]} /> : null}

      <ST style={s.subSectionTitle}>6.3 Capacite</ST>
      <Para>
        Webster — sat. 1 800 v/h/voie, cycle HPM 120 s. Releve terrain a
        conduire.
      </Para>
      <TableView
        table={{
          kind: "table",
          caption: "Capacite par approche (HPM, cycle 120 s)",
          columns: [
            { key: "appr", label: "Approche" },
            { key: "demande", label: "Demande (veh/h)", align: "right" },
            { key: "vert", label: "Vert effectif (s)", align: "right" },
            { key: "cap", label: "Capacite (veh/h)", align: "right" },
            { key: "sat", label: "Taux saturation", align: "right" },
            { key: "delay", label: "Delai moyen (s)", align: "right" },
          ],
          rows: [
            { appr: "E tout droit + droite", demande: 950, vert: 45, cap: 1440, sat: "66 %", delay: 24 },
            { appr: "W tout droit + droite", demande: 880, vert: 45, cap: 1440, sat: "61 %", delay: 22 },
            { appr: "E gauche", demande: 150, vert: 18, cap: 340, sat: "44 %", delay: 38 },
            { appr: "W gauche", demande: 170, vert: 18, cap: 340, sat: "50 %", delay: 42 },
            { appr: "N + S", demande: 460, vert: 35, cap: 700, sat: "66 %", delay: 28 },
          ],
        }}
      />

      <ST style={s.subSectionTitle}>6.4 Diagrammes</ST>
      <ST style={s.subSubSectionTitle}>Plan HPM — cycle 120 s</ST>
      <TableView table={planSummary("HPM", hpm)} />
      <ST style={s.subSubSectionTitle}>Plan HPS — cycle 120 s</ST>
      <TableView table={planSummary("HPS", hps)} />
      <ST style={s.subSubSectionTitle}>Plan HC — cycle 90 s</ST>
      <TableView table={planSummary("HC", hc)} />
      <ST style={s.subSubSectionTitle}>Plan HM — cycle 100 s</ST>
      <TableView table={planSummary("HM", hm)} />
      <ST style={s.subSubSectionTitle}>Renvois planches</ST>
      <Para>
        Diagramme de phasage : planche {meta.docCode}/04. Diagramme de
        timing HPM (cycle 120 s) : planche {meta.docCode}/05.
      </Para>

      <ST style={s.subSectionTitle}>6.5 Fonctionnements manuels</ST>
      {manuelTables[0] ? <TableView table={manuelTables[0]} /> : null}
      {manuelTables[1] ? <TableView table={manuelTables[1]} /> : null}
    </SectionPage>
  );
}

function planSummary(label: string, content: StructuredContent | null): TableBlock {
  const t = findBlocks(content, "table")[0];
  if (!t) {
    return {
      kind: "table",
      caption: `Plan ${label} — parametres`,
      columns: [
        { key: "p", label: "Parametre" },
        { key: "v", label: "Valeur", align: "right" },
      ],
      rows: [{ p: "Non genere", v: "-" }],
    };
  }
  return { ...t, caption: `Plan ${label} — parametres` };
}

// ---------------------------------------------------------------
// Section 7 — Affectation DIASER / API
// ---------------------------------------------------------------

function Section7Diaser({
  etude,
  meta,
}: {
  etude: EtudeView;
  meta: DocMeta;
}) {
  const content = getSection(etude, "affectation_entrees_diaser");
  const tables = findBlocks(content, "table");
  // tables[0] inputs, [1] outputs already used in §5.
  // tables[2..6] are DIASER I_/O_/V_/C_/S_.
  return (
    <SectionPage meta={meta} number="7" title="Affectation DIASER / API">
      <Para>
        Variables DIASER (Description Integree des Asservissements
        Signalisation Et Regulation) adaptees au modele STLS. Convention :
        I_* entrees, O_* sorties, V_* variables internes, C_* variables de
        commande, S_* variables d'etat diffusees vers le backend.
      </Para>
      <ST style={s.subSectionTitle}>7.1 Variables d'entree (I_*)</ST>
      {tables[2] ? <TableView table={tables[2]} /> : null}
      <ST style={s.subSectionTitle}>7.2 Variables de sortie (O_*)</ST>
      {tables[3] ? <TableView table={tables[3]} /> : null}
      <ST style={s.subSectionTitle}>7.3 Variables internes (V_*)</ST>
      {tables[4] ? <TableView table={tables[4]} /> : null}
      <ST style={s.subSectionTitle}>7.4 Variables de commande (C_*)</ST>
      {tables[5] ? <TableView table={tables[5]} /> : null}
      <ST style={s.subSectionTitle}>7.5 Variables d'etat (S_*)</ST>
      {tables[6] ? <TableView table={tables[6]} /> : null}
    </SectionPage>
  );
}

// ---------------------------------------------------------------
// Section 8 — Équipements
// ---------------------------------------------------------------

function Section8Equipements({
  etude,
  meta,
}: {
  etude: EtudeView;
  meta: DocMeta;
}) {
  const annexes = getSection(etude, "annexes");
  const tables = findBlocks(annexes, "table");
  return (
    <SectionPage meta={meta} number="8" title="Equipements">
      <ST style={s.subSectionTitle}>8.1 Nomenclature</ST>
      {tables[0] ? <TableView table={tables[0]} /> : null}
      <ST style={s.subSectionTitle}>8.2 Conditions environnementales</ST>
      {tables[1] ? <TableView table={tables[1]} /> : null}
      <ST style={s.subSectionTitle}>8.3 Alimentation et secours</ST>
      <TableView
        table={{
          kind: "table",
          caption: "Schema d'alimentation",
          columns: [
            { key: "elt", label: "Element" },
            { key: "val", label: "Valeur" },
            { key: "comment", label: "Commentaire" },
          ],
          rows: [
            { elt: "Tension reseau", val: "230 V AC +/- 10 %, 50 Hz", comment: "Disjoncteur 32 A dedie" },
            { elt: "Protection amont", val: "Diff. 30 mA", comment: "Conforme NF C 15-100" },
            { elt: "UPS", val: "1500 VA, autonomie >= 30 min", comment: "Marque a valider" },
            { elt: "Repli secteur HS", val: "Clignotant orange", comment: "Cablage independant du controleur" },
            { elt: "Mise a la terre", val: "< 5 Ohms", comment: "Mesure en recette" },
          ],
        }}
      />
    </SectionPage>
  );
}

// ===============================================================
// Top-level document
// ===============================================================

interface EtudePdfProps {
  etude: EtudeView;
  assets?: EtudePdfAssets;
}

function buildCartouche(
  meta: DocMeta,
  drawingTitle: string,
  scale: string,
  sheet: string,
): CartoucheMeta {
  return {
    project: "STLS",
    carrefourCode: meta.carrefourCode,
    carrefourLabel: meta.carrefourLabel,
    drawingTitle,
    scale,
    format: "A4 paysage",
    indice: meta.indice,
    date: meta.todayShort,
    redacteur: "A. Karim",
    verificateur: "—",
    approbateur: "—",
    sheet,
    docCode: meta.docCode,
  };
}

export function EtudePdfDocument({ etude, assets }: EtudePdfProps) {
  const meta = buildMeta(etude);
  const intersection = etude.intersectionCode ?? null;
  const districtFromMeta = null; // district isn't in EtudeView ; left null
  return (
    <Document
      title={pdfSafe(
        `Dossier ${meta.carrefourCode} — ${meta.carrefourLabel}`,
      )}
      author="STLS Engineering"
      subject="Dossier de regulation carrefour"
    >
      <CoverPage etude={etude} meta={meta} />
      <SommairePage meta={meta} />
      <Section1PlanDeSituation etude={etude} meta={meta} />
      <DrawingPage
        meta={buildCartouche(meta, "Plan de situation", "1 / 2 500", "01")}
      >
        {assets?.situationMapDataUri ? (
          <SituationMapReal
            latitude={etude.latitude}
            longitude={etude.longitude}
            intersectionCode={intersection}
            intersectionLabel={etude.intersectionLabel}
            district={districtFromMeta}
            mainDataUri={assets.situationMapDataUri}
            insetDataUri={assets.situationMapInsetDataUri}
            mainZoom={assets.situationMapZoom}
          />
        ) : (
          <SituationMap
            latitude={etude.latitude}
            longitude={etude.longitude}
          />
        )}
      </DrawingPage>
      <Section2PlanAmenagement etude={etude} meta={meta} />
      <DrawingPage
        meta={buildCartouche(meta, "Plan d'amenagement", "1 / 200", "02")}
      >
        <CarrefourSchematic />
      </DrawingPage>
      <Section3Detection etude={etude} meta={meta} />
      <DrawingPage
        meta={buildCartouche(meta, "Plan de detection", "1 / 200", "03")}
      >
        <CarrefourSchematic detection />
      </DrawingPage>
      <Section4Interface etude={etude} meta={meta} />
      <Section5DescriptionPhysique etude={etude} meta={meta} />
      <Section6Fonctionnement etude={etude} meta={meta} />
      <DrawingPage
        meta={buildCartouche(meta, "Diagramme de phasage", "—", "04")}
      >
        <PhasageDiagram />
      </DrawingPage>
      <DrawingPage
        meta={buildCartouche(meta, "Diagramme de timing HPM", "1 s / mm", "05")}
      >
        <TimingChart />
      </DrawingPage>
      <Section7Diaser etude={etude} meta={meta} />
      <Section8Equipements etude={etude} meta={meta} />
    </Document>
  );
}
