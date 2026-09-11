/**
 * Helpers for Google Maps Static API — used to embed real geographic
 * imagery (satellite + roads) inside the étude PDF.
 *
 * Requires the public Google Maps API key
 * (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) and the Maps Static API to be
 * enabled on the Google Cloud project.
 *
 * The fetch happens in the browser before PDF rendering ; we convert
 * the PNG to a base64 data URI so `@react-pdf/renderer`'s <Image>
 * embeds it natively (no in-PDF CORS / fetch).
 */

export interface StaticMapOptions {
  apiKey: string;
  center: { lat: number; lng: number };
  /** Google zoom level. 16-18 covers a typical urban intersection. */
  zoom: number;
  /** Output size, in pixels, before scale. Max free is 640x640. */
  size: { w: number; h: number };
  /** 1 or 2 — scale=2 gives a high-DPI render at the same zoom. */
  scale?: 1 | 2;
  maptype?: "roadmap" | "satellite" | "hybrid" | "terrain";
  /** Append a red dot marker at center. */
  marker?: boolean;
  /** Optional path (lat,lng) pairs to draw a polyline overlay. */
  path?: Array<{ lat: number; lng: number }>;
}

const BASE_URL = "https://maps.googleapis.com/maps/api/staticmap";

export function buildStaticMapUrl(options: StaticMapOptions): string {
  const params = new URLSearchParams();
  params.set("center", `${options.center.lat},${options.center.lng}`);
  params.set("zoom", String(options.zoom));
  params.set("size", `${options.size.w}x${options.size.h}`);
  params.set("scale", String(options.scale ?? 2));
  params.set("maptype", options.maptype ?? "hybrid");
  if (options.marker !== false) {
    params.set(
      "markers",
      `color:red|size:mid|${options.center.lat},${options.center.lng}`,
    );
  }
  if (options.path && options.path.length > 1) {
    const path = options.path
      .map((point) => `${point.lat},${point.lng}`)
      .join("|");
    params.set("path", `weight:3|color:0xffd64dff|${path}`);
  }
  params.set("key", options.apiKey);
  return `${BASE_URL}?${params.toString()}`;
}

/**
 * Fetch an image URL and convert it to a base64 data URI. Returns
 * null on failure (network error, non-200, CORS) so callers can fall
 * back to a synthetic rendering.
 */
export async function fetchAsDataUri(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () =>
        reject(reader.error ?? new Error("FileReader failed"));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
