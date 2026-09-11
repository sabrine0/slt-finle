/**
 * Coerce arbitrary Unicode text into a glyph set the built-in PDF
 * Helvetica (WinAnsi subset) can render reliably. Helvetica via
 * @react-pdf/renderer maps to a limited encoding, so curly quotes,
 * arrows, math symbols and bullet characters render as garbage
 * ("=Î", broken tofu, etc.). This helper is applied at every
 * `<Text>` site in the PDF document.
 *
 * Accented Latin characters (é è à ç ù û ï ô ü) are preserved —
 * they are in Latin-1 and render correctly. Only chars outside the
 * safe set are rewritten.
 */
const REPLACEMENTS: Array<[RegExp, string]> = [
  // Curly quotes / primes
  [/[‘’‚‛′]/g, "'"],
  [/[“”„‟″]/g, '"'],
  // Dashes (en, em, figure, horizontal bar)
  [/[‐‑‒–—―]/g, "-"],
  // Ellipsis
  [/…/g, "..."],
  // Arrows
  [/[→⇒➜➡]/g, "->"],
  [/[←⇐]/g, "<-"],
  [/[↑⇑]/g, "^"],
  [/[↓⇓]/g, "v"],
  [/[↔⇔]/g, "<->"],
  // Math operators
  [/≤/g, "<="],
  [/≥/g, ">="],
  [/≠/g, "!="],
  [/[≈∼]/g, "~"],
  [/×/g, "x"],
  [/÷/g, "/"],
  [/±/g, "+/-"],
  // Bullets
  [/[•‣⁃·]/g, "-"],
  [/[●○◦◯]/g, "o"],
  [/[✕✗✘×]/g, "X"],
  [/[✓✔]/g, "v"],
  [/[■□▪▫]/g, "[]"],
  // Guillemets
  [/«\s?/g, '"'],
  [/\s?»/g, '"'],
  // Superscripts / fractions
  [/²/g, "^2"],
  [/³/g, "^3"],
  [/¹/g, "^1"],
  [/½/g, "1/2"],
  [/¼/g, "1/4"],
  [/¾/g, "3/4"],
  // Temperature symbols
  [/℃/g, " C"],
  [/℉/g, " F"],
  // Section sign
  [/§/g, "art. "],
  // Soft hyphen + zero-width
  [/[­​‌‍﻿]/g, ""],
  // No-break space → regular space
  [/ /g, " "],
  // Emoji we have used at some point in templates / UI strings
  [/[\u{1F4CE}\u{1F4DD}\u{1F4D1}\u{1F6E0}]/gu, ""],
];

export function pdfSafe(input: unknown): string {
  if (input === null || input === undefined) return "";
  let out = typeof input === "string" ? input : String(input);
  for (const [pattern, replacement] of REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  // Strip any remaining out-of-WinAnsi characters as a last resort
  // (keep ASCII + Latin-1 supplement which Helvetica handles).
  out = out.replace(/[^ -~ -ÿ—–]/g, "");
  return out;
}
