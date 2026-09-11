/**
 * Filename parsers for the engineering reference layer.
 *
 * The real files in D:\sabrine follow a handful of conventions
 * established by the Tomorrow / Groupe Ryx engineering team. We
 * keep the parsers permissive and never throw — when a filename
 * does not match a known pattern we return whatever fragments we
 * managed to extract plus a parse note, so the operator can still
 * see the document in the UI and tag it manually.
 */

import { findShortCodeInName } from '../engineering-references/short-codes';

export type ParsedDocumentKind =
  | 'plan_rs'
  | 'dossier_regulation'
  | 'plan_filaire'
  | 'programme_archive';

export interface ParsedFilename {
  kind: ParsedDocumentKind | null;
  city: string;
  corridor: string;
  shortCode: string | null;
  carrefourLabel: string | null;
  title: string;
  revision: string | null;
  parseNotes: string | null;
}

/** Common cleanup: strip extension, replace underscores with spaces. */
function pretty(value: string): string {
  return value
    .replace(/\.[A-Za-z0-9]+$/, '')
    .replace(/[_]+/g, ' ')
    .trim();
}

/**
 * Plan RS Fès filenames look like:
 *   Plan_RS_SLT_Car01_Chaouki_Far_A.pdf
 *   Plan_RS_SLT_Car04_Imouzzer-Hicham_B.pdf
 *   Plan_RS_SLT_Car09_Imouzzer-Khattib_C.pdf
 *
 * Capture: carrefour number, corridor cluster, revision letter.
 */
const PLAN_RS_RE =
  /^Plan_RS_SLT_Car(\d+)_([A-Za-zÀ-ÿ0-9\-_]+?)_([A-Z])\.(pdf|PDF)$/;

export function parsePlanRsFès(fileName: string): ParsedFilename {
  const m = PLAN_RS_RE.exec(fileName);
  if (!m) {
    return {
      kind: 'plan_rs',
      city: 'Fès',
      corridor: 'unknown',
      shortCode: findShortCodeInName(fileName),
      carrefourLabel: null,
      title: pretty(fileName),
      revision: null,
      parseNotes: 'Filename did not match Plan_RS_SLT_Car{NN}_*_{X}.pdf',
    };
  }
  const [, num, cluster, rev] = m;
  return {
    kind: 'plan_rs',
    city: 'Fès',
    corridor: cluster.replace(/[-_]/g, ' ').trim(),
    shortCode: findShortCodeInName(fileName),
    carrefourLabel: `C${num.padStart(2, '0')}`,
    title: `Plan RS — C${num.padStart(2, '0')} ${cluster.replace(/[-_]/g, ' ').trim()}`,
    revision: rev,
    parseNotes: null,
  };
}

/**
 * Dossier de Régulation filenames in the dataset typically mention
 * a short code (AL3, BAR, MVI, …) somewhere in the name plus an
 * optional revision letter at the end. We do not require a strict
 * pattern — we just lift what we can find.
 */
export function parseDossierRegulation(
  fileName: string,
  city: string,
): ParsedFilename {
  const shortCode = findShortCodeInName(fileName);
  const revisionMatch = /[_\-\s]([A-Z])\.(?:pdf|PDF)$/.exec(fileName);
  const revision = revisionMatch ? revisionMatch[1] : null;
  return {
    kind: 'dossier_regulation',
    city: city || 'unknown',
    corridor: 'unknown',
    shortCode,
    carrefourLabel: null,
    title: pretty(fileName),
    revision,
    parseNotes: shortCode
      ? null
      : 'No known short code recognised in filename — tag manually.',
  };
}

/**
 * Plan Filaire filenames mirror Dossier de Régulation: short code +
 * optional revision.
 */
export function parsePlanFilaire(
  fileName: string,
  city: string,
): ParsedFilename {
  const shortCode = findShortCodeInName(fileName);
  const revisionMatch = /[_\-\s]([A-Z])\.(?:pdf|PDF)$/.exec(fileName);
  const revision = revisionMatch ? revisionMatch[1] : null;
  return {
    kind: 'plan_filaire',
    city: city || 'unknown',
    corridor: 'unknown',
    shortCode,
    carrefourLabel: null,
    title: pretty(fileName),
    revision,
    parseNotes: shortCode
      ? null
      : 'No known short code recognised in filename — tag manually.',
  };
}

/**
 * Programme archive ZIPs: pull short code + optional version
 * fragment (vYYYY-MM or yyyyMMdd) from the filename. Inner-file
 * inventory is built by the scanner, not the parser.
 */
export function parseProgrammeArchive(fileName: string): ParsedFilename {
  const shortCode = findShortCodeInName(fileName);
  const versionMatch =
    /(v?\d{4}[-_]?\d{2}[-_]?\d{0,2})/i.exec(fileName) ??
    /(v\d+(?:\.\d+)*)/i.exec(fileName);
  const version = versionMatch ? versionMatch[1] : null;
  return {
    kind: 'programme_archive',
    city: 'unknown',
    corridor: 'unknown',
    shortCode,
    carrefourLabel: null,
    title: pretty(fileName),
    revision: version,
    parseNotes: shortCode
      ? null
      : 'No known short code recognised in filename — tag manually.',
  };
}

/** Classify a file inside a programme ZIP by its name suffix. */
export function classifyProgrammeInner(
  innerPath: string,
): 'clp9' | 'wpr' | 'pdf' | 'other' {
  const lower = innerPath.toLowerCase();
  if (/\.clp9(_\d+_\d+)?$/.test(lower) || lower.includes('.clp9_')) {
    return 'clp9';
  }
  if (lower.endsWith('.wpr')) return 'wpr';
  if (lower.endsWith('.pdf')) return 'pdf';
  return 'other';
}
