/**
 * Catalogue of known short codes that recur across `Dossier de
 * Régulation` and `Plan Filaire` folders. These are the primary
 * join keys used to link real-world documents to STLS
 * intersections.
 *
 * Source: handed over by the engineering team with the OneDrive
 * dump (D:\sabrine). New codes can be appended without a schema
 * change — they are simple string tags.
 */
export const KNOWN_SHORT_CODES = [
  'AL3',
  'AL4',
  'ANO',
  'AUX',
  'BAR',
  'BIS',
  'ESS',
  'HA3',
  'HA4',
  'MES',
  'MVI',
  'OQB',
  'PUI',
  'SMI',
  'ZIA',
] as const;

export type KnownShortCode = (typeof KNOWN_SHORT_CODES)[number];

const SHORT_CODE_SET = new Set<string>(KNOWN_SHORT_CODES);

/**
 * Heuristic, optional human description of each code. Kept here so
 * the UI can render a readable label next to the short code; not
 * load-bearing.
 */
export const SHORT_CODE_LABELS: Record<string, string> = {
  AL3: 'Allal — site 3',
  AL4: 'Allal — site 4',
  ANO: 'Anoual',
  AUX: 'Auxiliaire',
  BAR: 'Baroudi',
  BIS: 'Bismillah',
  ESS: 'Essalam',
  HA3: 'Hassan — site 3',
  HA4: 'Hassan — site 4',
  MES: 'Mesnaoui',
  MVI: 'Mohammed VI',
  OQB: 'Oqba',
  PUI: 'Puit',
  SMI: 'Smiha',
  ZIA: 'Ziaten',
};

export function isKnownShortCode(value: string): value is KnownShortCode {
  return SHORT_CODE_SET.has(value);
}

/**
 * Search a free-form string for the first occurrence of any known
 * short code. Returns the matched code (always upper-case) or null.
 * The search is case-insensitive and tolerates the code being
 * surrounded by `_ - . ( )` so it works on real filenames like
 * `Dossier_Regulation_AL3_v2025-03.pdf` or `PlanFilaire-BAR-A.pdf`.
 */
export function findShortCodeInName(value: string): KnownShortCode | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  for (const code of KNOWN_SHORT_CODES) {
    // Word-boundary-ish match: code must not be embedded in a
    // longer alphanumeric run (so "AL3" doesn't match "BALL3").
    const re = new RegExp(`(?:^|[^A-Z0-9])${code}(?:[^A-Z0-9]|$)`);
    if (re.test(upper)) return code;
  }
  return null;
}
