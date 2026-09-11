"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useStudioThemeContext } from "@/components/studio-landing/theme-context";
import type { ContentBlock } from "@/lib/etude-blocks";
import {
  generateEtudeSection,
  getEtude,
  patchEtudeSection,
  unlockEtudeSection,
  type EtudeSectionRecord,
  type EtudeView,
} from "@/lib/etudes-api";

interface EtudeWorkspaceProps {
  etudeId: string;
}

export function EtudeWorkspace({ etudeId }: EtudeWorkspaceProps) {
  const { theme, toggle } = useStudioThemeContext();
  const isDark = theme === "dark";

  const [etude, setEtude] = useState<EtudeView | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busySectionId, setBusySectionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState<string>("");
  const [editorDirty, setEditorDirty] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const handleExportPdf = useCallback(async () => {
    if (!etude || pdfBusy) return;
    setPdfBusy(true);
    try {
      const { exportEtudePdf } = await import(
        "@/components/studio-landing/etude-export"
      );
      await exportEtudePdf(etude);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPdfBusy(false);
    }
  }, [etude, pdfBusy]);

  const loadEtude = useCallback(async () => {
    try {
      const next = await getEtude(etudeId);
      setEtude(next);
      setActiveId((current) => current ?? next.catalog[0]?.id ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [etudeId]);

  useEffect(() => {
    void loadEtude();
  }, [loadEtude]);

  const activeSection = useMemo(() => {
    if (!etude || !activeId) return null;
    return etude.sections[activeId] ?? null;
  }, [etude, activeId]);

  const activeDescriptor = useMemo(() => {
    if (!etude || !activeId) return null;
    return etude.catalog.find((entry) => entry.id === activeId) ?? null;
  }, [etude, activeId]);

  // Keep editor textarea in sync with active section content.
  useEffect(() => {
    setEditorContent(formatContent(activeSection));
    setEditorDirty(false);
  }, [activeSection]);

  const handleGenerate = useCallback(
    async (sectionId: string) => {
      if (busySectionId) return;
      setBusySectionId(sectionId);
      try {
        const next = await generateEtudeSection(etudeId, sectionId);
        setEtude(next);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusySectionId(null);
      }
    },
    [etudeId, busySectionId],
  );

  const handleSaveEdit = useCallback(
    async (lock: boolean) => {
      if (!activeId) return;
      setBusySectionId(activeId);
      try {
        const parsed = parseEditorContent(editorContent);
        const next = await patchEtudeSection(etudeId, activeId, {
          content: parsed,
          note: lock ? "verrouillée par l'opérateur" : undefined,
          lock,
        });
        setEtude(next);
        setEditorDirty(false);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusySectionId(null);
      }
    },
    [activeId, editorContent, etudeId],
  );

  const handleUnlock = useCallback(async () => {
    if (!activeId) return;
    setBusySectionId(activeId);
    try {
      const next = await unlockEtudeSection(etudeId, activeId);
      setEtude(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusySectionId(null);
    }
  }, [activeId, etudeId]);

  const baseClass = isDark
    ? "min-h-screen bg-[#04070a] text-[#edf3ee]"
    : "min-h-screen bg-[#f5f3ec] text-[#1b2322]";

  if (error && !etude) {
    return (
      <div className={`${baseClass} p-6`}>
        <p className="text-sm text-red-400">{error}</p>
        <Link className="mt-4 inline-block text-sm underline" href="/studio">
          ← Retour au studio
        </Link>
      </div>
    );
  }

  if (!etude) {
    return (
      <div className={`${baseClass} p-6`}>
        <p className="text-sm">Chargement de l’étude…</p>
      </div>
    );
  }

  return (
    <div className={baseClass}>
      <header
        className={`flex items-center justify-between border-b px-6 py-3 ${
          isDark ? "border-white/10" : "border-black/10"
        }`}
      >
        <div className="flex items-center gap-4">
          <Link
            className={`text-xs font-semibold uppercase tracking-[0.2em] ${
              isDark ? "text-[#9eb1a4]" : "text-[#5e6962]"
            }`}
            href="/studio"
          >
            ← Studio
          </Link>
          <div>
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] opacity-70">
              Étude carrefour · {etude.scope}
            </p>
            <p className="text-base font-semibold">{etude.intersectionLabel}</p>
            <p className="text-[0.7rem] opacity-70">
              {etude.intersectionCode ?? "code à attribuer"} ·{" "}
              {etude.generationMode === "claude" ? "Claude" : "hors-ligne"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={pdfBusy}
            className={`rounded-full border px-3 py-1 text-[0.7rem] font-semibold transition ${
              isDark
                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
                : "border-emerald-700/30 bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
            } disabled:opacity-50`}
          >
            {pdfBusy ? "Export en cours…" : "📑 Exporter PDF"}
          </button>
          <button
            type="button"
            onClick={toggle}
            className={`rounded-full border px-3 py-1 text-[0.7rem] font-semibold ${
              isDark
                ? "border-white/15 hover:border-white/30"
                : "border-black/15 hover:bg-white"
            }`}
          >
            {isDark ? "Mode clair" : "Mode sombre"}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-[280px_1fr] gap-0">
        <aside
          className={`border-r px-3 py-4 ${
            isDark ? "border-white/10" : "border-black/10"
          }`}
        >
          <p className="px-2 text-[0.58rem] font-semibold uppercase tracking-[0.24em] opacity-60">
            Sections
          </p>
          <nav className="mt-2 flex flex-col gap-1">
            {etude.catalog.map((entry) => {
              const record = etude.sections[entry.id];
              const status = record?.status ?? "pending";
              const isActive = entry.id === activeId;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setActiveId(entry.id)}
                  className={`flex flex-col items-start gap-0.5 rounded-[10px] px-3 py-2 text-left transition ${
                    isActive
                      ? isDark
                        ? "bg-white/10"
                        : "bg-[#1b2322] text-white"
                      : isDark
                        ? "hover:bg-white/5"
                        : "hover:bg-black/5"
                  }`}
                >
                  <span className="text-[0.78rem] font-semibold">{entry.title}</span>
                  <span className="text-[0.6rem] uppercase tracking-[0.18em] opacity-70">
                    {statusLabel(status)}
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="px-6 py-6">
          {activeDescriptor && activeSection ? (
            <SectionView
              descriptor={activeDescriptor}
              section={activeSection}
              isDark={isDark}
              busy={busySectionId === activeDescriptor.id}
              editorContent={editorContent}
              editorDirty={editorDirty}
              onEditorChange={(next) => {
                setEditorContent(next);
                setEditorDirty(true);
              }}
              onGenerate={() => handleGenerate(activeDescriptor.id)}
              onSave={() => handleSaveEdit(false)}
              onLock={() => handleSaveEdit(true)}
              onUnlock={handleUnlock}
            />
          ) : (
            <p className="text-sm opacity-70">Sélectionnez une section.</p>
          )}
          {error ? (
            <p className="mt-3 text-xs text-red-400">{error}</p>
          ) : null}
        </main>
      </div>
    </div>
  );
}

interface SectionViewProps {
  descriptor: EtudeView["catalog"][number];
  section: EtudeSectionRecord;
  isDark: boolean;
  busy: boolean;
  editorContent: string;
  editorDirty: boolean;
  onEditorChange: (next: string) => void;
  onGenerate: () => void;
  onSave: () => void;
  onLock: () => void;
  onUnlock: () => void;
}

function SectionView({
  descriptor,
  section,
  isDark,
  busy,
  editorContent,
  editorDirty,
  onEditorChange,
  onGenerate,
  onSave,
  onLock,
  onUnlock,
}: SectionViewProps) {
  const locked = section.status === "locked";
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] opacity-60">
            Section · v{section.version} · {statusLabel(section.status)}
          </p>
          <h2 className="mt-1 text-xl font-semibold">{descriptor.title}</h2>
          <p className="mt-1 text-sm opacity-80">{descriptor.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onGenerate}
            disabled={busy || locked}
            className="rounded-[8px] border border-[#5a4218] bg-gradient-to-b from-[#ffc45c] to-[#c38a29] px-3 py-1.5 text-[0.72rem] font-semibold text-[#120a02] transition hover:brightness-110 disabled:opacity-50"
          >
            {section.status === "pending" ? "Générer" : "Régénérer"}
          </button>
          {locked ? (
            <button
              type="button"
              onClick={onUnlock}
              disabled={busy}
              className={`rounded-[8px] border px-3 py-1.5 text-[0.72rem] font-semibold ${
                isDark
                  ? "border-white/20 hover:border-white/40"
                  : "border-black/20 hover:bg-black/5"
              }`}
            >
              Déverrouiller
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onSave}
                disabled={busy || !editorDirty}
                className={`rounded-[8px] border px-3 py-1.5 text-[0.72rem] font-semibold ${
                  isDark
                    ? "border-white/20 hover:border-white/40"
                    : "border-black/20 hover:bg-black/5"
                } disabled:opacity-40`}
              >
                Enregistrer
              </button>
              <button
                type="button"
                onClick={onLock}
                disabled={busy}
                className={`rounded-[8px] border px-3 py-1.5 text-[0.72rem] font-semibold ${
                  isDark
                    ? "border-white/20 hover:border-white/40"
                    : "border-black/20 hover:bg-black/5"
                }`}
              >
                Verrouiller
              </button>
            </>
          )}
        </div>
      </div>

      {section.content ? (
        <SectionPreview content={section.content} isDark={isDark} />
      ) : (
        <p className="text-sm opacity-70">
          Aucun contenu généré — cliquez sur <strong>Générer</strong> pour
          obtenir un gabarit.
        </p>
      )}

      <div>
        <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] opacity-60">
          Contenu brut (JSON)
        </p>
        <textarea
          value={editorContent}
          onChange={(event) => onEditorChange(event.target.value)}
          spellCheck={false}
          disabled={locked}
          className={`mt-1 h-72 w-full rounded-[10px] border p-3 font-mono text-[0.78rem] leading-snug ${
            isDark
              ? "border-white/10 bg-[#07100d] text-[#edf3ee]"
              : "border-black/15 bg-white text-[#1b2322]"
          } disabled:opacity-60`}
        />
      </div>

      {section.edits.length > 0 ? (
        <div>
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] opacity-60">
            Historique
          </p>
          <ul className="mt-1 space-y-0.5 text-[0.72rem] opacity-80">
            {section.edits.slice(-5).reverse().map((entry, idx) => (
              <li key={`${entry.at}-${idx}`}>
                {new Date(entry.at).toLocaleString("fr-FR")} — {entry.note}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

interface SectionPreviewProps {
  content: Record<string, unknown>;
  isDark: boolean;
}

function SectionPreview({ content, isDark }: SectionPreviewProps) {
  if (content.kind === "blocks" && Array.isArray(content.blocks)) {
    return (
      <BlocksRenderer
        blocks={content.blocks as ContentBlock[]}
        isDark={isDark}
      />
    );
  }
  if (content.kind === "markdown" && typeof content.markdown === "string") {
    return (
      <pre
        className={`whitespace-pre-wrap rounded-[10px] border p-4 text-[0.82rem] leading-relaxed ${
          isDark
            ? "border-white/10 bg-[#0a1014]"
            : "border-black/10 bg-white"
        }`}
      >
        {content.markdown}
      </pre>
    );
  }
  if (content.kind === "table" && Array.isArray(content.rows)) {
    const rows = content.rows as Array<Record<string, unknown>>;
    const columns = Array.isArray(content.columns)
      ? (content.columns as string[])
      : Object.keys(rows[0] ?? {});
    return (
      <div
        className={`overflow-hidden rounded-[10px] border ${
          isDark ? "border-white/10" : "border-black/10"
        }`}
      >
        <table className="min-w-full text-[0.78rem]">
          <thead className={isDark ? "bg-white/5" : "bg-black/5"}>
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  className="px-3 py-2 text-left font-semibold uppercase tracking-[0.14em] opacity-70"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={idx}
                className={
                  idx % 2 === 0
                    ? isDark
                      ? ""
                      : ""
                    : isDark
                      ? "bg-white/[0.025]"
                      : "bg-black/[0.025]"
                }
              >
                {columns.map((column) => (
                  <td key={column} className="px-3 py-2">
                    {String(row[column] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <pre
      className={`whitespace-pre-wrap rounded-[10px] border p-4 font-mono text-[0.78rem] ${
        isDark
          ? "border-white/10 bg-[#0a1014]"
          : "border-black/10 bg-white"
      }`}
    >
      {JSON.stringify(content, null, 2)}
    </pre>
  );
}

function statusLabel(status: EtudeSectionRecord["status"]): string {
  switch (status) {
    case "generated":
      return "généré";
    case "edited":
      return "édité";
    case "locked":
      return "verrouillé";
    default:
      return "à générer";
  }
}

function formatContent(section: EtudeSectionRecord | null): string {
  if (!section || !section.content) return "";
  return JSON.stringify(section.content, null, 2);
}

function parseEditorContent(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch {
    return { kind: "markdown", markdown: raw };
  }
}

interface BlocksRendererProps {
  blocks: ContentBlock[];
  isDark: boolean;
}

function BlocksRenderer({ blocks, isDark }: BlocksRendererProps) {
  return (
    <div
      className={`space-y-3 rounded-[10px] border p-5 ${
        isDark ? "border-white/10 bg-[#0a1014]" : "border-black/10 bg-white"
      }`}
    >
      {blocks.map((block, idx) => (
        <BlockView key={idx} block={block} isDark={isDark} />
      ))}
    </div>
  );
}

function BlockView({
  block,
  isDark,
}: {
  block: ContentBlock;
  isDark: boolean;
}) {
  switch (block.kind) {
    case "heading": {
      const sizes = {
        1: "text-xl font-semibold",
        2: "text-lg font-semibold mt-3",
        3: "text-base font-semibold mt-2",
      } as const;
      return <p className={sizes[block.level]}>{block.text}</p>;
    }
    case "paragraph":
      return (
        <p className="text-[0.86rem] leading-relaxed opacity-90">
          {block.text}
        </p>
      );
    case "note":
      return (
        <p
          className={`rounded-[8px] border-l-2 px-3 py-2 text-[0.78rem] italic opacity-90 ${
            isDark
              ? "border-amber-400/60 bg-amber-500/5"
              : "border-amber-600/60 bg-amber-50"
          }`}
        >
          {block.text}
        </p>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag
          className={`space-y-1 pl-5 text-[0.84rem] opacity-90 ${
            block.ordered ? "list-decimal" : "list-disc"
          }`}
        >
          {block.items.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </Tag>
      );
    }
    case "table": {
      const tBlock = block;
      const alignClass = (a?: "left" | "right" | "center") =>
        a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";
      return (
        <div>
          {tBlock.caption ? (
            <p className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] opacity-70">
              {tBlock.caption}
            </p>
          ) : null}
          <div
            className={`overflow-hidden rounded-[8px] border ${
              isDark ? "border-white/10" : "border-black/15"
            }`}
          >
            <table className="min-w-full text-[0.78rem]">
              <thead className={isDark ? "bg-white/5" : "bg-black/5"}>
                <tr>
                  {tBlock.columns.map((column) => (
                    <th
                      key={column.key}
                      className={`px-3 py-2 font-semibold uppercase tracking-[0.14em] opacity-70 ${alignClass(column.align)}`}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tBlock.rows.map((row, idx) => (
                  <tr
                    key={idx}
                    className={
                      idx % 2 === 1
                        ? isDark
                          ? "bg-white/[0.025]"
                          : "bg-black/[0.025]"
                        : ""
                    }
                  >
                    {tBlock.columns.map((column) => (
                      <td
                        key={column.key}
                        className={`px-3 py-2 ${alignClass(column.align)}`}
                      >
                        {row[column.key] === null || row[column.key] === undefined
                          ? "—"
                          : String(row[column.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
    case "code":
      return (
        <pre
          className={`overflow-x-auto rounded-[8px] border p-3 font-mono text-[0.74rem] ${
            isDark
              ? "border-white/10 bg-black/40"
              : "border-black/10 bg-[#f3f1ea]"
          }`}
        >
          {block.text}
        </pre>
      );
    case "placeholder":
      return (
        <div
          className={`rounded-[8px] border border-dashed p-3 text-[0.78rem] ${
            isDark
              ? "border-white/20 bg-white/[0.02]"
              : "border-black/20 bg-black/[0.02]"
          }`}
        >
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] opacity-70">
            📎 Annexe à insérer · {block.title}
          </p>
          <p className="mt-1 opacity-80">{block.description}</p>
          {block.hintFilename ? (
            <p className="mt-1 font-mono text-[0.7rem] opacity-60">
              Fichier suggéré : {block.hintFilename}
            </p>
          ) : null}
        </div>
      );
    case "keyvalue":
      return (
        <div>
          {block.caption ? (
            <p className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] opacity-70">
              {block.caption}
            </p>
          ) : null}
          <dl
            className={`grid grid-cols-[160px_1fr] gap-x-3 gap-y-1 rounded-[8px] border p-3 text-[0.82rem] ${
              isDark ? "border-white/10" : "border-black/15"
            }`}
          >
            {block.rows.map((row, idx) => (
              <div key={idx} className="contents">
                <dt className="opacity-70">{row.key}</dt>
                <dd className="font-medium">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      );
    default:
      return null;
  }
}
