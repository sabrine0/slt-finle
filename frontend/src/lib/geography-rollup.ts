import type {
  BreadcrumbCrumb,
  CityMarker,
  DistrictChipInfo,
  RegionMarker,
  RegionPolygon,
  SelectedAreaSummary,
  SelectionPath,
} from "@/components/command-platform/types";
import {
  DEFAULT_LIVE_CITY_ID,
  DEFAULT_LIVE_REGION_ID,
  findCity,
  findDistrict,
  findRegion,
  moroccoGeography,
  type MoroccoCity,
  type MoroccoDistrict,
  type MoroccoRegion,
} from "@/lib/morocco-geography";
// Real ADM1 polygons sourced from geoBoundaries (public-domain) and
// Douglas-Peucker simplified to ~1.3 km tolerance so the dashboard map
// shows actual Moroccan region shapes instead of bounding rectangles.
import regionPolygonPaths from "@/lib/morocco-region-paths.json";
import type {
  CommandPlatformSnapshot,
  ConnectionState,
  IntersectionHealth,
  IntersectionMode,
  IntersectionSnapshot,
  TrafficFlowState,
} from "@/types/command-platform";

const emptyCongestionMix: Record<TrafficFlowState, number> = {
  smooth: 0,
  pressure: 0,
  congestion: 0,
};

const emptyControllerMix: Record<ConnectionState, number> = {
  online: 0,
  degraded: 0,
  offline: 0,
};

const emptyStatusMix: Record<IntersectionHealth, number> = {
  healthy: 0,
  watch: 0,
  critical: 0,
};

function normalizeGeoKey(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

export function findDistrictForIntersection(
  intersection: IntersectionSnapshot,
): MoroccoDistrict | undefined {
  const explicit = findDistrict(intersection.zoneId ?? undefined);
  if (explicit) return explicit;
  const key = intersection.district.trim().toLowerCase();
  for (const region of moroccoGeography.regions) {
    for (const city of region.cities) {
      for (const district of city.districts) {
        if (
          district.districtKeys.some(
            (candidate) => candidate.trim().toLowerCase() === key,
          )
        ) {
          return district;
        }
      }
    }
  }
  return undefined;
}

export function findCityForIntersection(
  intersection: IntersectionSnapshot,
): MoroccoCity | undefined {
  const explicit = findCity(intersection.cityId);
  if (explicit) return explicit;
  const district = findDistrictForIntersection(intersection);
  if (district) {
    return findCity(district.cityId);
  }
  const key = normalizeGeoKey(intersection.district);
  if (key) {
    for (const region of moroccoGeography.regions) {
      for (const city of region.cities) {
        if (
          normalizeGeoKey(city.name) === key ||
          normalizeGeoKey(city.nameAr) === key
        ) {
          return city;
        }
      }
    }
  }
  return findCity(DEFAULT_LIVE_CITY_ID);
}

export function findRegionForIntersection(
  intersection: IntersectionSnapshot,
): MoroccoRegion | undefined {
  const explicit = findRegion(intersection.regionId);
  if (explicit) return explicit;
  const city = findCityForIntersection(intersection);
  if (city) {
    return findRegion(city.regionId);
  }
  return findRegion(DEFAULT_LIVE_REGION_ID);
}

export function intersectionsInRegion(
  intersections: IntersectionSnapshot[],
  regionId: string,
): IntersectionSnapshot[] {
  return intersections.filter(
    (intersection) => findRegionForIntersection(intersection)?.id === regionId,
  );
}

export function intersectionsInCity(
  intersections: IntersectionSnapshot[],
  cityId: string,
): IntersectionSnapshot[] {
  return intersections.filter(
    (intersection) => findCityForIntersection(intersection)?.id === cityId,
  );
}

export function intersectionsInDistrict(
  intersections: IntersectionSnapshot[],
  districtId: string,
): IntersectionSnapshot[] {
  return intersections.filter(
    (intersection) => findDistrictForIntersection(intersection)?.id === districtId,
  );
}

function dominantCongestion(
  mix: Record<TrafficFlowState, number>,
): TrafficFlowState | null {
  if (mix.congestion > 0) return "congestion";
  if (mix.pressure > 0) return "pressure";
  if (mix.smooth > 0) return "smooth";
  return null;
}

function dominantMode(
  intersections: IntersectionSnapshot[],
): IntersectionMode | null {
  if (intersections.length === 0) return null;
  const tally = new Map<IntersectionMode, number>();
  for (const intersection of intersections) {
    tally.set(intersection.mode, (tally.get(intersection.mode) ?? 0) + 1);
  }
  let winner: IntersectionMode | null = null;
  let winnerCount = -1;
  for (const [mode, count] of tally) {
    if (count > winnerCount) {
      winner = mode;
      winnerCount = count;
    }
  }
  return winner;
}

function countIncidents(intersections: IntersectionSnapshot[]): number {
  return intersections.reduce(
    (total, intersection) => total + intersection.incidents,
    0,
  );
}

function aggregateMix(
  intersections: IntersectionSnapshot[],
  snapshot: CommandPlatformSnapshot,
) {
  const statusMix: Record<IntersectionHealth, number> = { ...emptyStatusMix };
  const congestionMix: Record<TrafficFlowState, number> = {
    ...emptyCongestionMix,
  };

  for (const intersection of intersections) {
    statusMix[intersection.status] += 1;
    if (intersection.status === "critical") {
      congestionMix.congestion += 1;
    } else if (intersection.status === "watch") {
      congestionMix.pressure += 1;
    } else {
      congestionMix.smooth += 1;
    }
  }

  const controllerMix: Record<ConnectionState, number> = {
    ...emptyControllerMix,
  };
  const intersectionIds = new Set(intersections.map((item) => item.id));
  for (const hardware of snapshot.hardware) {
    if (intersectionIds.has(hardware.intersectionId)) {
      controllerMix[hardware.connectionState] += 1;
    }
  }

  return { statusMix, congestionMix, controllerMix };
}

function toneFromStatusMix(
  statusMix: Record<IntersectionHealth, number>,
): IntersectionHealth {
  if (statusMix.critical > 0) return "critical";
  if (statusMix.watch > 0) return "watch";
  return "healthy";
}

function averageDelay(intersections: IntersectionSnapshot[]): number {
  if (intersections.length === 0) return 0;
  const total = intersections.reduce(
    (sum, intersection) => sum + intersection.averageDelaySeconds,
    0,
  );
  return Math.round(total / intersections.length);
}

function totalQueue(intersections: IntersectionSnapshot[]): number {
  return intersections.reduce(
    (sum, intersection) => sum + intersection.queueLength,
    0,
  );
}

const statusWeight: Record<IntersectionHealth, number> = {
  critical: 3,
  watch: 2,
  healthy: 1,
};

export function districtsInCity(
  cityId: string,
  snapshot: CommandPlatformSnapshot,
): DistrictChipInfo[] {
  const city = findCity(cityId);
  if (!city) return [];
  return city.districts.map((district) => {
    const intersections = intersectionsInDistrict(
      snapshot.intersections,
      district.id,
    );
    const { statusMix } = aggregateMix(intersections, snapshot);
    return {
      id: district.id,
      name: district.name,
      nameAr: district.nameAr,
      intersectionCount: intersections.length,
      incidentCount: countIncidents(intersections),
      worstStatus: toneFromStatusMix(statusMix),
      averageDelaySeconds: averageDelay(intersections),
    };
  });
}

export function worstDistrictIdForCity(
  cityId: string,
  snapshot: CommandPlatformSnapshot,
): string | undefined {
  const districts = districtsInCity(cityId, snapshot);
  if (districts.length === 0) return undefined;
  let winner: DistrictChipInfo | undefined;
  let winnerScore = -1;
  for (const district of districts) {
    const score =
      statusWeight[district.worstStatus] * 100 +
      district.incidentCount * 10 +
      district.averageDelaySeconds;
    if (score > winnerScore) {
      winner = district;
      winnerScore = score;
    }
  }
  return winner?.id;
}

export function worstRegionId(
  snapshot: CommandPlatformSnapshot,
): string | undefined {
  let winnerId: string | undefined;
  let winnerScore = -1;
  for (const region of moroccoGeography.regions) {
    const regionIntersections = intersectionsInRegion(
      snapshot.intersections,
      region.id,
    );
    if (regionIntersections.length === 0) continue;
    const { statusMix } = aggregateMix(regionIntersections, snapshot);
    const score =
      statusWeight[toneFromStatusMix(statusMix)] * 1000 +
      countIncidents(regionIntersections) * 10 +
      regionIntersections.filter(
        (intersection) => intersection.status === "critical",
      ).length;
    if (score > winnerScore) {
      winnerScore = score;
      winnerId = region.id;
    }
  }
  return winnerId;
}

export function buildRegionPolygons(
  snapshot: CommandPlatformSnapshot,
): RegionPolygon[] {
  const worstId = worstRegionId(snapshot);
  const paths = regionPolygonPaths as Record<
    string,
    Array<{ lat: number; lng: number }>
  >;
  return moroccoGeography.regions.map((region) => {
    const regionIntersections = intersectionsInRegion(
      snapshot.intersections,
      region.id,
    );
    const { statusMix } = aggregateMix(regionIntersections, snapshot);
    const realPaths = paths[region.id];
    // Prefer the real ADM1 polygon when we have geometry for this
    // region; fall back to the bounding rectangle so the dashboard
    // never renders blank if the lookup misses (defensive).
    const fallback = (() => {
      const { north, south, east, west } = region.bounds;
      return [
        { lat: north, lng: west },
        { lat: north, lng: east },
        { lat: south, lng: east },
        { lat: south, lng: west },
      ];
    })();
    return {
      id: region.id,
      name: region.name,
      nameAr: region.nameAr,
      paths: realPaths && realPaths.length > 2 ? realPaths : fallback,
      center: region.center,
      tone: toneFromStatusMix(statusMix),
      intersectionCount: regionIntersections.length,
      incidentCount: countIncidents(regionIntersections),
      isWorst: region.id === worstId,
    };
  });
}

export function buildRegionMarkers(
  snapshot: CommandPlatformSnapshot,
): RegionMarker[] {
  return moroccoGeography.regions.map((region) => {
    const regionIntersections = intersectionsInRegion(
      snapshot.intersections,
      region.id,
    );
    const { statusMix } = aggregateMix(regionIntersections, snapshot);
    return {
      id: region.id,
      name: region.name,
      nameAr: region.nameAr,
      center: region.center,
      intersectionCount: regionIntersections.length,
      tone: toneFromStatusMix(statusMix),
    };
  });
}

export function buildCityMarkers(
  snapshot: CommandPlatformSnapshot,
  regionId: string,
): CityMarker[] {
  const region = findRegion(regionId);
  if (!region) return [];
  return region.cities.map((city) => {
    const cityIntersections = intersectionsInCity(
      snapshot.intersections,
      city.id,
    );
    const { statusMix } = aggregateMix(cityIntersections, snapshot);
    return {
      id: city.id,
      regionId: region.id,
      name: city.name,
      nameAr: city.nameAr,
      center: city.center,
      intersectionCount: cityIntersections.length,
      tone: toneFromStatusMix(statusMix),
    };
  });
}

export function buildSummary(
  selection: SelectionPath,
  snapshot: CommandPlatformSnapshot,
): SelectedAreaSummary {
  if (selection.level === "intersection" && selection.intersectionId) {
    const intersection = snapshot.intersections.find(
      (candidate) => candidate.id === selection.intersectionId,
    );
    if (intersection) {
      const { statusMix, congestionMix, controllerMix } = aggregateMix(
        [intersection],
        snapshot,
      );
      return {
        level: "intersection",
        typeLabel: "Intersection",
        name: intersection.name,
        intersectionCount: 1,
        congestionMix,
        dominantCongestion: dominantCongestion(congestionMix),
        incidentCount: intersection.incidents,
        controllerMix,
        dominantMode: intersection.mode,
        statusMix,
        intersection,
        center: intersection.location,
      };
    }
  }

  if (selection.level === "district" && selection.districtId) {
    const district = findDistrict(selection.districtId);
    const districtIntersections = intersectionsInDistrict(
      snapshot.intersections,
      selection.districtId,
    );
    const { statusMix, congestionMix, controllerMix } = aggregateMix(
      districtIntersections,
      snapshot,
    );
    return {
      level: "district",
      typeLabel: "District",
      name: district?.name ?? "District",
      nameAr: district?.nameAr,
      intersectionCount: districtIntersections.length,
      congestionMix,
      dominantCongestion: dominantCongestion(congestionMix),
      incidentCount: countIncidents(districtIntersections),
      controllerMix,
      dominantMode: dominantMode(districtIntersections),
      statusMix,
      center: district?.center ?? snapshot.cityCenter,
      averageDelaySeconds: averageDelay(districtIntersections),
      totalQueue: totalQueue(districtIntersections),
    };
  }

  if (selection.level === "city" && selection.cityId) {
    const city = findCity(selection.cityId);
    const cityIntersections = intersectionsInCity(
      snapshot.intersections,
      selection.cityId,
    );
    const { statusMix, congestionMix, controllerMix } = aggregateMix(
      cityIntersections,
      snapshot,
    );
    return {
      level: "city",
      typeLabel: "City",
      name: city?.name ?? "City",
      nameAr: city?.nameAr,
      intersectionCount: cityIntersections.length,
      congestionMix,
      dominantCongestion: dominantCongestion(congestionMix),
      incidentCount: countIncidents(cityIntersections),
      controllerMix,
      dominantMode: dominantMode(cityIntersections),
      statusMix,
      center: city?.center ?? snapshot.cityCenter,
      averageDelaySeconds: averageDelay(cityIntersections),
      totalQueue: totalQueue(cityIntersections),
      worstDistrictId: worstDistrictIdForCity(selection.cityId, snapshot),
    };
  }

  if (selection.level === "region" && selection.regionId) {
    const region = findRegion(selection.regionId);
    const regionIntersections = intersectionsInRegion(
      snapshot.intersections,
      selection.regionId,
    );
    const { statusMix, congestionMix, controllerMix } = aggregateMix(
      regionIntersections,
      snapshot,
    );
    return {
      level: "region",
      typeLabel: "Region",
      name: region?.name ?? "Region",
      nameAr: region?.nameAr,
      intersectionCount: regionIntersections.length,
      congestionMix,
      dominantCongestion: dominantCongestion(congestionMix),
      incidentCount: countIncidents(regionIntersections),
      controllerMix,
      dominantMode: dominantMode(regionIntersections),
      statusMix,
      center: region?.center ?? moroccoGeography.center,
    };
  }

  const { statusMix, congestionMix, controllerMix } = aggregateMix(
    snapshot.intersections,
    snapshot,
  );
  return {
    level: "country",
    typeLabel: "Country",
    name: moroccoGeography.countryName,
    nameAr: moroccoGeography.countryNameAr,
    intersectionCount: snapshot.intersections.length,
    congestionMix,
    dominantCongestion: dominantCongestion(congestionMix),
    incidentCount: countIncidents(snapshot.intersections),
    controllerMix,
    dominantMode: dominantMode(snapshot.intersections),
    statusMix,
    center: moroccoGeography.center,
  };
}

export function buildBreadcrumb(
  selection: SelectionPath,
): BreadcrumbCrumb[] {
  const crumbs: BreadcrumbCrumb[] = [
    {
      level: "country",
      label: moroccoGeography.countryName,
      labelAr: moroccoGeography.countryNameAr,
      selection: { level: "country" },
    },
  ];

  const region = findRegion(selection.regionId);
  if (region) {
    crumbs.push({
      level: "region",
      label: region.name,
      labelAr: region.nameAr,
      selection: { level: "region", regionId: region.id },
    });
  }

  const city = findCity(selection.cityId);
  if (city) {
    crumbs.push({
      level: "city",
      label: city.name,
      labelAr: city.nameAr,
      selection: {
        level: "city",
        regionId: city.regionId,
        cityId: city.id,
      },
    });
  }

  const district = findDistrict(selection.districtId);
  if (district) {
    crumbs.push({
      level: "district",
      label: district.name,
      labelAr: district.nameAr,
      selection: {
        level: "district",
        regionId: city?.regionId ?? selection.regionId,
        cityId: district.cityId,
        districtId: district.id,
      },
    });
  }

  if (selection.level === "intersection" && selection.intersectionId) {
    crumbs.push({
      level: "intersection",
      label: selection.intersectionId,
      selection: { ...selection },
    });
  }

  return crumbs;
}

export function labelForIntersection(
  intersection: IntersectionSnapshot | undefined,
): string {
  return intersection?.name ?? "Intersection";
}

export function applySelectionToCrumbIntersectionLabel(
  crumbs: BreadcrumbCrumb[],
  intersection: IntersectionSnapshot | undefined,
): BreadcrumbCrumb[] {
  if (!intersection) return crumbs;
  return crumbs.map((crumb) =>
    crumb.level === "intersection"
      ? { ...crumb, label: intersection.name }
      : crumb,
  );
}

export function defaultSelectionForSnapshot(
  snapshot: CommandPlatformSnapshot,
): SelectionPath {
  const firstIntersection = snapshot.intersections[0];
  if (!firstIntersection) {
    return { level: "country" };
  }
  const city = findCityForIntersection(firstIntersection);
  const region = city ? findRegion(city.regionId) : undefined;
  return {
    level: "city",
    regionId: region?.id,
    cityId: city?.id,
  };
}

export function selectionCenterAndZoom(selection: SelectionPath): {
  center: { lat: number; lng: number };
  zoom: number;
} {
  const district = findDistrict(selection.districtId);
  if (selection.level === "district" && district) {
    return { center: district.center, zoom: 14 };
  }
  const city = findCity(selection.cityId);
  if (
    (selection.level === "city" || selection.level === "intersection") &&
    city
  ) {
    return { center: city.center, zoom: city.defaultZoom };
  }
  const region = findRegion(selection.regionId);
  if (selection.level === "region" && region) {
    return { center: region.center, zoom: region.defaultZoom };
  }
  return { center: moroccoGeography.center, zoom: moroccoGeography.defaultZoom };
}
