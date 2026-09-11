"use client";

/**
 * Dossier export — generates a PDF blob from a Studio intersection
 * config and triggers a browser download.
 *
 * The heavy PDF renderer lives behind a dynamic import so the main
 * Studio bundle isn't bloated for operators who never use export.
 */

import type { IntersectionConfig } from "@/components/studio/state/types";

export type DossierKind = "regulation" | "cablage";

export interface ExportDossierOptions {
  kind: DossierKind;
  projectName?: string;
  client?: string;
  revision?: string;
}

export async function exportDossierPdf(
  config: IntersectionConfig,
  options: ExportDossierOptions,
): Promise<string> {
  // Dynamic-import React-PDF renderer + the dossier component so the
  // initial Studio bundle stays slim.
  const [{ pdf }, { DossierPDF }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/studio/dossier/dossier-pdf"),
  ]);

  const blob = await pdf(
    <DossierPDF
      config={config}
      kind={options.kind}
      projectName={options.projectName}
      client={options.client}
      revision={options.revision}
    />,
  ).toBlob();

  const filename = `${options.kind === "cablage" ? "Dossier-cablage" : "Dossier-regulation"}_${safeSlug(
    config.code ?? config.id,
  )}_${today()}.pdf`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoke soon so the browser releases memory, but leave enough time
  // for the download dialog to latch on.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return filename;
}

function safeSlug(input: string): string {
  return input.replace(/[^A-Za-z0-9-_]/g, "-").replace(/-+/g, "-");
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}
