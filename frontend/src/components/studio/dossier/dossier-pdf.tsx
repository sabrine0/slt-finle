"use client";

/**
 * Régulation / câblage dossier, rendered from a Studio IntersectionConfig.
 *
 * Layout deliberately mirrors the GroupéRyX template the operator gave
 * us: green accents, section numbering, A4 portrait, table grid.  No
 * pixel-perfect logo embed — text stand-ins for "GroupéRyX Maroc" and
 * "Tomorrow Systems" sit in the footer strip; drop real PNGs into
 * `public/dossier/` and swap the placeholders when you have them.
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

import type { IntersectionConfig } from "@/components/studio/state/types";

const GREEN = "#2e8b4c";
const GREEN_DARK = "#1b5e2c";
const GREEN_TINT = "#d8ecd8";
const INK = "#0f1a12";
const INK_MUTED = "#4a5660";
const BORDER = "#333333";
const BORDER_LIGHT = "#9ca3a0";

const s = StyleSheet.create({
  page: {
    padding: "18mm 16mm 20mm 16mm",
    fontSize: 9,
    fontFamily: "Helvetica",
    color: INK,
  },
  pageHeader: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    paddingBottom: 4,
    marginBottom: 10,
    fontSize: 8,
  },
  pageHeaderLeft: {
    flex: 1,
  },
  pageHeaderRight: {
    width: 110,
    borderLeftWidth: 0.5,
    borderLeftColor: BORDER,
    paddingLeft: 6,
    fontWeight: 700,
    fontFamily: "Helvetica-Bold",
  },
  pageFooter: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 12,
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
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: GREEN_DARK,
    marginTop: 6,
    marginBottom: 6,
  },
  h2: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: GREEN_DARK,
    marginTop: 10,
    marginBottom: 4,
  },
  h3: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: GREEN,
    marginTop: 6,
    marginBottom: 3,
  },
  accentBar: {
    width: 32,
    height: 2,
    backgroundColor: GREEN,
    marginBottom: 6,
  },

  /* Cover */
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
    marginTop: 40,
  },
  coverHeadText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 14,
    textAlign: "center",
  },
  coverTitle: {
    marginTop: 60,
    textAlign: "center",
    fontSize: 18,
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
    marginTop: 40,
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
    padding: 5,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  revisionCell: { padding: 5, fontSize: 8 },
  coverFooter: {
    position: "absolute",
    bottom: 30,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  brandMark: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: GREEN_DARK,
    letterSpacing: 1,
    marginHorizontal: 12,
  },
  brandMarkSub: {
    fontSize: 7,
    color: INK_MUTED,
    textAlign: "center",
  },

  /* Tables */
  table: {
    borderWidth: 0.5,
    borderColor: BORDER,
    marginTop: 6,
    marginBottom: 8,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER_LIGHT,
  },
  tableRowLast: {
    flexDirection: "row",
  },
  tableHead: {
    backgroundColor: GREEN_TINT,
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },
  th: {
    padding: 4,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: GREEN_DARK,
    borderRightWidth: 0.5,
    borderRightColor: BORDER,
  },
  td: {
    padding: 4,
    fontSize: 8,
    color: INK,
    borderRightWidth: 0.5,
    borderRightColor: BORDER_LIGHT,
  },
  tdMono: {
    padding: 4,
    fontSize: 8,
    fontFamily: "Courier-Bold",
    color: INK,
    borderRightWidth: 0.5,
    borderRightColor: BORDER_LIGHT,
  },
  tdLast: {
    padding: 4,
    fontSize: 8,
    color: INK,
  },

  /* Phase blocks */
  phaseBox: {
    borderWidth: 0.5,
    borderColor: BORDER_LIGHT,
    marginTop: 4,
    padding: 6,
  },
  phaseTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: GREEN_DARK,
  },
  phaseMeta: {
    fontSize: 8,
    color: INK_MUTED,
    marginTop: 1,
  },
  phaseChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
  },
  chip: {
    borderWidth: 0.5,
    borderColor: GREEN,
    backgroundColor: GREEN_TINT,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginRight: 3,
    marginBottom: 3,
    fontSize: 7,
    fontFamily: "Courier-Bold",
    color: GREEN_DARK,
  },

  /* Misc */
  note: {
    fontSize: 7.5,
    color: INK_MUTED,
    marginTop: 4,
    fontStyle: "italic",
  },
  placeholderBox: {
    borderWidth: 0.5,
    borderColor: BORDER_LIGHT,
    padding: 10,
    marginTop: 4,
    marginBottom: 8,
    fontSize: 8,
    color: INK_MUTED,
    fontStyle: "italic",
    textAlign: "center",
  },
});

function formatStamp(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Defend against incomplete configs reaching the renderer.  A config
 * scaffolded from "real geometry" (before any import) or hydrated from
 * older persisted state can be missing the collections / location the
 * dossier reads.  When that happened a child component threw mid-render
 * (e.g. `location.lat`, `approaches.map`, iterating `conflicts`) and
 * @react-pdf surfaced it only as the cryptic "Cannot read properties of
 * null (reading 'props')".  Normalising up front keeps the export
 * working for partially-configured intersections.
 */
function toFiniteNumber(value: unknown): number {
  // Backend decimal columns (lat/lng) arrive as strings; coerce so the
  // formatting (`.toFixed`) doesn't blow up and the real value is kept.
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sanitiseConfig(config: IntersectionConfig): IntersectionConfig {
  const loc = config.identity?.location;
  return {
    ...config,
    id: config.id ?? "INT",
    identity: {
      name: config.identity?.name ?? "",
      district: config.identity?.district ?? "",
      address: config.identity?.address ?? "",
      location: {
        lat: toFiniteNumber(loc?.lat),
        lng: toFiniteNumber(loc?.lng),
      },
    },
    approaches: config.approaches ?? [],
    signalGroups: config.signalGroups ?? [],
    detectors: config.detectors ?? [],
    phases: config.phases ?? [],
    stages: config.stages ?? [],
    conflicts: config.conflicts ?? [],
  };
}

interface DossierPDFProps {
  config: IntersectionConfig;
  /** Type of dossier to render. */
  kind?: "regulation" | "cablage";
  /** Project name shown on the cover page. */
  projectName?: string;
  /** Client / maître d'ouvrage shown in the cover header box. */
  client?: string;
  /** Document revision — single-letter or "V01". */
  revision?: string;
  /** ISO date string.  Defaults to today. */
  dateIso?: string;
  /** Authors in the revision table. */
  preparedBy?: string;
  verifiedBy?: string;
}

// ──────────────────────────── Shared chrome

function PageChrome({
  kind,
  intersectionName,
  pageNumber,
  totalPages,
  children,
}: {
  kind: "regulation" | "cablage";
  intersectionName: string;
  pageNumber: number;
  totalPages: number;
  children: React.ReactNode;
}) {
  const title =
    kind === "cablage" ? "Dossier de câblage" : "Dossier de régulation";
  return (
    <Page size="A4" style={s.page}>
      <View style={s.pageHeader} fixed>
        <View style={s.pageHeaderLeft}>
          <Text>Travaux de Signalisation Lumineuse Tricolore</Text>
          <Text>
            {title} — {intersectionName}
          </Text>
        </View>
        <View style={s.pageHeaderRight}>
          <Text>SOCIÉTÉ</Text>
          <Text>RÉGION</Text>
          <Text>AMÉNAGEMENT</Text>
        </View>
      </View>
      {children}
      <View style={s.pageFooter} fixed>
        <Text>© Exporté depuis STLS Studio — reproduction autorisée interne</Text>
        <Text>
          {pageNumber} / {totalPages}
        </Text>
      </View>
    </Page>
  );
}

// ──────────────────────────── Cover

function CoverPage({
  kind,
  intersectionName,
  client,
  projectName,
  revision,
  dateIso,
  preparedBy,
  verifiedBy,
}: {
  kind: "regulation" | "cablage";
  intersectionName: string;
  client: string;
  projectName: string;
  revision: string;
  dateIso: string;
  preparedBy: string;
  verifiedBy: string;
}) {
  const title =
    kind === "cablage"
      ? `Dossier de câblage — ${intersectionName}`
      : `Dossier de régulation — ${intersectionName}`;
  return (
    <Page size="A4" style={s.coverPage}>
      <View style={s.coverHeadBox}>
        <Text style={s.coverHeadText}>{client.toUpperCase()}</Text>
      </View>

      <View>
        <Text style={s.coverTitle}>{title}</Text>
      </View>

      <View style={s.coverSubtitleBar}>
        <Text style={s.coverSubtitle}>
          Travaux de Signalisation Lumineuse Tricolore
        </Text>
      </View>
      <Text style={s.coverProject}>Projet {projectName}</Text>

      <View style={s.revisionTable}>
        <View style={s.revisionRow}>
          <Text style={[s.revisionCellHead, { flex: 1 }]}>Version</Text>
          <Text style={[s.revisionCellHead, { flex: 1.2 }]}>
            Date de révision
          </Text>
          <Text style={[s.revisionCellHead, { flex: 2 }]}>
            Objet de la révision
          </Text>
        </View>
        <View style={s.revisionRow}>
          <Text style={[s.revisionCell, { flex: 1 }]}>{revision}</Text>
          <Text style={[s.revisionCell, { flex: 1.2 }]}>
            {formatStamp(new Date(dateIso))}
          </Text>
          <Text style={[s.revisionCell, { flex: 2 }]}>Création du document</Text>
        </View>
        <View style={s.revisionRow}>
          <Text style={[s.revisionCellHead, { flex: 1 }]}>Préparé par</Text>
          <Text style={[s.revisionCell, { flex: 3.2 }]}>{preparedBy}</Text>
        </View>
        <View style={[s.revisionRow, { borderBottomWidth: 0 }]}>
          <Text style={[s.revisionCellHead, { flex: 1 }]}>Vérifié par</Text>
          <Text style={[s.revisionCell, { flex: 3.2 }]}>{verifiedBy}</Text>
        </View>
      </View>

      <View style={s.coverFooter} fixed>
        <Text style={s.brandMark}>STLS STUDIO</Text>
        <Text style={s.brandMarkSub}>
          Dossier généré automatiquement depuis la configuration carrefour
        </Text>
      </View>
    </Page>
  );
}

// ──────────────────────────── Regulation content

function RegulationContent({
  config,
  intersectionName,
}: {
  config: IntersectionConfig;
  intersectionName: string;
}) {
  const approachLabelById = new Map(
    config.approaches.map((a) => [a.id, `${a.bearing} — ${a.label}`]),
  );
  const sgLabel = (id: string) => {
    const sg = config.signalGroups.find((g) => g.id === id);
    return sg ? sg.label : id;
  };

  const cycleSeconds = config.phases.reduce(
    (t, p) => t + p.minGreenSeconds + p.yellowSeconds + p.redClearanceSeconds,
    0,
  );

  return (
    <PageChrome
      kind="regulation"
      intersectionName={intersectionName}
      pageNumber={2}
      totalPages={2}
    >
      <Text style={s.h1}>1. IDENTITÉ DU CARREFOUR</Text>
      <View style={s.accentBar} />
      <View style={s.table}>
        <View style={s.tableHead}>
          <Text style={[s.th, { flex: 1.2 }]}>Champ</Text>
          <Text style={[s.th, { flex: 3, borderRightWidth: 0 }]}>Valeur</Text>
        </View>
        {[
          ["Code carrefour", config.code ?? config.id],
          ["Nom", config.identity.name],
          ["District", config.identity.district],
          ["Adresse", config.identity.address],
          [
            "Coordonnées",
            `${config.identity.location.lat.toFixed(5)}, ${config.identity.location.lng.toFixed(5)}`,
          ],
          ["Contrôleur", config.controllerId || "—"],
        ].map(([k, v], i, arr) => (
          <View key={k} style={i === arr.length - 1 ? s.tableRowLast : s.tableRow}>
            <Text style={[s.td, { flex: 1.2 }]}>{k}</Text>
            <Text style={[s.tdLast, { flex: 3 }]}>{v}</Text>
          </View>
        ))}
      </View>

      <Text style={s.h2}>2. APPROCHES</Text>
      <View style={s.table}>
        <View style={s.tableHead}>
          <Text style={[s.th, { flex: 0.8 }]}>Bearing</Text>
          <Text style={[s.th, { flex: 2.5 }]}>Libellé</Text>
          <Text style={[s.th, { flex: 0.8 }]}>Voies</Text>
          <Text style={[s.th, { flex: 2, borderRightWidth: 0 }]}>ID</Text>
        </View>
        {config.approaches.length === 0 ? (
          <View style={s.tableRowLast}>
            <Text style={[s.tdLast, { flex: 6.1 }]}>Aucune approche.</Text>
          </View>
        ) : (
          config.approaches.map((a, i, arr) => (
            <View key={a.id} style={i === arr.length - 1 ? s.tableRowLast : s.tableRow}>
              <Text style={[s.tdMono, { flex: 0.8 }]}>{a.bearing}</Text>
              <Text style={[s.td, { flex: 2.5 }]}>{a.label}</Text>
              <Text style={[s.tdMono, { flex: 0.8 }]}>{a.lanes}</Text>
              <Text style={[s.tdMono, { flex: 2 }]}>{a.id}</Text>
            </View>
          ))
        )}
      </View>

      <Text style={s.h2} break>
        3. AFFECTATION LIGNES DE FEUX
      </Text>
      <View style={s.table}>
        <View style={s.tableHead}>
          <Text style={[s.th, { flex: 0.8 }]}>ID</Text>
          <Text style={[s.th, { flex: 2.2 }]}>Libellé</Text>
          <Text style={[s.th, { flex: 1.8 }]}>Approche</Text>
          <Text style={[s.th, { flex: 2.2, borderRightWidth: 0 }]}>Aspects</Text>
        </View>
        {config.signalGroups.length === 0 ? (
          <View style={s.tableRowLast}>
            <Text style={[s.tdLast, { flex: 7 }]}>
              Aucun groupe de feux défini.
            </Text>
          </View>
        ) : (
          config.signalGroups.map((sg, i, arr) => (
            <View key={sg.id} style={i === arr.length - 1 ? s.tableRowLast : s.tableRow}>
              <Text style={[s.tdMono, { flex: 0.8 }]}>{sg.id}</Text>
              <Text style={[s.td, { flex: 2.2 }]}>{sg.label}</Text>
              <Text style={[s.td, { flex: 1.8 }]}>
                {sg.approachId
                  ? approachLabelById.get(sg.approachId) ?? sg.approachId
                  : "—"}
              </Text>
              <Text style={[s.tdLast, { flex: 2.2 }]}>
                {sg.aspects.join(", ")}
              </Text>
            </View>
          ))
        )}
      </View>

      <Text style={s.h2}>4. PHASAGE</Text>
      <Text style={s.note}>
        Cycle théorique : {cycleSeconds}s — {config.phases.length} phase(s) déclarée(s).
      </Text>
      {config.phases.map((phase, idx) => (
        <View key={phase.id} style={s.phaseBox} wrap={false}>
          <Text style={s.phaseTitle}>
            Phase {idx + 1} — {phase.id} · {phase.label}
          </Text>
          <Text style={s.phaseMeta}>
            Min-vert {phase.minGreenSeconds}s · Jaune {phase.yellowSeconds}s · Rouge de
            dégagement {phase.redClearanceSeconds}s
          </Text>
          <View style={s.phaseChips}>
            {phase.greenSignalGroupIds.length === 0 ? (
              <Text style={s.phaseMeta}>Aucun vert déclaré</Text>
            ) : (
              phase.greenSignalGroupIds.map((id) => (
                <Text key={id} style={s.chip}>
                  {id} · {sgLabel(id)}
                </Text>
              ))
            )}
          </View>
        </View>
      ))}

      <Text style={s.h2} break>
        5. MATRICE DES CONFLITS
      </Text>
      <Text style={s.note}>
        Signale les groupes de feux qui ne peuvent pas être verts simultanément.
      </Text>
      <ConflictMatrix config={config} />

      <Text style={s.h2} break>
        6. DÉTECTEURS
      </Text>
      <View style={s.table}>
        <View style={s.tableHead}>
          <Text style={[s.th, { flex: 1 }]}>ID</Text>
          <Text style={[s.th, { flex: 2.2 }]}>Libellé</Text>
          <Text style={[s.th, { flex: 1.8 }]}>Approche</Text>
          <Text style={[s.th, { flex: 1 }]}>Canal</Text>
          <Text style={[s.th, { flex: 1.2, borderRightWidth: 0 }]}>Type</Text>
        </View>
        {config.detectors.length === 0 ? (
          <View style={s.tableRowLast}>
            <Text style={[s.tdLast, { flex: 7.2 }]}>Aucun détecteur.</Text>
          </View>
        ) : (
          config.detectors.map((d, i, arr) => (
            <View key={d.id} style={i === arr.length - 1 ? s.tableRowLast : s.tableRow}>
              <Text style={[s.tdMono, { flex: 1 }]}>{d.id}</Text>
              <Text style={[s.td, { flex: 2.2 }]}>{d.label}</Text>
              <Text style={[s.td, { flex: 1.8 }]}>
                {d.approachId
                  ? approachLabelById.get(d.approachId) ?? d.approachId
                  : "—"}
              </Text>
              <Text style={[s.tdMono, { flex: 1 }]}>{d.channel}</Text>
              <Text style={[s.tdLast, { flex: 1.2 }]}>{d.kind}</Text>
            </View>
          ))
        )}
      </View>

      <Text style={s.note}>
        Sections absentes (ajoutées par l&apos;équipe régulation) : matrice des distances
        dégagement-engagement, plans de feux, commutations horaires, phases manuelles.
      </Text>
    </PageChrome>
  );
}

function ConflictMatrix({ config }: { config: IntersectionConfig }) {
  const sgs = config.signalGroups;
  if (sgs.length === 0) {
    return (
      <View style={s.placeholderBox}>
        <Text>Aucun groupe de feux — matrice vide.</Text>
      </View>
    );
  }
  const conflictSet = new Set<string>();
  for (const pair of config.conflicts) {
    conflictSet.add(`${pair.a}|${pair.b}`);
    conflictSet.add(`${pair.b}|${pair.a}`);
  }
  return (
    <View style={s.table}>
      <View style={s.tableHead}>
        <Text style={[s.th, { width: 40 }]}> </Text>
        {sgs.map((sg, i) => (
          <Text
            key={sg.id}
            style={[
              s.th,
              {
                flex: 1,
                borderRightWidth: i === sgs.length - 1 ? 0 : 0.5,
                textAlign: "center",
              },
            ]}
          >
            {sg.id}
          </Text>
        ))}
      </View>
      {sgs.map((row, r) => (
        <View
          key={row.id}
          style={r === sgs.length - 1 ? s.tableRowLast : s.tableRow}
        >
          <Text
            style={[
              s.tdMono,
              { width: 40, borderRightColor: BORDER, borderRightWidth: 0.5 },
            ]}
          >
            {row.id}
          </Text>
          {sgs.map((col, c) => {
            const key = `${row.id}|${col.id}`;
            const conflict = conflictSet.has(key);
            const diag = row.id === col.id;
            return (
              <Text
                key={col.id}
                style={[
                  c === sgs.length - 1 ? s.tdLast : s.td,
                  {
                    flex: 1,
                    textAlign: "center",
                    color: diag ? INK_MUTED : conflict ? "#9a1c1c" : INK_MUTED,
                    backgroundColor: conflict ? "#fde9e9" : undefined,
                    fontFamily: conflict ? "Helvetica-Bold" : "Helvetica",
                  },
                ]}
              >
                {diag ? "—" : conflict ? "X" : "·"}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ──────────────────────────── Cabling content

function CablageContent({
  config,
  intersectionName,
}: {
  config: IntersectionConfig;
  intersectionName: string;
}) {
  const approachLabelById = new Map(
    config.approaches.map((a) => [a.id, `${a.bearing} — ${a.label}`]),
  );

  // Equipment totals (approximations from the Studio config — the
  // physical-install counts live with the câblage team).
  const nbSG = config.signalGroups.length;
  const nbDetectors = config.detectors.length;
  const nbApproaches = config.approaches.length;

  return (
    <PageChrome
      kind="cablage"
      intersectionName={intersectionName}
      pageNumber={2}
      totalPages={2}
    >
      <Text style={s.h1}>1. IDENTITÉ DU CARREFOUR</Text>
      <View style={s.accentBar} />
      <View style={s.table}>
        <View style={s.tableHead}>
          <Text style={[s.th, { flex: 1.2 }]}>Champ</Text>
          <Text style={[s.th, { flex: 3, borderRightWidth: 0 }]}>Valeur</Text>
        </View>
        {[
          ["Code carrefour", config.code ?? config.id],
          ["Nom", config.identity.name],
          ["Contrôleur", config.controllerId || "—"],
          [
            "Coordonnées",
            `${config.identity.location.lat.toFixed(5)}, ${config.identity.location.lng.toFixed(5)}`,
          ],
        ].map(([k, v], i, arr) => (
          <View key={k} style={i === arr.length - 1 ? s.tableRowLast : s.tableRow}>
            <Text style={[s.td, { flex: 1.2 }]}>{k}</Text>
            <Text style={[s.tdLast, { flex: 3 }]}>{v}</Text>
          </View>
        ))}
      </View>

      <Text style={s.h2}>2. CARNET DE CÂBLAGE — SUPPORTS DE FEUX</Text>
      <Text style={s.note}>
        Longueurs et numéros de chambres à compléter par l&apos;équipe chantier.
      </Text>
      <View style={s.table}>
        <View style={s.tableHead}>
          <Text style={[s.th, { flex: 0.8 }]}>Support</Text>
          <Text style={[s.th, { flex: 1.3 }]}>Equipement</Text>
          <Text style={[s.th, { flex: 1.8 }]}>Approche</Text>
          <Text style={[s.th, { flex: 1.5 }]}>Câble</Text>
          <Text style={[s.th, { flex: 1.5 }]}>Repère</Text>
          <Text style={[s.th, { flex: 1, borderRightWidth: 0 }]}>Long. (m)</Text>
        </View>
        {config.signalGroups.length === 0 ? (
          <View style={s.tableRowLast}>
            <Text style={[s.tdLast, { flex: 7.9 }]}>Aucun signal groupe.</Text>
          </View>
        ) : (
          config.signalGroups.map((sg, i, arr) => (
            <View key={sg.id} style={i === arr.length - 1 ? s.tableRowLast : s.tableRow}>
              <Text style={[s.tdMono, { flex: 0.8 }]}>{sg.id}</Text>
              <Text style={[s.td, { flex: 1.3 }]}>{sg.label}</Text>
              <Text style={[s.td, { flex: 1.8 }]}>
                {sg.approachId
                  ? approachLabelById.get(sg.approachId) ?? sg.approachId
                  : "—"}
              </Text>
              <Text style={[s.tdMono, { flex: 1.5 }]}>
                {isPedestrianLike(sg) ? "5 G 1.5mm²" : "12 G 1.5mm²"}
              </Text>
              <Text style={[s.tdMono, { flex: 1.5 }]}>
                {config.code ?? config.id}_{sg.id}
              </Text>
              <Text style={[s.tdLast, { flex: 1 }]}>—</Text>
            </View>
          ))
        )}
      </View>

      <Text style={s.h2}>3. CARNET DE CÂBLAGE — BOUCLES DE DÉTECTION</Text>
      <View style={s.table}>
        <View style={s.tableHead}>
          <Text style={[s.th, { flex: 1 }]}>Boucle</Text>
          <Text style={[s.th, { flex: 1.8 }]}>Approche</Text>
          <Text style={[s.th, { flex: 1 }]}>Canal</Text>
          <Text style={[s.th, { flex: 1.5 }]}>Câble</Text>
          <Text style={[s.th, { flex: 1.5, borderRightWidth: 0 }]}>Repère</Text>
        </View>
        {config.detectors.length === 0 ? (
          <View style={s.tableRowLast}>
            <Text style={[s.tdLast, { flex: 6.8 }]}>Aucune boucle déclarée.</Text>
          </View>
        ) : (
          config.detectors.map((d, i, arr) => (
            <View key={d.id} style={i === arr.length - 1 ? s.tableRowLast : s.tableRow}>
              <Text style={[s.tdMono, { flex: 1 }]}>{d.id}</Text>
              <Text style={[s.td, { flex: 1.8 }]}>
                {d.approachId
                  ? approachLabelById.get(d.approachId) ?? d.approachId
                  : "—"}
              </Text>
              <Text style={[s.tdMono, { flex: 1 }]}>{d.channel}</Text>
              <Text style={[s.tdMono, { flex: 1.5 }]}>LIYCY 2 × 1.5 mm²</Text>
              <Text style={[s.tdLast, { flex: 1.5 }]}>
                {config.code ?? config.id}_{d.id}
              </Text>
            </View>
          ))
        )}
      </View>

      <Text style={s.h2}>4. QUANTITATIF DU CARREFOUR</Text>
      <View style={s.table}>
        <View style={s.tableHead}>
          <Text style={[s.th, { flex: 3 }]}>Désignation</Text>
          <Text style={[s.th, { flex: 1, borderRightWidth: 0 }]}>Quantité</Text>
        </View>
        {[
          ["Enveloppe / armoire", 1],
          ["Approches configurées", nbApproaches],
          ["Groupes de feux (SG)", nbSG],
          ["Signaux piétons estimés", nbSG], // filled manually later
          ["Boucles magnétiques", nbDetectors],
          ["Détecteurs", nbDetectors],
        ].map(([k, v], i, arr) => (
          <View
            key={String(k)}
            style={i === arr.length - 1 ? s.tableRowLast : s.tableRow}
          >
            <Text style={[s.td, { flex: 3 }]}>{k}</Text>
            <Text style={[s.tdLast, { flex: 1, textAlign: "center" }]}>
              {v}
            </Text>
          </View>
        ))}
      </View>

      <Text style={s.note}>
        Les longueurs théoriques incluent : une boucle de 2 m par chambre de tirage,
        une remontée / câblage de 6 m aux deux extrémités, une marge de sécurité de 5 %.
        À compléter par l&apos;équipe chantier.
      </Text>
    </PageChrome>
  );
}

function isPedestrianLike(sg: {
  label: string;
  aspects: string[];
}): boolean {
  const label = (sg.label || "").toLowerCase();
  if (label.includes("pi") || label.includes("ped")) return true;
  return sg.aspects.some((a) => a.startsWith("ped-"));
}

// ──────────────────────────── Document

export function DossierPDF({
  config,
  kind = "regulation",
  projectName,
  client,
  revision = "V01",
  dateIso,
  preparedBy = "STLS Studio",
  verifiedBy = "—",
}: DossierPDFProps) {
  const safe = sanitiseConfig(config);
  const name = safe.identity.name || safe.id;
  const today = dateIso ?? new Date().toISOString();
  const defaultedProject =
    projectName ?? `STLS-${safe.id.replace(/[^A-Z0-9-]/gi, "")}`;
  const defaultedClient =
    client ?? (safe.identity.district || "Société d'aménagement");

  return (
    <Document
      title={`${kind === "cablage" ? "Dossier câblage" : "Dossier régulation"} — ${name}`}
      author="STLS Studio"
      creator="STLS Studio"
      producer="STLS Studio"
    >
      <CoverPage
        kind={kind}
        intersectionName={name}
        client={defaultedClient}
        projectName={defaultedProject}
        revision={revision}
        dateIso={today}
        preparedBy={preparedBy}
        verifiedBy={verifiedBy}
      />
      {kind === "cablage" ? (
        <CablageContent config={safe} intersectionName={name} />
      ) : (
        <RegulationContent config={safe} intersectionName={name} />
      )}
    </Document>
  );
}
