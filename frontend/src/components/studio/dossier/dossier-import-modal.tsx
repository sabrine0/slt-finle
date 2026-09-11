"use client";

import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ParsedDossier } from "@/components/studio/dossier/dossier-parse";
import type { IntersectionConfig } from "@/components/studio/state/types";

interface DossierImportModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the parsed config once the operator confirms.  The
   *  parent dispatches the store replacement and decides whether to
   *  open a new tab. */
  onApply: (config: IntersectionConfig) => void;
  /** When set, the parsed config is forced onto this intersection id
   *  (REPLACE flow, launched from the intersection editor header).
   *  When omitted, the parser's inferred id (from the dossier cover
   *  / filename) is kept and the parent treats this as a CREATE flow
   *  (launched from the Studio splash). */
  targetIntersectionId?: string;
}

type Phase = "idle" | "parsing" | "preview" | "error";

export function DossierImportModal({
  open,
  onClose,
  onApply,
  targetIntersectionId,
}: DossierImportModalProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [parsed, setParsed] = useState<ParsedDossier | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset state each time the modal opens so operator can retry cleanly.
  useEffect(() => {
    if (open) {
      setPhase("idle");
      setParsed(null);
      setErrorText(null);
      // Reset the file input so re-selecting the same file fires onChange.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [open]);

  const handlePickFile = useCallback(async (file: File) => {
    setPhase("parsing");
    setErrorText(null);
    try {
      const { parseDossierPdf } = await import(
        "@/components/studio/dossier/dossier-parse"
      );
      const result = await parseDossierPdf(file);
      setParsed(result);
      if (result.ok) {
        setPhase("preview");
      } else {
        setPhase("error");
        setErrorText(result.errors.join(" · "));
      }
    } catch (err) {
      setPhase("error");
      setErrorText(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }, []);

  const onInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      void handlePickFile(file);
    },
    [handlePickFile],
  );

  const applyConfig = useCallback(() => {
    if (!parsed) return;
    // REPLACE flow (target pinned) → force the existing intersection's
    // id.  CREATE flow (no target) → keep the parser's inferred id so
    // the new intersection gets a meaningful code from the cover page.
    const config: IntersectionConfig = targetIntersectionId
      ? { ...parsed.config, id: targetIntersectionId }
      : parsed.config;
    onApply(config);
    onClose();
  }, [parsed, targetIntersectionId, onApply, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dossier-import-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-[10px] border border-stroke-1 bg-surface-1 text-ink-1 shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
        <header className="flex items-center justify-between gap-3 border-b border-stroke-0 px-4 py-3">
          <div>
            <p
              id="dossier-import-title"
              className="text-[0.62rem] font-semibold uppercase tracking-[0.24em] text-ink-3"
            >
              Importer un dossier PDF
            </p>
            <h2 className="mt-0.5 text-[1rem] font-semibold text-ink-0">
              Dossier de régulation → configuration carrefour
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="grid h-7 w-7 place-items-center rounded-[5px] text-ink-2 transition hover:bg-hover hover:text-ink-0"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-[0.82rem]">
          {phase === "idle" ? (
            <DropZone
              onPick={handlePickFile}
              fileInputRef={fileInputRef}
              onInputChange={onInputChange}
            />
          ) : null}

          {phase === "parsing" ? (
            <div className="grid place-items-center py-10">
              <div className="stls-soft-blink font-mono text-[0.78rem] text-accent-ink">
                Analyse du PDF…
              </div>
            </div>
          ) : null}

          {phase === "error" ? (
            <div className="rounded-[8px] border border-danger-stroke bg-danger-surface/60 px-3 py-2 text-[0.76rem] leading-5 text-danger-ink">
              Échec de l&apos;analyse — {errorText ?? "erreur inconnue"}
              <button
                type="button"
                onClick={() => setPhase("idle")}
                className="ml-3 rounded-[4px] border border-danger-stroke bg-danger-surface px-2 py-px text-[0.68rem] font-semibold uppercase tracking-[0.16em]"
              >
                Recommencer
              </button>
            </div>
          ) : null}

          {phase === "preview" && parsed ? (
            <PreviewSummary parsed={parsed} />
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-stroke-0 bg-surface-2 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[6px] border border-stroke-1 bg-surface-3 px-3 py-1.5 text-[0.74rem] font-medium text-ink-1 hover:border-stroke-2 hover:text-ink-0"
          >
            Annuler
          </button>
          {phase === "preview" && parsed?.ok ? (
            <button
              type="button"
              onClick={applyConfig}
              className="rounded-[6px] border border-accent-stroke bg-gradient-to-b from-[var(--stls-accent)] to-[var(--stls-accent-ink)] px-3 py-1.5 text-[0.74rem] font-semibold text-accent-surface shadow-[0_3px_10px_rgba(255,181,71,0.22)] hover:brightness-110"
            >
              {targetIntersectionId
                ? `Appliquer au carrefour ${targetIntersectionId}`
                : `Créer le carrefour ${parsed.config.id}`}
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}

// ──────────────────────────── Drop zone

function DropZone({
  onPick,
  fileInputRef,
  onInputChange,
}: {
  onPick: (file: File) => void;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  onInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file && file.type === "application/pdf") onPick(file);
      }}
      className={clsx(
        "flex flex-col items-center justify-center gap-3 rounded-[10px] border-2 border-dashed px-6 py-12 text-center transition",
        dragging
          ? "border-accent-stroke bg-accent-surface/40 text-accent-ink"
          : "border-stroke-1 bg-surface-2 text-ink-2",
      )}
    >
      <span aria-hidden className="text-[1.6rem] leading-none">
        ⬆
      </span>
      <p className="text-[0.82rem] text-ink-1">
        Glissez un dossier PDF ici, ou
      </p>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="rounded-[6px] border border-stroke-1 bg-surface-3 px-3 py-1.5 text-[0.74rem] font-medium text-ink-1 hover:border-stroke-2 hover:text-ink-0"
      >
        Sélectionner un fichier…
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={onInputChange}
      />
      <p className="mt-1 text-[0.66rem] text-ink-3">
        Parsing 100 % navigateur — le PDF ne quitte pas votre poste.
      </p>
    </div>
  );
}

// ──────────────────────────── Preview summary

function PreviewSummary({ parsed }: { parsed: ParsedDossier }) {
  const c = parsed.config;
  return (
    <div className="space-y-3">
      {parsed.warnings.length > 0 ? (
        <div className="rounded-[6px] border border-sig-yellow-stroke bg-sig-yellow-surface/60 px-3 py-1.5 text-[0.72rem] text-sig-yellow-ink">
          ⚠ {parsed.warnings.join(" · ")}
        </div>
      ) : null}

      <Grid>
        <Tile
          title="Identité"
          confidence={parsed.confidence.identity}
          rows={[
            ["Code", c.id],
            ["Nom", c.identity.name],
            ["Contrôleur", c.controllerId],
            ["District", c.identity.district || "—"],
          ]}
        />
        <Tile
          title="Approches"
          confidence={parsed.confidence.approaches}
          rows={[
            ["Nombre", String(c.approaches.length)],
            [
              "Bearings",
              c.approaches.map((a) => a.bearing).join(", ") || "—",
            ],
          ]}
        />
      </Grid>

      <Tile
        title={`Groupes de feux · ${c.signalGroups.length}`}
        confidence={parsed.confidence.signalGroups}
      >
        {c.signalGroups.length === 0 ? (
          <p className="text-[0.72rem] text-ink-3">Aucun groupe reconnu.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[0.72rem]">
            {c.signalGroups.map((sg, idx) => (
              <li key={`${sg.id}#${idx}`} className="flex items-baseline gap-2">
                <span className="font-mono text-sig-yellow-ink">{sg.id}</span>
                <span className="truncate text-ink-1">{sg.label}</span>
              </li>
            ))}
          </ul>
        )}
      </Tile>

      <Tile
        title={`Phases · ${c.phases.length}`}
        confidence={parsed.confidence.phases}
      >
        {c.phases.length === 0 ? (
          <p className="text-[0.72rem] text-ink-3">Aucune phase reconnue.</p>
        ) : (
          <ul className="space-y-1 text-[0.72rem]">
            {c.phases.map((p, idx) => (
              <li key={`${p.id}#${idx}`}>
                <span className="font-mono text-accent-ink">{p.id}</span>{" "}
                <span className="text-ink-1">
                  — {p.greenSignalGroupIds.join(", ") || "aucun vert"}
                </span>
                <span className="ml-1 text-ink-3">
                  ({p.minGreenSeconds}/{p.yellowSeconds}/
                  {p.redClearanceSeconds}s)
                </span>
              </li>
            ))}
          </ul>
        )}
      </Tile>

      <Grid>
        <Tile
          title={`Détecteurs · ${c.detectors.length}`}
          confidence={parsed.confidence.detectors}
        >
          {c.detectors.length === 0 ? (
            <p className="text-[0.72rem] text-ink-3">—</p>
          ) : (
            <ul className="text-[0.7rem] text-ink-1">
              {c.detectors.map((d, idx) => (
                <li key={`${d.id}#${idx}`}>
                  <span className="font-mono text-info-ink">{d.id}</span> ·{" "}
                  {d.label} · {d.channel}
                </li>
              ))}
            </ul>
          )}
        </Tile>
        <Tile
          title={`Conflits candidats · ${c.conflicts.length}`}
          confidence={parsed.confidence.conflicts}
        >
          <p className="text-[0.7rem] text-ink-2">
            Dérivés automatiquement des phases (paires qui ne sont jamais
            vertes ensemble). À affiner dans la matrice après application.
          </p>
        </Tile>
      </Grid>

      <p className="text-[0.66rem] leading-4 text-ink-3">
        En cliquant <strong>Appliquer</strong>, la configuration du carrefour
        sélectionné sera remplacée par cette lecture. Les sections manquantes
        (matrice dégagement, plans horaires, etc.) restent à compléter
        manuellement.
      </p>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

function Tile({
  title,
  confidence,
  rows,
  children,
}: {
  title: string;
  confidence: number;
  rows?: Array<[string, string]>;
  children?: React.ReactNode;
}) {
  const pct = Math.round(confidence * 100);
  const tone =
    confidence >= 0.7 ? "green" : confidence >= 0.4 ? "amber" : "red";
  return (
    <section className="rounded-[8px] border border-stroke-1 bg-surface-2 px-3 py-2">
      <header className="flex items-baseline justify-between gap-2">
        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
          {title}
        </p>
        <span
          className={clsx(
            "rounded-[3px] border px-1 py-px text-[0.55rem] font-semibold uppercase tracking-[0.14em]",
            tone === "green" &&
              "border-sig-green-stroke bg-sig-green-surface text-sig-green-ink",
            tone === "amber" &&
              "border-sig-yellow-stroke bg-sig-yellow-surface text-sig-yellow-ink",
            tone === "red" &&
              "border-danger-stroke bg-danger-surface text-danger-ink",
          )}
        >
          {pct}%
        </span>
      </header>
      <div className="mt-1.5">
        {rows ? (
          <dl className="space-y-0.5 text-[0.72rem]">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-ink-3">{k}</dt>
                <dd className="truncate text-ink-1">{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
