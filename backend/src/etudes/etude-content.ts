/**
 * Structured content blocks for étude sections.
 *
 * Generators emit sequences of blocks instead of raw markdown so the
 * web preview and the PDF renderer can produce proper typography
 * without parsing markdown at the consumer. Block shapes are stable
 * and forward-compatible — new block kinds can be added without
 * breaking existing sections.
 */

export type EtudeContentBlock =
  | EtudeHeadingBlock
  | EtudeParagraphBlock
  | EtudeNoteBlock
  | EtudeListBlock
  | EtudeTableBlock
  | EtudeCodeBlock
  | EtudePlaceholderBlock
  | EtudeKeyValueBlock;

export interface EtudeHeadingBlock {
  kind: 'heading';
  level: 1 | 2 | 3;
  text: string;
}

export interface EtudeParagraphBlock {
  kind: 'paragraph';
  text: string;
}

/** Muted callout — typically wraps a remark or quoted note. */
export interface EtudeNoteBlock {
  kind: 'note';
  text: string;
}

export interface EtudeListBlock {
  kind: 'list';
  ordered?: boolean;
  items: string[];
}

export interface EtudeTableBlock {
  kind: 'table';
  caption?: string;
  columns: Array<{
    key: string;
    label: string;
    align?: 'left' | 'right' | 'center';
  }>;
  rows: Array<Record<string, string | number | null>>;
}

export interface EtudeCodeBlock {
  kind: 'code';
  language?: string;
  text: string;
}

/** Visual placeholder for an image / SVG that has to be inserted manually. */
export interface EtudePlaceholderBlock {
  kind: 'placeholder';
  title: string;
  description: string;
  hintFilename?: string;
}

/** Compact key/value list — used for identification cards and metadata. */
export interface EtudeKeyValueBlock {
  kind: 'keyvalue';
  caption?: string;
  rows: Array<{ key: string; value: string }>;
}

export interface EtudeStructuredContent {
  kind: 'blocks';
  blocks: EtudeContentBlock[];
}

export function blocks(
  ...blockList: EtudeContentBlock[]
): EtudeStructuredContent {
  return { kind: 'blocks', blocks: blockList };
}

export function h(level: 1 | 2 | 3, text: string): EtudeHeadingBlock {
  return { kind: 'heading', level, text };
}

export function p(text: string): EtudeParagraphBlock {
  return { kind: 'paragraph', text };
}

export function note(text: string): EtudeNoteBlock {
  return { kind: 'note', text };
}

export function list(items: string[], ordered = false): EtudeListBlock {
  return { kind: 'list', ordered, items };
}

export function table(input: Omit<EtudeTableBlock, 'kind'>): EtudeTableBlock {
  return { kind: 'table', ...input };
}

export function code(text: string, language?: string): EtudeCodeBlock {
  return { kind: 'code', language, text };
}

export function placeholder(
  title: string,
  description: string,
  hintFilename?: string,
): EtudePlaceholderBlock {
  return { kind: 'placeholder', title, description, hintFilename };
}

export function kv(
  rows: Array<{ key: string; value: string }>,
  caption?: string,
): EtudeKeyValueBlock {
  return { kind: 'keyvalue', caption, rows };
}
