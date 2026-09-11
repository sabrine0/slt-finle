/**
 * Mirror of the backend `etude-content.ts` block types. Kept in
 * lockstep with the generator so the web UI and the PDF document can
 * render the same structured content.
 */

export type ContentBlock =
  | HeadingBlock
  | ParagraphBlock
  | NoteBlock
  | ListBlock
  | TableBlock
  | CodeBlock
  | PlaceholderBlock
  | KeyValueBlock;

export interface HeadingBlock {
  kind: "heading";
  level: 1 | 2 | 3;
  text: string;
}

export interface ParagraphBlock {
  kind: "paragraph";
  text: string;
}

export interface NoteBlock {
  kind: "note";
  text: string;
}

export interface ListBlock {
  kind: "list";
  ordered?: boolean;
  items: string[];
}

export interface TableBlock {
  kind: "table";
  caption?: string;
  columns: Array<{
    key: string;
    label: string;
    align?: "left" | "right" | "center";
  }>;
  rows: Array<Record<string, string | number | null>>;
}

export interface CodeBlock {
  kind: "code";
  language?: string;
  text: string;
}

export interface PlaceholderBlock {
  kind: "placeholder";
  title: string;
  description: string;
  hintFilename?: string;
}

export interface KeyValueBlock {
  kind: "keyvalue";
  caption?: string;
  rows: Array<{ key: string; value: string }>;
}

export interface StructuredContent {
  kind: "blocks";
  blocks: ContentBlock[];
}
