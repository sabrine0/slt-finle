"use client";

/**
 * Data-driven administrative boundaries for Morocco's 12 regions.
 *
 * Uses Google Maps' built-in FeatureLayer for
 * `ADMINISTRATIVE_AREA_LEVEL_1`, which paints the REAL region
 * polygons (not bounding boxes).  Google maintains the geometry;
 * we only style + listen for clicks.
 *
 * Requirements (done once in Google Cloud Console):
 *   1. Create a vector Map ID.
 *   2. Enable the "Administrative Area Level 1" feature layer
 *      on that Map ID.
 *   3. Set env var `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=<map-id>`.
 *
 * Graceful fallback: when the env var is absent or the feature layer
 * isn't configured, this component no-ops and the caller keeps its
 * existing PolygonF rectangles.
 */

import { useEffect } from "react";
import { useGoogleMap } from "@react-google-maps/api";

import type { RegionPolygon } from "@/components/command-platform/types";
import type { IntersectionHealth } from "@/types/command-platform";

const TONE_TO_COLOR: Record<IntersectionHealth, string> = {
  healthy: "#39d98a",
  watch: "#ffb547",
  critical: "#ff5f5f",
};

interface AdminBoundariesProps {
  regions: RegionPolygon[];
  focusRegionId?: string | null;
  hoveredRegionId?: string | null;
  onSelectRegion?: (regionId: string) => void;
  onHoverRegion?: (regionId: string | null) => void;
}

export function AdminBoundaries({
  regions,
  focusRegionId,
  hoveredRegionId,
  onSelectRegion,
  onHoverRegion,
}: AdminBoundariesProps) {
  const map = useGoogleMap();

  useEffect(() => {
    if (!map) return;
    if (typeof google === "undefined" || !google.maps?.FeatureType) return;

    let featureLayer: google.maps.FeatureLayer | undefined;
    try {
      featureLayer = map.getFeatureLayer(
        google.maps.FeatureType.ADMINISTRATIVE_AREA_LEVEL_1,
      );
    } catch {
      // Map ID not configured — fall back (caller keeps rectangles).
      return;
    }
    if (!featureLayer) return;

    // Normalise names so "Tanger-Tétouan-Al Hoceïma" matches Google's
    // displayName regardless of accent / spacing variants.
    const normalise = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    const regionByName = new Map<string, RegionPolygon>();
    for (const r of regions) regionByName.set(normalise(r.name), r);

    featureLayer.style = (options) => {
      // feature.displayName is the localised region name
      const feature = options.feature as google.maps.PlaceFeature & {
        displayName?: string;
      };
      const name = normalise(feature.displayName ?? "");
      const region = regionByName.get(name);
      if (!region) return null; // not a Moroccan region we track

      const color = TONE_TO_COLOR[region.tone];
      const isFocus = region.id === focusRegionId;
      const isHover = region.id === hoveredRegionId;
      const isWorst = region.isWorst;

      return {
        strokeColor: color,
        strokeOpacity: isFocus || isHover ? 0.95 : isWorst ? 0.8 : 0.55,
        strokeWeight: isFocus ? 3 : isHover ? 2.4 : isWorst ? 2 : 1.4,
        fillColor: color,
        fillOpacity: isFocus
          ? 0.35
          : isHover
            ? 0.3
            : isWorst
              ? 0.22
              : 0.14,
      };
    };

    const clickListener = featureLayer.addListener(
      "click",
      (event: { features?: Array<{ displayName?: string }> }) => {
        const feature = event.features?.[0];
        if (!feature) return;
        const name = normalise(feature.displayName ?? "");
        const region = regionByName.get(name);
        if (region) onSelectRegion?.(region.id);
      },
    );

    // Google doesn't expose hover out of the box, but we can piggy-back
    // on mousemove if the platform wants it.  Keep it simple for now.
    void onHoverRegion;

    return () => {
      if (featureLayer) featureLayer.style = null;
      if (clickListener && typeof clickListener.remove === "function") {
        clickListener.remove();
      }
    };
  }, [map, regions, focusRegionId, hoveredRegionId, onSelectRegion, onHoverRegion]);

  return null;
}
