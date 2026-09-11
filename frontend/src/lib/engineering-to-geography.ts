import {
  findNearestCity,
  moroccoGeography,
  type MoroccoCity,
  type MoroccoRegion,
} from "@/lib/morocco-geography";
import type { EngineeringIntersectionRecord } from "@/types/engineering-studio";

function normalise(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function findCityForEngineeringIntersection(
  intersection: EngineeringIntersectionRecord,
): MoroccoCity | undefined {
  const district = normalise(intersection.district);
  if (district) {
    for (const region of moroccoGeography.regions) {
      for (const city of region.cities) {
        if (normalise(city.name) === district) return city;
        if (
          city.districts.some((candidate) =>
            candidate.districtKeys.some((key) => normalise(key) === district),
          )
        ) {
          return city;
        }
      }
    }
  }

  const latitude = Number(intersection.latitude);
  const longitude = Number(intersection.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return findNearestCity({ lat: latitude, lng: longitude });
  }

  return undefined;
}

export function findRegionForEngineeringIntersection(
  intersection: EngineeringIntersectionRecord,
): MoroccoRegion | undefined {
  const city = findCityForEngineeringIntersection(intersection);
  if (!city) return undefined;
  return moroccoGeography.regions.find((region) => region.id === city.regionId);
}
