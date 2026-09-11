"use client";

/**
 * Dossier PDF parser.
 *
 * Uses pdfjs-dist (dynamic-import) to read text + positions from a
 * dossier PDF and heuristically rebuild a partial
 * `IntersectionConfig`.  PDF table extraction is inherently fragile,
 * so the caller drives a *preview* UI — any miss is editable before
 * being committed to the store.
 *
 * Scope (what we try to recover):
 *   • Intersection name + project code (cover page title)
 *   • Signal groups (§4.1 "Affectation lignes de Feux")
 *   • Phases (§4.4 "Phasage" prose bullets)
 *   • Detectors (§3 "Entrées contrôleur" — rows tagged "Détecteur")
 *   • A best-effort conflict guess based on the phasage + bearings
 *
 * Out of scope:
 *   • §4.2 dégagement distances — tiny cells, unreliable OCR
 *   • §4.3 clearance times — same
 *   • Plans de feux (coordination)
 *   • Câblage physique details (chambres, longueurs)
 */

import type {
  Approach,
  ApproachBearing,
  ConflictPair,
  Detector,
  IntersectionConfig,
  Phase,
  SignalGroup,
  Stage,
} from "@/components/studio/state/types";

export interface ParsedDossier {
  ok: boolean;
  errors: string[];
  warnings: string[];
  config: IntersectionConfig;
  /** Per-section extraction confidence 0..1 — drives UI badges. */
  confidence: {
    identity: number;
    approaches: number;
    signalGroups: number;
    phases: number;
    detectors: number;
    conflicts: number;
  };
}

interface TextItem {
  str: string;
  x: number;
  y: number;
  page: number;
}

export async function parseDossierPdf(file: File): Promise<ParsedDossier> {
  const errors: string[] = [];
  const warnings: string[] = [];

  let items: TextItem[];
  try {
    items = await loadTextItems(file);
  } catch (err) {
    return {
      ok: false,
      errors: [
        `Lecture PDF échouée : ${err instanceof Error ? err.message : String(err)}`,
      ],
      warnings: [],
      config: emptyConfig("IMPORT"),
      confidence: zeroConfidence(),
    };
  }

  if (items.length === 0) {
    errors.push("Aucun texte extrait du PDF (document scanné ?).");
    return {
      ok: false,
      errors,
      warnings,
      config: emptyConfig("IMPORT"),
      confidence: zeroConfidence(),
    };
  }

  // ────────────────────────── Identity from cover
  const identity = extractIdentity(items);

  // ────────────────────────── Signal groups from §4.1
  const { signalGroups, approaches, confidenceSG } = extractSignalGroups(items);
  if (signalGroups.length === 0) {
    warnings.push(
      "Aucun groupe de feux reconnu dans §4.1 — à compléter manuellement.",
    );
  }

  // ────────────────────────── Phases from §4.4
  const { phases, stages, confidencePhase } = extractPhases(
    items,
    signalGroups,
  );

  // ────────────────────────── Detectors from §3 entrées contrôleur
  const { detectors, confidenceDet } = extractDetectors(items, signalGroups, approaches);

  // ────────────────────────── Conflicts — derive from phasage
  // Two SGs *cannot* share a phase ⇒ candidate conflict.  Coarse but
  // useful starting point; operator can refine in the review modal.
  const conflicts: ConflictPair[] = deriveConflictsFromPhases(
    signalGroups,
    phases,
  );

  const id = identity.id ?? deriveCodeFromFileName(file.name) ?? "IMPORT";

  const config: IntersectionConfig = {
    id,
    identity: {
      name: identity.name ?? id,
      district: identity.district ?? "",
      address: identity.address ?? "",
      location: { lat: 0, lng: 0 },
    },
    controllerId: identity.controllerId ?? `CTRL-${id}`,
    approaches,
    signalGroups,
    detectors,
    phases,
    stages,
    conflicts,
  };

  return {
    ok: true,
    errors,
    warnings,
    config,
    confidence: {
      identity: identity.confidence,
      approaches: approaches.length > 0 ? 0.75 : 0,
      signalGroups: confidenceSG,
      phases: confidencePhase,
      detectors: confidenceDet,
      conflicts: conflicts.length > 0 ? 0.5 : 0,
    },
  };
}

// ──────────────────────────────────────────── pdfjs loader

async function loadTextItems(file: File): Promise<TextItem[]> {
  const pdfjs = await import("pdfjs-dist");
  // pdfjs needs a worker.  Ship the bundled worker via the pdfjs-dist
  // package path so Turbopack resolves it at build time.
  const workerMod = await import(
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — URL import resolves at build time, not typed
    "pdfjs-dist/build/pdf.worker.min.mjs?url"
  ).catch(() => null);
  if (workerMod && workerMod.default) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default as string;
  }

  const buf = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: buf });
  const doc = await loadingTask.promise;

  const items: TextItem[] = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const raw of content.items) {
      const it = raw as {
        str?: string;
        transform?: number[];
      };
      if (!it.str || !it.transform) continue;
      const x = it.transform[4];
      const y = it.transform[5];
      items.push({ str: it.str, x, y, page: p });
    }
  }
  return items;
}

// ──────────────────────────────────────────── Identity

function extractIdentity(items: TextItem[]): {
  id: string | null;
  name: string | null;
  district: string | null;
  address: string | null;
  controllerId: string | null;
  confidence: number;
} {
  // Title typically contains "Carrefour 04" and a list of arteries.
  const cover = items.filter((it) => it.page <= 2);
  const concat = cover.map((it) => it.str).join(" ");

  const carrefourMatch = concat.match(/Carrefour\s+(\d+)/i);
  const id = carrefourMatch ? `INT-C${carrefourMatch[1].padStart(2, "0")}` : null;

  // Name heuristic: first line after "Carrefour NN :"
  let name: string | null = null;
  const nameMatch = concat.match(
    /Carrefour\s+\d+\s*:\s*(.+?)(?:\s{2,}|Projet|Travaux|$)/i,
  );
  if (nameMatch) {
    name = nameMatch[1].replace(/\s+/g, " ").trim();
    if (name.length > 120) name = name.slice(0, 117) + "…";
  }

  // District / address: dossier template rarely exposes these on the
  // cover.  Leave null so the operator fills them in.
  const district = guessDistrict(concat);
  const address = name;

  const controllerMatch = concat.match(/C(\d{2,3})\b/);
  const controllerId = controllerMatch ? `CTRL-C${controllerMatch[1]}` : null;

  let confidence = 0;
  if (id) confidence += 0.35;
  if (name) confidence += 0.4;
  if (controllerId) confidence += 0.15;
  if (district) confidence += 0.1;

  return { id, name, district, address, controllerId, confidence };
}

function guessDistrict(blob: string): string | null {
  // Hand-built list of Moroccan cities that the dossier tends to
  // reference — extend as more dossiers land.
  const cities = [
    "Fès",
    "Casablanca",
    "Rabat",
    "Marrakech",
    "Tanger",
    "Agadir",
    "Meknès",
    "Oujda",
    "Settat",
    "Tétouan",
  ];
  for (const c of cities) {
    if (new RegExp(`\\b${c}\\b`, "i").test(blob)) return c;
  }
  return null;
}

// ──────────────────────────────────────────── Signal groups

const SG_ROW_RE =
  /^(V\d{1,2}|P\d{1,2})\s+(R11v?|R12|R14dtd|R14tg)\s+(Tricolore|Pi[eé]ton)/i;

function extractSignalGroups(items: TextItem[]): {
  signalGroups: SignalGroup[];
  approaches: Approach[];
  confidenceSG: number;
} {
  // Reconstruct lines by grouping items on the same Y coordinate.
  const lines = reconstructLines(items);

  const sgs: SignalGroup[] = [];
  const approachByBearing = new Map<ApproachBearing, Approach>();

  for (const { text } of lines) {
    const match = text.match(SG_ROW_RE);
    if (!match) continue;
    const id = match[1].toLowerCase();
    const type = match[2];
    const kind = /piéton|pieton/i.test(match[3]) ? "pedestrian" : "vehicle";

    const labelMatch = text.match(
      new RegExp(
        `${id}\\s+${type}\\s+(?:Tricolore[^\\d]*|Pi[eé]ton\\s+)\\s*(\\d+)?\\s*(.*?)(?:\\s+\\d+\\s*m\\/s|$)`,
        "i",
      ),
    );
    const label = (labelMatch?.[2] ?? "").trim() || humanLabelForId(id);

    const bearing = guessBearingFromLabel(label) ?? (id.startsWith("P") ? "N" : "N");
    if (!approachByBearing.has(bearing)) {
      approachByBearing.set(bearing, {
        id: `appr-${bearing.toLowerCase()}`,
        bearing,
        label: labelForBearing(bearing, label),
        lanes: 2,
      });
    }
    const approach = approachByBearing.get(bearing)!;

    sgs.push({
      id,
      label: label || id,
      approachId: approach.id,
      aspects: kind === "pedestrian" ? ["ped-walk", "ped-stop"] : ["red", "yellow", "green"],
    });
  }

  const dedup = new Map<string, SignalGroup>();
  for (const sg of sgs) dedup.set(sg.id, sg);

  return {
    signalGroups: Array.from(dedup.values()),
    approaches: Array.from(approachByBearing.values()),
    confidenceSG: dedup.size >= 4 ? 0.85 : dedup.size > 0 ? 0.55 : 0,
  };
}

function labelForBearing(bearing: ApproachBearing, hint: string): string {
  if (hint) {
    // Trim common street-name scaffolding
    return hint.replace(/^(Av|Avenue|Rue|Bd|Boulevard)\s+/i, (m) => m).slice(0, 60);
  }
  return {
    N: "North approach",
    NE: "North-East approach",
    E: "East approach",
    SE: "South-East approach",
    S: "South approach",
    SW: "South-West approach",
    W: "West approach",
    NW: "North-West approach",
  }[bearing];
}

function humanLabelForId(id: string): string {
  return id.startsWith("p") ? `Piéton ${id.toUpperCase()}` : `Véhicule ${id.toUpperCase()}`;
}

function guessBearingFromLabel(label: string): ApproachBearing | null {
  const s = label.toLowerCase();
  // Direction of the approach deduced from cardinal hints in the label.
  if (/\bn(-|\s)?s\b|\bnord[-\s]?sud|\bn(-|\s)?o\b|\bn-e\b|\bnord\b/.test(s))
    return "N";
  if (/\bs(-|\s)?n\b|\bsud[-\s]?nord|\bsud\b/.test(s)) return "S";
  if (/\bouest\b|\bW\b|ibn zaidoune/.test(s)) return "W";
  if (/\best\b|\bE\b|hicham/.test(s)) return "E";
  // Street-name-based best guesses from the sample dossier
  if (/houssaine/.test(s)) return "N";
  if (/abdallah/.test(s)) return "S";
  return null;
}

// ──────────────────────────────────────────── Phases

function extractPhases(
  items: TextItem[],
  sgs: SignalGroup[],
): {
  phases: Phase[];
  stages: Stage[];
  confidencePhase: number;
} {
  const lines = reconstructLines(items);
  const sgIds = new Set(sgs.map((sg) => sg.id));

  // Find the "Phasage" paragraph.  Template typically writes
  //   "Phase 1 : TD et TàD Av Roi Houssaine, Av Moulay Abdallah"
  const phaseRegex = /Phase\s+(\d+)\s*:\s*(.+?)(?=Phase\s+\d+|Ce fonctionnement|$)/gi;
  const bigText = lines.map((l) => l.text).join(" ");
  const phases: Phase[] = [];

  // Dossiers often mention "Phase N :" in more than one place
  // (§4.4 phasage, §5.1 manual phases, plan-de-feux commentary) —
  // keep the FIRST occurrence only so phase IDs stay unique.
  const seenPhaseNumbers = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = phaseRegex.exec(bigText)) !== null) {
    const num = Number(m[1]);
    if (seenPhaseNumbers.has(num)) continue;
    seenPhaseNumbers.add(num);
    const descr = m[2].trim().replace(/\s{2,}/g, " ");
    const greens = inferGreenSgsFromPhaseDescr(descr, sgs, sgIds);
    phases.push({
      id: `ph-${num}`,
      label: `Phase ${num} — ${descr.slice(0, 60)}`,
      greenSignalGroupIds: greens,
      minGreenSeconds: 10,
      yellowSeconds: 3,
      redClearanceSeconds: 2,
    });
  }
  phases.sort((a, b) => Number(a.id.slice(3)) - Number(b.id.slice(3)));

  const stages: Stage[] = phases.map((p, i) => ({
    id: `st-${i + 1}`,
    label: `Stage ${i + 1}`,
    phaseId: p.id,
    order: i + 1,
  }));

  return {
    phases,
    stages,
    confidencePhase: phases.length > 0 ? 0.7 : 0,
  };
}

function inferGreenSgsFromPhaseDescr(
  descr: string,
  sgs: SignalGroup[],
  sgIds: Set<string>,
): string[] {
  const lower = descr.toLowerCase();
  const out = new Set<string>();

  // Explicit references (V1, V5, P3, etc.)
  const refs = descr.match(/[VP]\d{1,2}/g) ?? [];
  for (const r of refs) {
    const id = r.toLowerCase();
    if (sgIds.has(id)) out.add(id);
  }

  // Street-name references — rough fall-back
  for (const sg of sgs) {
    const l = (sg.label || "").toLowerCase();
    if (l && lower.includes(l.split(/\s+/)[0])) {
      out.add(sg.id);
    }
  }
  return Array.from(out);
}

// ──────────────────────────────────────────── Detectors

function extractDetectors(
  items: TextItem[],
  sgs: SignalGroup[],
  approaches: Approach[],
): {
  detectors: Detector[];
  confidenceDet: number;
} {
  const lines = reconstructLines(items);
  const detByNum = new Map<number, Detector>();
  const defaultApproachId = approaches[0]?.id;
  // "CP5 Capteur 5 Détecteur Bcl_05 Ic=2''"
  const DET_RE = /CP(\d+)\s+Capteur\s+\d+\s+D[ée]tecteur\s+(Bcl[_-]\d+)/i;
  for (const { text } of lines) {
    const m = text.match(DET_RE);
    if (!m) continue;
    const num = Number(m[1]);
    if (detByNum.has(num)) continue;
    const label = m[2].replace("_", "-");
    const matchingSg = sgs.find(
      (sg) => sg.id === `v${num}` || sg.id === `p${num}`,
    );
    detByNum.set(num, {
      id: `det-${num}`,
      label: `Détecteur ${label}`,
      approachId: matchingSg?.approachId ?? defaultApproachId,
      channel: `DI${num}`,
      kind: "loop",
    });
  }

  const dets = Array.from(detByNum.values()).sort(
    (a, b) => Number(a.id.slice(4)) - Number(b.id.slice(4)),
  );
  return {
    detectors: dets,
    confidenceDet: dets.length > 0 ? 0.8 : 0,
  };
}

// ──────────────────────────────────────────── Conflicts (coarse heuristic)

function deriveConflictsFromPhases(
  sgs: SignalGroup[],
  phases: Phase[],
): ConflictPair[] {
  const ids = sgs.map((sg) => sg.id);
  const coGreen = new Map<string, Set<string>>();
  for (const id of ids) coGreen.set(id, new Set());
  for (const phase of phases) {
    for (const a of phase.greenSignalGroupIds) {
      for (const b of phase.greenSignalGroupIds) {
        if (a === b) continue;
        coGreen.get(a)?.add(b);
      }
    }
  }
  // Any pair never co-green in any phase is a candidate conflict.
  const seen = new Set<string>();
  const pairs: ConflictPair[] = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = ids[i];
      const b = ids[j];
      const coA = coGreen.get(a)?.has(b) ?? false;
      const coB = coGreen.get(b)?.has(a) ?? false;
      if (!coA && !coB) {
        const key = `${a}|${b}`;
        if (!seen.has(key)) {
          seen.add(key);
          pairs.push({ a, b });
        }
      }
    }
  }
  return pairs;
}

// ──────────────────────────────────────────── Shared helpers

function reconstructLines(items: TextItem[]): Array<{
  page: number;
  y: number;
  text: string;
}> {
  // Cluster items by (page, y) — small tolerance so slightly misaligned
  // glyphs on the same row merge.
  const buckets = new Map<
    string,
    { page: number; y: number; items: TextItem[] }
  >();
  for (const it of items) {
    const key = `${it.page}:${Math.round(it.y / 3) * 3}`;
    const b = buckets.get(key) ?? { page: it.page, y: it.y, items: [] };
    b.items.push(it);
    buckets.set(key, b);
  }
  const out: Array<{ page: number; y: number; text: string }> = [];
  for (const b of buckets.values()) {
    b.items.sort((a, b2) => a.x - b2.x);
    const text = b.items.map((it) => it.str).join(" ").replace(/\s+/g, " ").trim();
    if (text.length > 0) out.push({ page: b.page, y: b.y, text });
  }
  // Sort top-of-document first, by page, then Y descending (PDF Y grows up).
  out.sort((a, b) => a.page - b.page || b.y - a.y);
  return out;
}

function zeroConfidence(): ParsedDossier["confidence"] {
  return {
    identity: 0,
    approaches: 0,
    signalGroups: 0,
    phases: 0,
    detectors: 0,
    conflicts: 0,
  };
}

function emptyConfig(id: string): IntersectionConfig {
  return {
    id,
    identity: {
      name: id,
      district: "",
      address: "",
      location: { lat: 0, lng: 0 },
    },
    controllerId: `CTRL-${id}`,
    approaches: [],
    signalGroups: [],
    detectors: [],
    phases: [],
    stages: [],
    conflicts: [],
  };
}

function deriveCodeFromFileName(name: string): string | null {
  const m = name.match(/Car(\d{2,3})/i);
  return m ? `INT-C${m[1].padStart(2, "0")}` : null;
}
