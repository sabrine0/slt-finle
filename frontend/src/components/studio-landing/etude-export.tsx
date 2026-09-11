"use client";

/**
 * Étude carrefour export — generates the dossier PDF (page de garde,
 * sommaire, sections, drawings, pagination) from a live `EtudeView`
 * and triggers a browser download.
 *
 * The renderer is dynamically imported so the étude page bundle stays
 * slim for operators who never export. Before rendering we fetch the
 * real satellite tile for the carrefour from the Google Maps Static
 * API and convert it to a base64 data URI so it's embedded natively
 * in the PDF (no in-PDF network).
 */

import { buildStaticMapUrl, fetchAsDataUri } from "@/lib/static-map";
import type { EtudeView } from "@/lib/etudes-api";
import type { EtudePdfAssets } from "@/components/studio-landing/etude-pdf";

async function prefetchSituationMap(
  etude: EtudeView,
): Promise<EtudePdfAssets> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const lat = etude.latitude;
  const lng = etude.longitude;
  if (!apiKey || lat == null || lng == null) {
    return {
      situationMapDataUri: null,
      situationMapInsetDataUri: null,
      situationMapZoom: 17,
    };
  }

  // Two tiles for sheet 01 (Plan de situation) :
  //   - main : zoom 17 hybrid (1 km of context)
  //   - inset : zoom 14 roadmap (4 km context)
  const situationUrl = buildStaticMapUrl({
    apiKey,
    center: { lat, lng },
    zoom: 17,
    size: { w: 640, h: 440 },
    scale: 2,
    maptype: "hybrid",
    marker: true,
  });
  const insetUrl = buildStaticMapUrl({
    apiKey,
    center: { lat, lng },
    zoom: 14,
    size: { w: 220, h: 220 },
    scale: 2,
    maptype: "roadmap",
    marker: true,
  });

  const [situationUri, insetUri] = await Promise.all([
    fetchAsDataUri(situationUrl),
    fetchAsDataUri(insetUrl),
  ]);
  return {
    situationMapDataUri: situationUri,
    situationMapInsetDataUri: insetUri,
    situationMapZoom: 17,
  };
}

export async function exportEtudePdf(etude: EtudeView): Promise<string> {
  const [{ pdf }, { EtudePdfDocument }, assets] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/studio-landing/etude-pdf"),
    prefetchSituationMap(etude),
  ]);

  const blob = await pdf(
    <EtudePdfDocument etude={etude} assets={assets} />,
  ).toBlob();

  const filename = `Dossier-Regulation_${safeSlug(
    etude.intersectionCode ?? etude.id,
  )}_${today()}.pdf`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

function safeSlug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .toUpperCase();
}

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
