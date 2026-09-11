/**
 * React-PDF document for the Plan d'aménagement + Régulation / Câblage dossiers.
 *
 * The topographic drawing is emitted as @react-pdf Svg primitives built
 * directly from the CivilPlan, so the PDF is pure vector — no Google
 * raster tiles, no screenshot fallback. Dossier tables match the
 * structure of the GroupéRyX reference PDF (cover, revision table,
 * section numbering with green headers).
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  G,
  Rect,
  Polygon,
  Polyline,
  Line,
  Circle,
  Ellipse,
  Path,
  Image,
} from "@react-pdf/renderer";

import type { IntersectionConfig } from "@/components/studio/state/types";
import type {
  BaseLayerFeature,
  BaseLayerKind,
  CivilPlan,
  CivilPlanLayer,
  Lane,
  PlanBounds,
  PlanPoint,
  RefugeIsland,
  RoadArm,
  SignalHead,
} from "@/types/civil-plan";
import type { EngineeringIntersectionRecord } from "@/types/engineering-studio";

// Palette — mirrors GroupéRyX house style.
const GREEN = "#2e8b4c";
const GREEN_DARK = "#1b5e2c";
const GREEN_TINT = "#d8ecd8";
const INK = "#0f1a12";
const INK_MUTED = "#4a5660";
const BORDER = "#333333";
const BORDER_LIGHT = "#9ca3a0";

const s = StyleSheet.create({
  page: {
    padding: "16mm 14mm 18mm 14mm",
    fontSize: 9,
    fontFamily: "Helvetica",
    color: INK,
  },
  pageLandscape: {
    padding: "12mm 14mm 14mm 14mm",
    fontSize: 9,
    fontFamily: "Helvetica",
    color: INK,
  },
  pageHeader: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    paddingBottom: 4,
    marginBottom: 8,
    fontSize: 8,
  },
  pageHeaderLeft: { flex: 1 },
  pageHeaderRight: {
    width: 120,
    borderLeftWidth: 0.5,
    borderLeftColor: BORDER,
    paddingLeft: 6,
    fontFamily: "Helvetica-Bold",
  },
  pageFooter: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 10,
    fontSize: 7,
    color: INK_MUTED,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 0.5,
    borderTopColor: BORDER_LIGHT,
    paddingTop: 4,
  },
  h1: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: GREEN_DARK,
    marginTop: 4,
    marginBottom: 4,
  },
  h2: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: GREEN_DARK,
    marginTop: 10,
    marginBottom: 3,
  },
  accentBar: { width: 30, height: 2, backgroundColor: GREEN, marginBottom: 5 },

  coverPage: {
    padding: "22mm 18mm",
    fontSize: 10,
    fontFamily: "Helvetica",
    color: INK,
  },
  coverHeadBox: {
    borderWidth: 1,
    borderColor: INK,
    padding: 8,
    alignSelf: "center",
    alignItems: "center",
    marginTop: 30,
  },
  coverHeadText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    textAlign: "center",
  },
  coverTitle: {
    marginTop: 60,
    textAlign: "center",
    fontSize: 17,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.4,
  },
  coverSubtitleBar: {
    marginTop: 40,
    alignSelf: "center",
    borderBottomWidth: 1,
    borderBottomColor: INK,
    paddingBottom: 4,
    paddingHorizontal: 12,
  },
  coverSubtitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    textAlign: "center",
  },
  coverProject: {
    marginTop: 6,
    textAlign: "center",
    fontSize: 9,
    color: INK_MUTED,
  },
  revisionTable: {
    marginTop: 30,
    borderWidth: 0.5,
    borderColor: BORDER,
  },
  revisionRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },
  revisionCellHead: {
    backgroundColor: GREEN_TINT,
    padding: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  revisionCell: { padding: 4, fontSize: 8 },

  table: {
    borderWidth: 0.5,
    borderColor: BORDER,
    marginTop: 4,
    marginBottom: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER_LIGHT,
  },
  tableRowLast: { flexDirection: "row" },
  tableHead: {
    backgroundColor: GREEN_TINT,
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },
  th: {
    padding: 3.5,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: GREEN_DARK,
    borderRightWidth: 0.5,
    borderRightColor: BORDER,
  },
  td: {
    padding: 3.5,
    fontSize: 8,
    color: INK,
    borderRightWidth: 0.5,
    borderRightColor: BORDER_LIGHT,
  },
  tdMono: {
    padding: 3.5,
    fontSize: 8,
    fontFamily: "Courier-Bold",
    color: INK,
    borderRightWidth: 0.5,
    borderRightColor: BORDER_LIGHT,
  },
  tdLast: { padding: 3.5, fontSize: 8, color: INK },
  note: {
    fontSize: 7.5,
    color: INK_MUTED,
    marginTop: 4,
    fontStyle: "italic",
  },

  planFrame: {
    flexGrow: 1,
    borderWidth: 0.5,
    borderColor: BORDER,
  },
  planCaption: {
    marginTop: 4,
    fontSize: 8,
    color: INK_MUTED,
    textAlign: "center",
  },
});

function fmt(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// ─────────────────────────────────────────────────────────────────────────
// Top-level document
// ─────────────────────────────────────────────────────────────────────────

interface CivilPlanDocumentProps {
  plan: CivilPlan;
  intersection: EngineeringIntersectionRecord;
  kind: "plan" | "regulation" | "cablage";
  layers: Record<CivilPlanLayer, boolean>;
  projectName: string;
  client: string;
  revision: string;
  /** Stored studio config — when present, regulation / cablage
   *  sections are populated from the operator's edits instead of
   *  defaults. */
  storedConfig?: IntersectionConfig;
}

export function CivilPlanDocument({
  plan,
  intersection,
  kind,
  layers,
  projectName,
  client,
  revision,
  storedConfig,
}: CivilPlanDocumentProps) {
  const title =
    kind === "cablage"
      ? `Dossier de câblage — ${plan.intersectionName}`
      : kind === "regulation"
        ? `Dossier de régulation — ${plan.intersectionName}`
        : `Plan d'aménagement — ${plan.intersectionName}`;
  const today = new Date();
  const dateStr = fmt(today);

  // Backdrop reference page is appended whenever the operator
  // uploaded a consultant étude.  Full-bleed image preserves the
  // original CAD plan in the dossier for audit / cross-checking.
  const includeBackdrop = layers.backdrop && plan.backdropImage != null;

  if (kind === "plan") {
    return (
      <Document title={title} author="STLS Studio">
        <PlanDrawingPage
          plan={plan}
          layers={layers}
          subtitle={`${plan.intersectionCode} · ${intersection.district || "—"}`}
          revision={revision}
          dateStr={dateStr}
        />
        {includeBackdrop ? (
          <BackdropReferencePage
            plan={plan}
            revision={revision}
            dateStr={dateStr}
          />
        ) : null}
      </Document>
    );
  }

  return (
    <Document title={title} author="STLS Studio">
      <CoverPage
        title={title}
        kind={kind}
        client={client}
        projectName={projectName}
        revision={revision}
        dateStr={dateStr}
      />
      {kind === "regulation" ? (
        <>
          <RegulationIdentityPage
            plan={plan}
            intersection={intersection}
            revision={revision}
            storedConfig={storedConfig}
          />
          <PlanDrawingPage
            plan={plan}
            layers={layers}
            subtitle="Plan d'aménagement — état signalisation"
            revision={revision}
            dateStr={dateStr}
          />
          <RegulationPhasesPage
            plan={plan}
            intersection={intersection}
            revision={revision}
            storedConfig={storedConfig}
          />
        </>
      ) : (
        <>
          <PlanDrawingPage
            plan={plan}
            layers={layers}
            subtitle="Plan de câblage — réseaux SLT"
            revision={revision}
            dateStr={dateStr}
          />
          <CablageCarnetPage plan={plan} intersection={intersection} revision={revision} />
          <CablageQuantitativePage
            plan={plan}
            revision={revision}
            storedConfig={storedConfig}
          />
        </>
      )}
      {includeBackdrop ? (
        <BackdropReferencePage
          plan={plan}
          revision={revision}
          dateStr={dateStr}
        />
      ) : null}
    </Document>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Backdrop reference page — full-bleed reproduction of the consultant
// étude image (PNG / JPG / SVG) uploaded by the operator.  Kept on its
// own page so we don't have to replicate preserveAspectRatio math to
// align it with the engineering Svg.
// ─────────────────────────────────────────────────────────────────────────

function BackdropReferencePage({
  plan,
  revision,
  dateStr,
}: {
  plan: CivilPlan;
  revision: string;
  dateStr: string;
}) {
  const img = plan.backdropImage;
  if (!img) return null;
  return (
    <Page size="A3" orientation="landscape" style={s.pageLandscape}>
      <ChromeHeader
        title={`Référence étude — ${plan.intersectionName}`}
        subtitle={img.name}
        revision={revision}
      />
      <View style={s.planFrame}>
        <Image
          src={img.dataUrl}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </View>
      <Text style={s.planCaption}>
        Étude consultant · {plan.intersectionCode} · {dateStr}
      </Text>
      <ChromeFooter pageNumber={1} totalPages={1} />
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Shared page chrome
// ─────────────────────────────────────────────────────────────────────────

function ChromeHeader({
  title,
  subtitle,
  revision,
}: {
  title: string;
  subtitle?: string;
  revision: string;
}) {
  return (
    <View style={s.pageHeader} fixed>
      <View style={s.pageHeaderLeft}>
        <Text>Travaux de Signalisation Lumineuse Tricolore</Text>
        <Text>{title}</Text>
        {subtitle ? <Text style={{ color: INK_MUTED }}>{subtitle}</Text> : null}
      </View>
      <View style={s.pageHeaderRight}>
        <Text>SOCIÉTÉ</Text>
        <Text>RÉGION</Text>
        <Text>AMÉNAGEMENT</Text>
        <Text style={{ marginTop: 3, color: INK_MUTED }}>Version {revision}</Text>
      </View>
    </View>
  );
}

function ChromeFooter({
  pageNumber,
  totalPages,
}: {
  pageNumber: number;
  totalPages: number;
}) {
  return (
    <View style={s.pageFooter} fixed>
      <Text>© Exporté depuis STLS Studio — reproduction autorisée interne</Text>
      <Text>
        {pageNumber} / {totalPages}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Cover
// ─────────────────────────────────────────────────────────────────────────

function CoverPage({
  title,
  kind,
  client,
  projectName,
  revision,
  dateStr,
}: {
  title: string;
  kind: "regulation" | "cablage";
  client: string;
  projectName: string;
  revision: string;
  dateStr: string;
}) {
  void kind;
  return (
    <Page size="A4" style={s.coverPage}>
      <View style={s.coverHeadBox}>
        <Text style={s.coverHeadText}>{client.toUpperCase()}</Text>
      </View>

      <Text style={s.coverTitle}>{title}</Text>

      <View style={s.coverSubtitleBar}>
        <Text style={s.coverSubtitle}>
          Travaux de Signalisation Lumineuse Tricolore
        </Text>
      </View>
      <Text style={s.coverProject}>Projet {projectName}</Text>

      <View style={s.revisionTable}>
        <View style={s.revisionRow}>
          <Text style={[s.revisionCellHead, { flex: 1 }]}>Version</Text>
          <Text style={[s.revisionCellHead, { flex: 1.2 }]}>Date de révision</Text>
          <Text style={[s.revisionCellHead, { flex: 2 }]}>Objet de la révision</Text>
        </View>
        <View style={s.revisionRow}>
          <Text style={[s.revisionCell, { flex: 1 }]}>{revision}</Text>
          <Text style={[s.revisionCell, { flex: 1.2 }]}>{dateStr}</Text>
          <Text style={[s.revisionCell, { flex: 2 }]}>
            Génération automatique depuis STLS Studio
          </Text>
        </View>
        <View style={s.revisionRow}>
          <Text style={[s.revisionCellHead, { flex: 1 }]}>Préparé par</Text>
          <Text style={[s.revisionCell, { flex: 3.2 }]}>STLS Studio</Text>
        </View>
        <View style={[s.revisionRow, { borderBottomWidth: 0 }]}>
          <Text style={[s.revisionCellHead, { flex: 1 }]}>Vérifié par</Text>
          <Text style={[s.revisionCell, { flex: 3.2 }]}>
            Opérateur / BE à valider
          </Text>
        </View>
      </View>

      <Text style={[s.note, { marginTop: 30, textAlign: "center" }]}>
        Document généré depuis la configuration carrefour courante. Les valeurs
        détaillées (matrice de dégagement, temps de rouge complets) restent à
        valider par le bureau d&apos;études avant approbation finale.
      </Text>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Plan drawing page (landscape A3) — pure vector, built from CivilPlan
// ─────────────────────────────────────────────────────────────────────────

function PlanDrawingPage({
  plan,
  layers,
  subtitle,
  revision,
  dateStr,
}: {
  plan: CivilPlan;
  layers: Record<CivilPlanLayer, boolean>;
  subtitle: string;
  revision: string;
  dateStr: string;
}) {
  return (
    <Page size="A3" orientation="landscape" style={s.pageLandscape}>
      <ChromeHeader
        title={`Plan d'aménagement — ${plan.intersectionName}`}
        subtitle={subtitle}
        revision={revision}
      />
      <View style={s.planFrame}>
        <CivilPlanSvg plan={plan} layers={layers} />
      </View>
      <Text style={s.planCaption}>
        Échelle 1:{plan.defaultScale ?? 200} · Carrefour {plan.intersectionCode} ·{" "}
        {dateStr}
      </Text>
      <ChromeFooter pageNumber={1} totalPages={1} />
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Regulation content
// ─────────────────────────────────────────────────────────────────────────

function RegulationIdentityPage({
  plan,
  intersection,
  revision,
  storedConfig,
}: {
  plan: CivilPlan;
  intersection: EngineeringIntersectionRecord;
  revision: string;
  storedConfig?: IntersectionConfig;
}) {
  const primaryController = intersection.controllers[0];
  const obs = storedConfig?.regulationSettings?.observations;
  return (
    <Page size="A4" style={s.page}>
      <ChromeHeader
        title={`Dossier de régulation — ${plan.intersectionName}`}
        subtitle="Identité & inventaire"
        revision={revision}
      />

      <Text style={s.h1}>1. IDENTITÉ DU CARREFOUR</Text>
      <View style={s.accentBar} />
      <View style={s.table}>
        <View style={s.tableHead}>
          <Text style={[s.th, { flex: 1.3 }]}>Champ</Text>
          <Text style={[s.th, { flex: 3, borderRightWidth: 0 }]}>Valeur</Text>
        </View>
        {[
          ["Code carrefour", plan.intersectionCode],
          ["Nom", plan.intersectionName],
          ["District", intersection.district || "—"],
          ["Adresse", intersection.address || "—"],
          [
            "Coordonnées",
            `${Number(intersection.latitude).toFixed(5)}, ${Number(intersection.longitude).toFixed(5)}`,
          ],
          ["Mode actuel", intersection.controlMode],
          ["Contrôleur", primaryController?.code ?? "—"],
          ["Type contrôleur", primaryController?.controllerType ?? "—"],
          ["Firmware", primaryController?.firmwareVersion ?? "—"],
        ].map(([k, v], i, arr) => (
          <View key={k} style={i === arr.length - 1 ? s.tableRowLast : s.tableRow}>
            <Text style={[s.td, { flex: 1.3 }]}>{k}</Text>
            <Text style={[s.tdLast, { flex: 3 }]}>{v}</Text>
          </View>
        ))}
      </View>

      <Text style={s.h2}>2. INVENTAIRE ÉQUIPEMENT SIGNALISATION</Text>
      <View style={s.table}>
        <View style={s.tableHead}>
          <Text style={[s.th, { flex: 2 }]}>Désignation</Text>
          <Text style={[s.th, { flex: 1, borderRightWidth: 0 }]}>Quantité</Text>
        </View>
        {[
          ["Potences (R14 + R12)", plan.supports.filter((s) => s.kind === "potence").length],
          ["Poteaux (R11v / R14 + R12)", plan.supports.filter((s) => s.kind === "poteau").length],
          ["Potelets (R12 seul)", plan.supports.filter((s) => s.kind === "potelet").length],
          ["Têtes de feux R11v", plan.supports.flatMap((s) => s.signalHeads).filter((h) => h.type === "R11v").length],
          ["Têtes de feux R12", plan.supports.flatMap((s) => s.signalHeads).filter((h) => h.type === "R12").length],
          ["Têtes de feux R14dtd", plan.supports.flatMap((s) => s.signalHeads).filter((h) => h.type === "R14dtd").length],
          ["Boucles de détection", plan.loops.length],
          ["Chambres de tirage", plan.chambers.length],
          ["Contrôleur", 1],
        ].map(([k, v], i, arr) => (
          <View key={String(k)} style={i === arr.length - 1 ? s.tableRowLast : s.tableRow}>
            <Text style={[s.td, { flex: 2 }]}>{String(k)}</Text>
            <Text style={[s.tdMono, { flex: 1, borderRightWidth: 0 }]}>{String(v)}</Text>
          </View>
        ))}
      </View>

      <Text style={s.h2}>3. ENTRÉES CONTRÔLEUR</Text>
      <View style={s.table}>
        <View style={s.tableHead}>
          <Text style={[s.th, { flex: 0.6 }]}>N°</Text>
          <Text style={[s.th, { flex: 1 }]}>Adresse</Text>
          <Text style={[s.th, { flex: 1.2 }]}>Mnémo</Text>
          <Text style={[s.th, { flex: 2.2 }]}>Désignation</Text>
          <Text style={[s.th, { flex: 1, borderRightWidth: 0 }]}>Type</Text>
        </View>
        {plan.loops.map((loop, i, arr) => (
          <View key={loop.id} style={i === arr.length - 1 ? s.tableRowLast : s.tableRow}>
            <Text style={[s.tdMono, { flex: 0.6 }]}>{i + 10}</Text>
            <Text style={[s.tdMono, { flex: 1 }]}>50.{i + 10}</Text>
            <Text style={[s.tdMono, { flex: 1.2 }]}>CP{i + 1}</Text>
            <Text style={[s.td, { flex: 2.2 }]}>Capteur {i + 1} · {loop.label}</Text>
            <Text style={[s.tdLast, { flex: 1 }]}>Détecteur</Text>
          </View>
        ))}
      </View>

      {obs ? (
        <>
          <Text style={s.h2}>OBSERVATIONS</Text>
          <View style={s.accentBar} />
          <Text style={{ fontSize: 9, lineHeight: 1.45 }}>{obs}</Text>
        </>
      ) : null}

      <ChromeFooter pageNumber={2} totalPages={4} />
    </Page>
  );
}

function RegulationPhasesPage({
  plan,
  intersection,
  revision,
  storedConfig,
}: {
  plan: CivilPlan;
  intersection: EngineeringIntersectionRecord;
  revision: string;
  storedConfig?: IntersectionConfig;
}) {
  const phases = intersection.phases ?? [];
  const plans = intersection.timingPlans ?? [];
  const linearDescription =
    storedConfig?.regulationSettings?.linearDescription;
  const cycleSeconds = phases.reduce(
    (t, p) => t + p.minGreenSeconds + p.yellowSeconds + p.redClearanceSeconds,
    0,
  );
  return (
    <Page size="A4" style={s.page}>
      <ChromeHeader
        title={`Dossier de régulation — ${plan.intersectionName}`}
        subtitle="Phasage & plans de feux"
        revision={revision}
      />

      <Text style={s.h1}>4. PHASAGE</Text>
      <View style={s.accentBar} />
      <View style={s.table}>
        <View style={s.tableHead}>
          <Text style={[s.th, { flex: 0.7 }]}>Phase</Text>
          <Text style={[s.th, { flex: 2 }]}>Libellé</Text>
          <Text style={[s.th, { flex: 1 }]}>Min vert</Text>
          <Text style={[s.th, { flex: 1 }]}>Jaune</Text>
          <Text style={[s.th, { flex: 1.2 }]}>Rouge dégag.</Text>
          <Text style={[s.th, { flex: 1.4, borderRightWidth: 0 }]}>Groupes vert</Text>
        </View>
        {phases.length === 0 ? (
          <View style={s.tableRowLast}>
            <Text style={[s.tdLast, { flex: 7.3 }]}>
              Aucune phase configurée pour ce carrefour.
            </Text>
          </View>
        ) : (
          phases.map((phase, i, arr) => (
            <View key={phase.id} style={i === arr.length - 1 ? s.tableRowLast : s.tableRow}>
              <Text style={[s.tdMono, { flex: 0.7 }]}>{phase.sequenceNumber}</Text>
              <Text style={[s.td, { flex: 2 }]}>{phase.name}</Text>
              <Text style={[s.tdMono, { flex: 1 }]}>{phase.minGreenSeconds}s</Text>
              <Text style={[s.tdMono, { flex: 1 }]}>{phase.yellowSeconds}s</Text>
              <Text style={[s.tdMono, { flex: 1.2 }]}>{phase.redClearanceSeconds}s</Text>
              <Text style={[s.tdMono, { flex: 1.4, borderRightWidth: 0 }]}>
                {phase.movementGroup}
              </Text>
            </View>
          ))
        )}
      </View>

      <Text style={s.h2}>5. PLANS DE FEUX</Text>
      <View style={s.table}>
        <View style={s.tableHead}>
          <Text style={[s.th, { flex: 1 }]}>Code</Text>
          <Text style={[s.th, { flex: 2 }]}>Nom</Text>
          <Text style={[s.th, { flex: 1 }]}>Statut</Text>
          <Text style={[s.th, { flex: 1 }]}>Cycle</Text>
          <Text style={[s.th, { flex: 1, borderRightWidth: 0 }]}>Décalage</Text>
        </View>
        {plans.length === 0 ? (
          <View style={s.tableRowLast}>
            <Text style={[s.tdLast, { flex: 6 }]}>
              Aucun plan de feux configuré. Cycle calculé depuis les phases :{" "}
              {cycleSeconds}s.
            </Text>
          </View>
        ) : (
          plans.map((plan, i, arr) => (
            <View key={plan.id} style={i === arr.length - 1 ? s.tableRowLast : s.tableRow}>
              <Text style={[s.tdMono, { flex: 1 }]}>{plan.code}</Text>
              <Text style={[s.td, { flex: 2 }]}>{plan.name}</Text>
              <Text style={[s.td, { flex: 1 }]}>{plan.status}</Text>
              <Text style={[s.tdMono, { flex: 1 }]}>{plan.cycleLengthSeconds}s</Text>
              <Text style={[s.tdMono, { flex: 1, borderRightWidth: 0 }]}>
                {plan.offsetSeconds}s
              </Text>
            </View>
          ))
        )}
      </View>

      {linearDescription ? (
        <>
          <Text style={s.h2}>4.5 DESCRIPTION FONCTIONNEMENT LINÉAIRE</Text>
          <View style={s.accentBar} />
          <Text style={{ fontSize: 9, lineHeight: 1.45 }}>
            {linearDescription}
          </Text>
        </>
      ) : null}

      <Text style={s.h2}>6. OBSERVATIONS / HYPOTHÈSES</Text>
      <View style={s.accentBar} />
      <Text style={{ fontSize: 9, lineHeight: 1.45 }}>
        • Les temps de dégagement entre groupes de feux respectent la matrice
        d&apos;engagement définie au niveau du contrôleur.{"\n"}
        • Les commandes manuelles (police, mode emergency / flash / fail-safe)
        court-circuitent tout plan de feux et ne sont pas reprises dans le
        tableau de phasage ci-dessus.{"\n"}
        • Toute modification du phasage doit être accompagnée d&apos;une
        nouvelle version de ce dossier, avec révision d&apos;index.{"\n"}
        • Le cycle total affiché est calculé comme somme (min_vert + jaune +
        rouge_dégagement) par phase ; la microrégulation peut l&apos;étendre.
      </Text>

      <ChromeFooter pageNumber={4} totalPages={4} />
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Cablage content
// ─────────────────────────────────────────────────────────────────────────

function CablageCarnetPage({
  plan,
  intersection,
  revision,
}: {
  plan: CivilPlan;
  intersection: EngineeringIntersectionRecord;
  revision: string;
}) {
  const controllerCode = intersection.controllers[0]?.code ?? "CTRL";
  return (
    <Page size="A4" style={s.page}>
      <ChromeHeader
        title={`Dossier de câblage — ${plan.intersectionName}`}
        subtitle="Carnet de câblage · détail"
        revision={revision}
      />

      <Text style={s.h1}>3. CARNET DE CÂBLAGE — DÉTAIL</Text>
      <View style={s.accentBar} />
      <View style={s.table}>
        <View style={s.tableHead}>
          <Text style={[s.th, { flex: 0.8 }]}>Départ</Text>
          <Text style={[s.th, { flex: 0.8 }]}>Support</Text>
          <Text style={[s.th, { flex: 1.1 }]}>Type</Text>
          <Text style={[s.th, { flex: 1.2 }]}>Équipement</Text>
          <Text style={[s.th, { flex: 1.1 }]}>Câble</Text>
          <Text style={[s.th, { flex: 2 }]}>Repère</Text>
          <Text style={[s.th, { flex: 0.8 }]}>Long.</Text>
          <Text style={[s.th, { flex: 1.6, borderRightWidth: 0 }]}>
            Cheminement
          </Text>
        </View>
        {plan.cableRuns
          .filter((r) => r.kind === "signal")
          .map((run, i, arr) => {
            const support = plan.supports.find((s) => s.id === run.to);
            const hardware = support?.hardwareLabel ?? "—";
            const chambers = run.path
              .slice(1, -1) // strip cabinet + support
              .map((p) => chamberLabelFor(p, plan))
              .filter(Boolean)
              .join("-");
            return (
              <View
                key={run.id}
                style={i === arr.length - 1 ? s.tableRowLast : s.tableRow}
              >
                <Text style={[s.tdMono, { flex: 0.8 }]}>{controllerCode}</Text>
                <Text style={[s.tdMono, { flex: 0.8 }]}>{run.to}</Text>
                <Text style={[s.td, { flex: 1.1 }]}>
                  {support ? capitalise(support.kind) : "—"}
                </Text>
                <Text style={[s.td, { flex: 1.2 }]}>{hardware}</Text>
                <Text style={[s.tdMono, { flex: 1.1 }]}>{run.spec}</Text>
                <Text style={[s.tdMono, { flex: 2 }]}>{run.id}</Text>
                <Text style={[s.tdMono, { flex: 0.8 }]}>{run.length} m</Text>
                <Text style={[s.tdMono, { flex: 1.6, borderRightWidth: 0 }]}>
                  {chambers || "—"}
                </Text>
              </View>
            );
          })}
      </View>

      <Text style={s.h2}>CÂBLAGE LIAISON BOUCLES</Text>
      <View style={s.table}>
        <View style={s.tableHead}>
          <Text style={[s.th, { flex: 0.8 }]}>Ctrl</Text>
          <Text style={[s.th, { flex: 1.2 }]}>Boucle</Text>
          <Text style={[s.th, { flex: 1.6 }]}>Câble</Text>
          <Text style={[s.th, { flex: 2 }]}>Repère</Text>
          <Text style={[s.th, { flex: 0.8 }]}>Long.</Text>
          <Text style={[s.th, { flex: 2, borderRightWidth: 0 }]}>
            Cheminement
          </Text>
        </View>
        {plan.cableRuns
          .filter((r) => r.kind === "loop")
          .map((run, i, arr) => {
            const chambers = run.path
              .slice(1, -1)
              .map((p) => chamberLabelFor(p, plan))
              .filter(Boolean)
              .join("-");
            return (
              <View
                key={run.id}
                style={i === arr.length - 1 ? s.tableRowLast : s.tableRow}
              >
                <Text style={[s.tdMono, { flex: 0.8 }]}>{controllerCode}</Text>
                <Text style={[s.tdMono, { flex: 1.2 }]}>{run.to}</Text>
                <Text style={[s.tdMono, { flex: 1.6 }]}>{run.spec}</Text>
                <Text style={[s.tdMono, { flex: 2 }]}>{run.id}</Text>
                <Text style={[s.tdMono, { flex: 0.8 }]}>{run.length} m</Text>
                <Text style={[s.tdMono, { flex: 2, borderRightWidth: 0 }]}>
                  {chambers || "—"}
                </Text>
              </View>
            );
          })}
      </View>

      <Text style={s.note}>
        Longueurs intègrent : une boucle de 2 m par chambre, remontée / câblage
        de 6 m aux extrémités, marge de sécurité de 5 %. Valeurs arrondies au
        mètre supérieur.
      </Text>

      <ChromeFooter pageNumber={3} totalPages={4} />
    </Page>
  );
}

function CablageQuantitativePage({
  plan,
  revision,
  storedConfig,
}: {
  plan: CivilPlan;
  revision: string;
  storedConfig?: IntersectionConfig;
}) {
  const bySpec = new Map<string, number>();
  for (const run of plan.cableRuns) {
    bySpec.set(run.spec, (bySpec.get(run.spec) ?? 0) + run.length);
  }
  const overrides = storedConfig?.cablageSettings;
  if (overrides) {
    if (overrides.u1000r2v5gOverrideMetres != null)
      bySpec.set("5 G 1.5mm²", overrides.u1000r2v5gOverrideMetres);
    if (overrides.u1000r2v7gOverrideMetres != null)
      bySpec.set("7 G 1.5mm²", overrides.u1000r2v7gOverrideMetres);
    if (overrides.u1000r2v12gOverrideMetres != null)
      bySpec.set("12 G 1.5mm²", overrides.u1000r2v12gOverrideMetres);
    if (overrides.liycyOverrideMetres != null)
      bySpec.set("LIYCY 2 x 1.5 mm²", overrides.liycyOverrideMetres);
    if (overrides.fibreOverrideMetres != null)
      bySpec.set("Fibre optique", overrides.fibreOverrideMetres);
  }
  const rows = Array.from(bySpec.entries()).sort();
  return (
    <Page size="A4" style={s.page}>
      <ChromeHeader
        title={`Dossier de câblage — ${plan.intersectionName}`}
        subtitle="Quantitatif & inventaire chambres"
        revision={revision}
      />

      <Text style={s.h1}>4. QUANTITATIF CÂBLES</Text>
      <View style={s.accentBar} />
      <View style={[s.table, { maxWidth: 340 }]}>
        <View style={s.tableHead}>
          <Text style={[s.th, { flex: 2 }]}>Câble</Text>
          <Text style={[s.th, { flex: 1, borderRightWidth: 0 }]}>Longueur</Text>
        </View>
        {rows.map(([spec, length], i, arr) => (
          <View key={spec} style={i === arr.length - 1 ? s.tableRowLast : s.tableRow}>
            <Text style={[s.tdMono, { flex: 2 }]}>{spec}</Text>
            <Text style={[s.tdMono, { flex: 1, borderRightWidth: 0 }]}>
              {Math.ceil(length / 10) * 10} m
            </Text>
          </View>
        ))}
      </View>
      <Text style={s.note}>Valeurs arrondies à la dizaine de mètres supérieure.</Text>

      <Text style={s.h2}>5. CHAMBRES DE TIRAGE</Text>
      <View style={s.table}>
        <View style={s.tableHead}>
          <Text style={[s.th, { flex: 1 }]}>N°</Text>
          <Text style={[s.th, { flex: 2 }]}>Libellé</Text>
          <Text style={[s.th, { flex: 2 }]}>Coordonnées plan (m)</Text>
          <Text style={[s.th, { flex: 2, borderRightWidth: 0 }]}>
            Utilisation
          </Text>
        </View>
        {plan.chambers.map((c, i, arr) => {
          const uses = plan.cableRuns.filter((run) =>
            run.path.some(
              (p) => Math.abs(p.x - c.position.x) < 0.3 && Math.abs(p.y - c.position.y) < 0.3,
            ),
          ).length;
          return (
            <View key={c.id} style={i === arr.length - 1 ? s.tableRowLast : s.tableRow}>
              <Text style={[s.tdMono, { flex: 1 }]}>{c.label}</Text>
              <Text style={[s.td, { flex: 2 }]}>Chambre {c.label}</Text>
              <Text style={[s.tdMono, { flex: 2 }]}>
                ({c.position.x.toFixed(1)}, {c.position.y.toFixed(1)})
              </Text>
              <Text style={[s.tdMono, { flex: 2, borderRightWidth: 0 }]}>
                {uses} câble{uses > 1 ? "s" : ""}
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={s.h2}>6. I/O CONTRÔLEUR</Text>
      <View style={s.table}>
        <View style={s.tableHead}>
          <Text style={[s.th, { flex: 1 }]}>Bornier</Text>
          <Text style={[s.th, { flex: 1.5 }]}>Mnémo</Text>
          <Text style={[s.th, { flex: 2 }]}>Référence câble</Text>
          <Text style={[s.th, { flex: 1.5, borderRightWidth: 0 }]}>
            Destination
          </Text>
        </View>
        {plan.cableRuns.map((run, i, arr) => (
          <View key={run.id} style={i === arr.length - 1 ? s.tableRowLast : s.tableRow}>
            <Text style={[s.tdMono, { flex: 1 }]}>
              {run.kind === "signal" ? `LF-${run.to}` : run.to}
            </Text>
            <Text style={[s.tdMono, { flex: 1.5 }]}>
              {run.kind === "signal" ? `CTRL-${run.to}` : `DET-${run.to}`}
            </Text>
            <Text style={[s.tdMono, { flex: 2 }]}>{run.id}</Text>
            <Text style={[s.tdMono, { flex: 1.5, borderRightWidth: 0 }]}>
              {run.to}
            </Text>
          </View>
        ))}
      </View>

      <ChromeFooter pageNumber={4} totalPages={4} />
    </Page>
  );
}

function chamberLabelFor(p: PlanPoint, plan: CivilPlan): string {
  const match = plan.chambers.find(
    (c) => Math.abs(c.position.x - p.x) < 0.3 && Math.abs(c.position.y - p.y) < 0.3,
  );
  return match?.label ?? "";
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// ─────────────────────────────────────────────────────────────────────────
// Civil plan SVG — same geometry as the on-screen renderer but using
// @react-pdf Svg primitives so the PDF embeds pure vector art.
// ─────────────────────────────────────────────────────────────────────────

const PDF_COLORS = {
  pavement: "#eae6d7",
  asphalt: "#d7d1bd",
  curb: "#8a6a1f",
  laneMark: "#2a3440",
  crosswalk: "#2a3440",
  stopLine: "#1b2322",
  arrow: "#1b2322",
  label: "#0f1a12",
  labelSoft: "#4a5660",
  supportPotence: "#c2410c",
  supportPoteau: "#1d4ed8",
  supportPotelet: "#047857",
  supportRing: "#ffffff",
  loop: "#6d28d9",
  chamber: "#b45309",
  chamberFill: "#fffbeb",
  cable: "#7c3aed",
  cabinet: "#fff4db",
  cabinetStroke: "#b45309",
  gridMinor: "#edece2",
  gridMajor: "#d9d6c6",
};

function CivilPlanSvg({
  plan,
  layers,
}: {
  plan: CivilPlan;
  layers: Record<CivilPlanLayer, boolean>;
}) {
  const padding = 4;
  const w = plan.bounds.maxX - plan.bounds.minX + padding * 2;
  const h = plan.bounds.maxY - plan.bounds.minY + padding * 2;
  const vbX = plan.bounds.minX - padding;
  const vbY = -(plan.bounds.maxY + padding);
  const viewBox = `${vbX} ${vbY} ${w} ${h}`;
  return (
    <Svg viewBox={viewBox} style={{ width: "100%", height: "100%" }}>
      <G transform="scale(1 -1)">
        {layers.roads ? <PdfGrid bounds={plan.bounds} /> : null}
        {plan.baseLayers && plan.baseLayers.length > 0 ? (
          <PdfBaseLayers features={plan.baseLayers} />
        ) : null}
        {layers.roads ? <PdfRoads plan={plan} /> : null}
        {layers.lanes ? <PdfLanes plan={plan} /> : null}
        {layers.crosswalks ? <PdfCrosswalks plan={plan} /> : null}
        {layers.islands && plan.refugeIslands && plan.refugeIslands.length > 0 ? (
          <PdfRefugeIslands
            islands={plan.refugeIslands}
            showLabels={layers.labels}
          />
        ) : null}
        {layers.movements ? <PdfMovementArrows plan={plan} /> : null}
        {layers.cables ? <PdfCables plan={plan} /> : null}
        {layers.loops ? <PdfLoops plan={plan} showLabels={layers.labels} /> : null}
        {layers.chambers ? <PdfChambers plan={plan} showLabels={layers.labels} /> : null}
        {layers.supports ? <PdfSupports plan={plan} showLabels={layers.labels} /> : null}
        <PdfCabinet plan={plan} showLabel={layers.labels} />
        {layers.labels ? <PdfApproachLabels plan={plan} /> : null}
      </G>
      <PdfNorthArrow />
      <PdfScaleBar />
    </Svg>
  );
}

function PdfGrid({ bounds }: { bounds: PlanBounds }) {
  const lines: React.ReactElement[] = [];
  const minX = Math.floor(bounds.minX / 5) * 5 - 5;
  const maxX = Math.ceil(bounds.maxX / 5) * 5 + 5;
  const minY = Math.floor(bounds.minY / 5) * 5 - 5;
  const maxY = Math.ceil(bounds.maxY / 5) * 5 + 5;
  for (let x = minX; x <= maxX; x += 1) {
    const major = x % 5 === 0;
    lines.push(
      <Line
        key={`gx${x}`}
        x1={x}
        x2={x}
        y1={minY}
        y2={maxY}
        stroke={major ? PDF_COLORS.gridMajor : PDF_COLORS.gridMinor}
        strokeWidth={major ? 0.08 : 0.04}
      />,
    );
  }
  for (let y = minY; y <= maxY; y += 1) {
    const major = y % 5 === 0;
    lines.push(
      <Line
        key={`gy${y}`}
        x1={minX}
        x2={maxX}
        y1={y}
        y2={y}
        stroke={major ? PDF_COLORS.gridMajor : PDF_COLORS.gridMinor}
        strokeWidth={major ? 0.08 : 0.04}
      />,
    );
  }
  return <G>{lines}</G>;
}

function PdfRoads({ plan }: { plan: CivilPlan }) {
  const halfW = plan.arms[0]?.halfWidth ?? 7.5;
  const pad = halfW * 1.2;
  const nodePoints = `${-pad},${-pad} ${pad},${-pad} ${pad},${pad} ${-pad},${pad}`;
  return (
    <G>
      <Polygon points={nodePoints} fill={PDF_COLORS.asphalt} />
      {plan.arms.map((arm) => {
        const { from, to } = arm.axis;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy);
        const ux = dx / len;
        const uy = dy / len;
        const nx = -uy;
        const ny = ux;
        const startX = from.x - ux * arm.halfWidth * 0.4;
        const startY = from.y - uy * arm.halfWidth * 0.4;
        const p1 = `${startX + nx * arm.halfWidth},${startY + ny * arm.halfWidth}`;
        const p2 = `${to.x + nx * arm.halfWidth},${to.y + ny * arm.halfWidth}`;
        const p3 = `${to.x - nx * arm.halfWidth},${to.y - ny * arm.halfWidth}`;
        const p4 = `${startX - nx * arm.halfWidth},${startY - ny * arm.halfWidth}`;
        return (
          <G key={`arm-${arm.id}`}>
            <Polygon points={`${p1} ${p2} ${p3} ${p4}`} fill={PDF_COLORS.asphalt} />
            <Line
              x1={startX + nx * arm.halfWidth}
              y1={startY + ny * arm.halfWidth}
              x2={to.x + nx * arm.halfWidth}
              y2={to.y + ny * arm.halfWidth}
              stroke={PDF_COLORS.curb}
              strokeWidth={0.25}
            />
            <Line
              x1={startX - nx * arm.halfWidth}
              y1={startY - ny * arm.halfWidth}
              x2={to.x - nx * arm.halfWidth}
              y2={to.y - ny * arm.halfWidth}
              stroke={PDF_COLORS.curb}
              strokeWidth={0.25}
            />
          </G>
        );
      })}
    </G>
  );
}

function PdfLanes({ plan }: { plan: CivilPlan }) {
  return (
    <G>
      {plan.arms.map((arm) => {
        const { from, to } = arm.axis;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy);
        const nx = -dy / len;
        const ny = dx / len;
        return (
          <G key={`lanes-${arm.id}`}>
            <Line
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={PDF_COLORS.laneMark}
              strokeWidth={0.2}
              strokeDasharray="1.8 1.2"
              opacity={0.45}
            />
            {arm.lanes.map((lane) => (
              <Line
                key={lane.id}
                x1={from.x + nx * lane.offset}
                y1={from.y + ny * lane.offset}
                x2={to.x + nx * lane.offset}
                y2={to.y + ny * lane.offset}
                stroke={PDF_COLORS.laneMark}
                strokeWidth={0.14}
                strokeDasharray="1.2 1.2"
                opacity={0.3}
              />
            ))}
          </G>
        );
      })}
    </G>
  );
}

function PdfCrosswalks({ plan }: { plan: CivilPlan }) {
  return (
    <G>
      {plan.crosswalks.map((cw) => {
        const stripeWidth = 0.45;
        const stripeGap = 0.45;
        const step = stripeWidth + stripeGap;
        const count = Math.floor(cw.length / step);
        const start = -(count * step) / 2;
        const cos = Math.cos(cw.angle);
        const sin = Math.sin(cw.angle);
        const cosPerp = Math.cos(cw.angle + Math.PI / 2);
        const sinPerp = Math.sin(cw.angle + Math.PI / 2);
        const halfW = cw.width / 2;
        return (
          <G key={cw.id}>
            {Array.from({ length: count }).map((_, i) => {
              const offset = start + i * step + stripeWidth / 2;
              const cx = cw.centre.x + cos * offset;
              const cy = cw.centre.y + sin * offset;
              return (
                <Line
                  key={`${cw.id}-s${i}`}
                  x1={cx + cosPerp * halfW}
                  y1={cy + sinPerp * halfW}
                  x2={cx - cosPerp * halfW}
                  y2={cy - sinPerp * halfW}
                  stroke={PDF_COLORS.crosswalk}
                  strokeWidth={stripeWidth}
                  opacity={0.9}
                />
              );
            })}
          </G>
        );
      })}
      {plan.stopLines.map((sl) => (
        <Line
          key={sl.id}
          x1={sl.centre.x + Math.cos(sl.angle) * (sl.length / 2)}
          y1={sl.centre.y + Math.sin(sl.angle) * (sl.length / 2)}
          x2={sl.centre.x - Math.cos(sl.angle) * (sl.length / 2)}
          y2={sl.centre.y - Math.sin(sl.angle) * (sl.length / 2)}
          stroke={PDF_COLORS.stopLine}
          strokeWidth={0.45}
        />
      ))}
    </G>
  );
}

function PdfCables({ plan }: { plan: CivilPlan }) {
  return (
    <G>
      {plan.cableRuns.map((run) => (
        <Polyline
          key={run.id}
          points={run.path.map((p) => `${p.x},${p.y}`).join(" ")}
          stroke={PDF_COLORS.cable}
          strokeOpacity={0.45}
          strokeWidth={0.14}
          strokeDasharray={run.kind === "loop" ? "0.6 0.4" : "1.2 0.8"}
          fill="none"
        />
      ))}
    </G>
  );
}

function PdfLoops({
  plan,
  showLabels,
}: {
  plan: CivilPlan;
  showLabels: boolean;
}) {
  return (
    <G>
      {plan.loops.map((loop) => (
        <G key={loop.id}>
          <Rect
            x={loop.centre.x - loop.width / 2}
            y={loop.centre.y - loop.length / 2}
            width={loop.width}
            height={loop.length}
            fill="none"
            stroke={PDF_COLORS.loop}
            strokeWidth={0.2}
          />
          {showLabels ? (
            <PdfFlippedText
              x={loop.centre.x}
              y={loop.centre.y - loop.length / 2 - 1.2}
              text={loop.label}
              fontSize={0.95}
              color={PDF_COLORS.loop}
            />
          ) : null}
        </G>
      ))}
    </G>
  );
}

function PdfChambers({
  plan,
  showLabels,
}: {
  plan: CivilPlan;
  showLabels: boolean;
}) {
  return (
    <G>
      {plan.chambers.map((c) => {
        const size = c.size ?? 1;
        return (
          <G key={c.id}>
            <Rect
              x={c.position.x - size / 2}
              y={c.position.y - size / 2}
              width={size}
              height={size}
              fill={PDF_COLORS.chamberFill}
              stroke={PDF_COLORS.chamber}
              strokeWidth={0.22}
            />
            {showLabels ? (
              <PdfFlippedText
                x={c.position.x}
                y={c.position.y + 0.15}
                text={c.label}
                fontSize={0.9}
                color={PDF_COLORS.chamber}
                bold
              />
            ) : null}
          </G>
        );
      })}
    </G>
  );
}

function PdfSupports({
  plan,
  showLabels,
}: {
  plan: CivilPlan;
  showLabels: boolean;
}) {
  return (
    <G>
      {plan.supports.map((support) => {
        const color =
          support.kind === "potence"
            ? PDF_COLORS.supportPotence
            : support.kind === "poteau"
              ? PDF_COLORS.supportPoteau
              : PDF_COLORS.supportPotelet;
        return (
          <G key={support.id}>
            <Circle
              cx={support.position.x}
              cy={support.position.y}
              r={0.75}
              fill={color}
              stroke={PDF_COLORS.supportRing}
              strokeWidth={0.18}
            />
            {showLabels ? (
              <PdfFlippedText
                x={support.position.x}
                y={support.position.y + 1.4}
                text={support.id}
                fontSize={1.1}
                color={PDF_COLORS.label}
                bold
              />
            ) : null}
            {showLabels && support.signalHeads.length > 0 ? (
              <PdfFlippedText
                x={support.position.x}
                y={support.position.y + 2.7}
                text={uniqueSignalGroups(support.signalHeads).join(" · ")}
                fontSize={0.78}
                color={PDF_COLORS.labelSoft}
              />
            ) : null}
          </G>
        );
      })}
    </G>
  );
}

// De-duped list of signalGroupIds carried by a support, preserving
// first-seen order so the rendered label stays stable.
function uniqueSignalGroups(heads: SignalHead[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of heads) {
    if (!h.signalGroupId || seen.has(h.signalGroupId)) continue;
    seen.add(h.signalGroupId);
    out.push(h.signalGroupId);
  }
  return out;
}

function PdfCabinet({
  plan,
  showLabel,
}: {
  plan: CivilPlan;
  showLabel: boolean;
}) {
  const c = plan.cabinet;
  const half = c.footprint / 2;
  return (
    <G>
      <Rect
        x={c.position.x - half}
        y={c.position.y - half}
        width={c.footprint}
        height={c.footprint}
        fill={PDF_COLORS.cabinet}
        stroke={PDF_COLORS.cabinetStroke}
        strokeWidth={0.3}
      />
      {showLabel ? (
        <PdfFlippedText
          x={c.position.x}
          y={c.position.y + c.footprint * 0.85}
          text={c.label}
          fontSize={1.2}
          color={PDF_COLORS.cabinetStroke}
          bold
        />
      ) : null}
    </G>
  );
}

function PdfApproachLabels({ plan }: { plan: CivilPlan }) {
  return (
    <G>
      {plan.arms.map((arm) => {
        const { from, to } = arm.axis;
        const t = 0.75;
        const mx = from.x + (to.x - from.x) * t;
        const my = from.y + (to.y - from.y) * t;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy);
        const nx = -dy / len;
        const ny = dx / len;
        const lx = mx + nx * (arm.halfWidth + 2.4);
        const ly = my + ny * (arm.halfWidth + 2.4);
        return (
          <PdfFlippedText
            key={`label-${arm.id}`}
            x={lx}
            y={ly}
            text={arm.streetName}
            fontSize={1.4}
            color={PDF_COLORS.labelSoft}
            bold
          />
        );
      })}
    </G>
  );
}

/**
 * Text inside the flipped plan transform — we apply a local
 * scale(1,-1) so the glyphs come out right-side-up. Emulates the
 * on-screen PlanLabel helper but with @react-pdf Svg primitives.
 */
function PdfFlippedText({
  x,
  y,
  text,
  fontSize,
  color,
  bold = false,
}: {
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  bold?: boolean;
}) {
  return (
    <G transform={`translate(${x} ${y}) scale(1 -1)`}>
      <PdfSvgText
        fontSize={fontSize}
        color={color}
        bold={bold}
        anchor="middle"
        text={text}
      />
    </G>
  );
}

/** Shim for the <text> element inside @react-pdf Svg. */
function PdfSvgText({
  fontSize,
  color,
  bold,
  anchor,
  text,
}: {
  fontSize: number;
  color: string;
  bold: boolean;
  anchor: "start" | "middle" | "end";
  text: string;
}) {
  // @react-pdf renderer exposes <Text> but inside <Svg> we need the
  // text element via a <Path> fallback only in older versions. In
  // current versions <Text> nested in <Svg> works if it carries the
  // SVG text presentation attributes.
  // We use the underlying SvgText via typed cast.
  // @react-pdf only ships the standard 14 PostScript fonts built-in
  // and looks them up by family name, not by (family, fontWeight)
  // tuple — so "Helvetica" + fontWeight 700 fails with
  // "Could not resolve font for Helvetica, fontWeight 700".  Use the
  // explicit PostScript family names instead.
  const Raw = RawSvgText as unknown as React.ComponentType<{
    x: number;
    y: number;
    fontSize: number;
    fill: string;
    fontFamily: string;
    textAnchor: string;
    children: React.ReactNode;
  }>;
  return (
    <Raw
      x={0}
      y={0}
      fontSize={fontSize}
      fill={color}
      fontFamily={bold ? "Helvetica-Bold" : "Helvetica"}
      textAnchor={anchor}
    >
      {text}
    </Raw>
  );
}

// Expose the react-pdf SVG <Text> via the module's public API. The
// library re-exports it under the name Text from the @react-pdf/renderer
// barrel, but when nested inside <Svg> it routes to the SVG text
// primitive. Alias it here to avoid name clash with the block-flow Text.
import { Text as RawSvgText } from "@react-pdf/renderer";

function PdfNorthArrow() {
  return (
    <G transform="translate(22 -22)">
      <Circle r={2.4} fill="none" stroke="#1b2322" strokeWidth={0.2} />
      <Polygon points="0,-2.2 0.7,0.4 0,-0.4 -0.7,0.4" fill="#1b2322" />
      <G transform="translate(0 2.7) scale(1 -1)">
        <PdfSvgText
          fontSize={1.2}
          color="#1b2322"
          bold
          anchor="middle"
          text="N"
        />
      </G>
    </G>
  );
}

function PdfScaleBar() {
  const length = 10;
  return (
    <G transform="translate(-24 22)">
      <Line x1={0} y1={0} x2={length} y2={0} stroke="#1b2322" strokeWidth={0.3} />
      <Line x1={0} y1={-0.6} x2={0} y2={0.6} stroke="#1b2322" strokeWidth={0.3} />
      <Line
        x1={length / 2}
        y1={-0.4}
        x2={length / 2}
        y2={0.4}
        stroke="#1b2322"
        strokeWidth={0.3}
      />
      <Line x1={length} y1={-0.6} x2={length} y2={0.6} stroke="#1b2322" strokeWidth={0.3} />
      <G transform="translate(0 1.6) scale(1 -1)">
        <PdfSvgText fontSize={1.1} color="#1b2322" bold anchor="start" text="0" />
      </G>
      <G transform={`translate(${length / 2} 1.6) scale(1 -1)`}>
        <PdfSvgText fontSize={1.1} color="#1b2322" bold={false} anchor="middle" text="5 m" />
      </G>
      <G transform={`translate(${length} 1.6) scale(1 -1)`}>
        <PdfSvgText fontSize={1.1} color="#1b2322" bold anchor="end" text="10 m" />
      </G>
    </G>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Base layers — OSM topographic / vector geometry imported via the
// "Import OSM" action.  Drawn under the engineering layers so the
// synthetic arms render over the real carriageway geometry.  Mirrors
// the SVG renderer's BaseLayersGroup in feel: carriageway features
// (with explicit width) get a red kerb stroke + asphalt fill stroke;
// other features draw as soft polylines/polygons.
// ─────────────────────────────────────────────────────────────────────────

const PDF_BASE_PALETTE = {
  carriagewayKerb: "#8a3a1f",
  carriagewayAsphalt: "#d7d1bd",
  basePlanStroke: "#7a8881",
  basePlanStrokeSoft: "#9aa49d",
  basePlanFill: "#f3f1ea",
  islandStrokeAlt: "#1f3d6e",
  islandFillAlt: "#bcd2e8",
};

const BASE_LAYER_Z: Record<BaseLayerKind, number> = {
  contours: 0,
  parcels: 1,
  buildings: 2,
  roads: 3,
  medians: 4,
  lane_edges: 5,
  crosswalks: 6,
};

function PdfBaseLayers({ features }: { features: BaseLayerFeature[] }) {
  const carriageways = features.filter(
    (f) => f.kind === "roads" && typeof f.width === "number" && (f.width ?? 0) > 0,
  );
  const carriagewaySet = new Set(carriageways);
  const others = features.filter((f) => !carriagewaySet.has(f));
  const sortedOthers = [...others].sort(
    (a, b) => BASE_LAYER_Z[a.kind] - BASE_LAYER_Z[b.kind],
  );
  return (
    <G>
      {/* Carriageways: kerb first (wider, red), asphalt on top. */}
      <G>
        {carriageways.map((f) => (
          <PdfCarriageway
            key={`kerb-${f.id}`}
            feature={f}
            stroke={PDF_BASE_PALETTE.carriagewayKerb}
            extraWidth={0.6}
          />
        ))}
      </G>
      <G>
        {carriageways.map((f) => (
          <PdfCarriageway
            key={`asph-${f.id}`}
            feature={f}
            stroke={PDF_BASE_PALETTE.carriagewayAsphalt}
            extraWidth={0}
          />
        ))}
      </G>
      {/* Other base layers — softer styling. */}
      <G>
        {sortedOthers.map((feature) => (
          <PdfBaseFeature key={feature.id} feature={feature} />
        ))}
      </G>
    </G>
  );
}

function PdfCarriageway({
  feature,
  stroke,
  extraWidth,
}: {
  feature: BaseLayerFeature;
  stroke: string;
  extraWidth: number;
}) {
  const w = (feature.width ?? 6) + extraWidth;
  const pts = feature.path.map((p) => `${p.x},${p.y}`).join(" ");
  if (feature.closed) {
    return (
      <Polygon
        points={pts}
        fill="none"
        stroke={stroke}
        strokeWidth={w}
      />
    );
  }
  return (
    <Polyline
      points={pts}
      fill="none"
      stroke={stroke}
      strokeWidth={w}
    />
  );
}

function PdfBaseFeature({ feature }: { feature: BaseLayerFeature }) {
  if (feature.path.length < 2) return null;
  const points = feature.path.map((p) => `${p.x},${p.y}`).join(" ");
  const isRoundaboutRing = feature.kind === "roads" && feature.closed;
  const isRefugeIsland = feature.kind === "medians" && feature.closed;
  const stroke = isRefugeIsland
    ? PDF_BASE_PALETTE.islandStrokeAlt
    : isRoundaboutRing
      ? PDF_BASE_PALETTE.carriagewayKerb
      : feature.kind === "roads" || feature.kind === "lane_edges"
        ? PDF_BASE_PALETTE.basePlanStroke
        : PDF_BASE_PALETTE.basePlanStrokeSoft;
  const strokeWidth = isRefugeIsland
    ? 0.32
    : isRoundaboutRing
      ? 0.5
      : feature.kind === "roads"
        ? 0.35
        : feature.kind === "lane_edges"
          ? 0.22
          : feature.kind === "crosswalks"
            ? 0.25
            : 0.18;
  const fill = isRefugeIsland
    ? PDF_BASE_PALETTE.islandFillAlt
    : feature.closed
      ? PDF_BASE_PALETTE.basePlanFill
      : "none";
  const dashArray =
    feature.kind === "contours"
      ? "0.6 0.4"
      : feature.kind === "parcels"
        ? "0.4 0.3"
        : undefined;
  if (feature.closed) {
    return (
      <Polygon
        points={points}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={dashArray}
      />
    );
  }
  return (
    <Polyline
      points={points}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeDasharray={dashArray}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Refuge islands — pill / oval / diamond shelter shapes.  In the SVG
// renderer these carry a zebra-hatch <pattern>; @react-pdf/renderer
// does not implement <Pattern> so we substitute a solid tinted fill +
// strong stroke that reads as a refuge at print scale.
// ─────────────────────────────────────────────────────────────────────────

function PdfRefugeIslands({
  islands,
  showLabels,
}: {
  islands: RefugeIsland[];
  showLabels: boolean;
}) {
  return (
    <G>
      {islands.map((island) => (
        <PdfRefugeIslandShape
          key={island.id}
          island={island}
          showLabel={showLabels}
        />
      ))}
    </G>
  );
}

function PdfRefugeIslandShape({
  island,
  showLabel,
}: {
  island: RefugeIsland;
  showLabel: boolean;
}) {
  const angleDeg = (island.angle * 180) / Math.PI;
  const w = island.length;
  const h = island.width;
  const r = Math.min(w, h) / 2;
  const fill = PDF_BASE_PALETTE.islandFillAlt;
  const stroke = PDF_BASE_PALETTE.islandStrokeAlt;
  let shape: React.ReactElement;
  if (island.shape === "oval") {
    shape = (
      <Ellipse
        cx={0}
        cy={0}
        rx={w / 2}
        ry={h / 2}
        fill={fill}
        stroke={stroke}
        strokeWidth={0.3}
      />
    );
  } else if (island.shape === "diamond") {
    shape = (
      <Polygon
        points={`0,${h / 2} ${w / 2},0 0,${-h / 2} ${-w / 2},0`}
        fill={fill}
        stroke={stroke}
        strokeWidth={0.3}
      />
    );
  } else {
    shape = (
      <Rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        rx={r}
        ry={r}
        fill={fill}
        stroke={stroke}
        strokeWidth={0.3}
      />
    );
  }
  return (
    <G transform={`translate(${island.centre.x} ${island.centre.y}) rotate(${angleDeg})`}>
      {shape}
      {showLabel ? (
        <G transform={`rotate(${-angleDeg}) scale(1 -1)`}>
          <PdfSvgText
            text={island.label}
            fontSize={Math.min(2.2, h * 0.55)}
            color={stroke}
            bold
            anchor="middle"
          />
        </G>
      ) : null}
    </G>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Movement arrows — curved per-inbound-lane Bezier paths.  Mirrors
// MovementArrowsLayer from the SVG renderer (helpers duplicated here so
// the PDF file remains self-contained).
// ─────────────────────────────────────────────────────────────────────────

interface PdfArmGeom {
  arm: RoadArm;
  outwardX: number;
  outwardY: number;
  bearing: number;
}

function pdfArmGeom(arm: RoadArm): PdfArmGeom {
  const { from, to } = arm.axis;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    arm,
    outwardX: dx / len,
    outwardY: dy / len,
    bearing: Math.atan2(dy / len, dx / len),
  };
}

function pdfPickReceiver(
  arms: PdfArmGeom[],
  from: PdfArmGeom,
  movement: "through" | "left" | "right",
): PdfArmGeom | null {
  const rotation =
    movement === "through" ? 0 : movement === "left" ? Math.PI / 2 : -Math.PI / 2;
  const wanted = ((from.bearing + Math.PI + rotation) + 8 * Math.PI) % (2 * Math.PI);
  let best: { arm: PdfArmGeom; diff: number } | null = null;
  for (const a of arms) {
    if (a.arm.id === from.arm.id) continue;
    const norm = ((a.bearing % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    let d = Math.abs(norm - wanted);
    if (d > Math.PI) d = 2 * Math.PI - d;
    if (best === null || d < best.diff) best = { arm: a, diff: d };
  }
  return best?.arm ?? null;
}

function pdfMovementsFor(kind: Lane["kind"]): Array<"through" | "left" | "right"> {
  switch (kind) {
    case "through":
      return ["through"];
    case "left":
      return ["left"];
    case "right":
      return ["right"];
    case "through-left":
      return ["through", "left"];
    case "through-right":
      return ["through", "right"];
  }
}

function pdfCurvedMovementPath(
  fromGeom: PdfArmGeom,
  lane: Lane,
  toGeom: PdfArmGeom,
  movement: "through" | "left" | "right",
): { d: string; tip: PlanPoint; tipDir: PlanPoint } {
  const inboundForwardX = -fromGeom.outwardX;
  const inboundForwardY = -fromGeom.outwardY;
  const fpx = -fromGeom.outwardY;
  const fpy = fromGeom.outwardX;
  const startDist = 9;
  const startX = fromGeom.outwardX * startDist + fpx * lane.offset;
  const startY = fromGeom.outwardY * startDist + fpy * lane.offset;
  const tpx = -toGeom.outwardY;
  const tpy = toGeom.outwardX;
  const endLaneOffset =
    movement === "through"
      ? -(toGeom.arm.medianWidth ?? 0) / 2 - 1.5
      : -(toGeom.arm.medianWidth ?? 0) / 2 - 4.5;
  const endDist = 9;
  const endX = toGeom.outwardX * endDist + tpx * endLaneOffset;
  const endY = toGeom.outwardY * endDist + tpy * endLaneOffset;
  const dist = Math.hypot(endX - startX, endY - startY);
  const handle =
    movement === "through" ? dist * 0.35 : Math.max(6, dist * 0.55);
  const c1x = startX + inboundForwardX * handle;
  const c1y = startY + inboundForwardY * handle;
  const c2x = endX - toGeom.outwardX * handle;
  const c2y = endY - toGeom.outwardY * handle;
  const d = `M ${startX.toFixed(2)} ${startY.toFixed(2)} C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${endX.toFixed(2)} ${endY.toFixed(2)}`;
  return {
    d,
    tip: { x: endX, y: endY },
    tipDir: { x: toGeom.outwardX, y: toGeom.outwardY },
  };
}

function PdfMovementArrows({ plan }: { plan: CivilPlan }) {
  const geoms = plan.arms.map(pdfArmGeom);
  const arrows: React.ReactElement[] = [];
  const colour = "#1d4ed8";
  for (const fromGeom of geoms) {
    for (const lane of fromGeom.arm.lanes.filter((l) => l.direction === "in")) {
      for (const m of pdfMovementsFor(lane.kind)) {
        const receiver = pdfPickReceiver(geoms, fromGeom, m);
        if (!receiver) continue;
        const path = pdfCurvedMovementPath(fromGeom, lane, receiver, m);
        const head = 1.2;
        const perpX = -path.tipDir.y;
        const perpY = path.tipDir.x;
        const baseLeftX = path.tip.x - path.tipDir.x * head + perpX * head * 0.55;
        const baseLeftY = path.tip.y - path.tipDir.y * head + perpY * head * 0.55;
        const baseRightX = path.tip.x - path.tipDir.x * head - perpX * head * 0.55;
        const baseRightY = path.tip.y - path.tipDir.y * head - perpY * head * 0.55;
        arrows.push(
          <G key={`mv-${lane.id}-${m}`} opacity={0.9}>
            <Path
              d={path.d}
              stroke={colour}
              strokeWidth={0.32}
              fill="none"
            />
            <Polygon
              points={`${path.tip.x},${path.tip.y} ${baseLeftX},${baseLeftY} ${baseRightX},${baseRightY}`}
              fill={colour}
            />
          </G>,
        );
      }
    }
  }
  return <G>{arrows}</G>;
}
