import { Injectable } from '@nestjs/common';

import type { IntersectionEntity } from '../database/entities';
import {
  findNearestReferenceCity,
  findNearestZoneInCity,
  findReferenceCity,
  findReferenceRegion,
  findReferenceZone,
  referenceGeography,
  type ReferenceCity,
  type ReferenceRegion,
  type ReferenceZone,
} from './reference-geography';

export interface ResolvedTopologyScope {
  region: ReferenceRegion;
  city: ReferenceCity;
  zone: ReferenceZone | null;
}

@Injectable()
export class TopologyReferenceService {
  readonly countryName = referenceGeography.countryName;
  readonly countryNameAr = referenceGeography.countryNameAr;
  readonly countryCenter = referenceGeography.center;
  readonly defaultZoom = referenceGeography.defaultZoom;
  readonly regions = referenceGeography.regions;

  findRegion(regionId: string | undefined) {
    return findReferenceRegion(regionId);
  }

  findCity(cityId: string | undefined) {
    return findReferenceCity(cityId);
  }

  findZone(zoneId: string | undefined) {
    return findReferenceZone(zoneId);
  }

  resolveIntersection(
    intersection: Pick<
      IntersectionEntity,
      'district' | 'latitude' | 'longitude'
    >,
  ): ResolvedTopologyScope {
    const zone = this.findZoneByDistrictKey(intersection.district);
    if (zone) {
      const city = findReferenceCity(zone.cityId)!;
      const region = findReferenceRegion(city.regionId)!;
      return { region, city, zone };
    }

    const city =
      this.findCityByName(intersection.district) ??
      findNearestReferenceCity({
        lat: Number(intersection.latitude),
        lng: Number(intersection.longitude),
      }) ??
      referenceGeography.regions[0].cities[0];
    const region = findReferenceRegion(city.regionId)!;
    // District strings carry no usable zone token (e.g. plain
    // "Casablanca").  Fall back to the nearest district centroid inside
    // the resolved city — same spirit as the nearest-city fallback above
    // — so zone-scoped aggregation and zone agents still see the network
    // instead of every zone reporting zero intersections.
    const latitude = Number(intersection.latitude);
    const longitude = Number(intersection.longitude);
    const geographicZone =
      Number.isFinite(latitude) && Number.isFinite(longitude)
        ? (findNearestZoneInCity(city, { lat: latitude, lng: longitude }) ??
          null)
        : null;
    return { region, city, zone: geographicZone };
  }

  private findZoneByDistrictKey(rawDistrict: string | null | undefined) {
    // Districts are stored either as a bare zone name ("Maarif") or
    // qualified with the city ("Casablanca — Mers Sultan").  Matching the
    // whole string against the bare `zoneKeys` therefore missed every
    // qualified value, which left the entire network unzoned.  Try the
    // full string first, then each separator-delimited segment.
    const candidates = splitDistrictCandidates(rawDistrict);
    if (candidates.length === 0) return undefined;
    for (const region of referenceGeography.regions) {
      for (const city of region.cities) {
        for (const zone of city.zones) {
          if (
            zone.zoneKeys.some((zoneKey) =>
              candidates.includes(normalize(zoneKey)),
            )
          ) {
            return zone;
          }
        }
      }
    }
    return undefined;
  }

  private findCityByName(rawValue: string | null | undefined) {
    const key = normalize(rawValue);
    if (!key) return undefined;
    for (const region of referenceGeography.regions) {
      for (const city of region.cities) {
        if (normalize(city.name) === key || normalize(city.nameAr) === key) {
          return city;
        }
      }
    }
    return undefined;
  }
}

/**
 * Normalised match candidates for a district string: the whole value
 * plus every segment split on the em/en dash, hyphen, slash or comma
 * separators used across the imported carfmap data.
 */
function splitDistrictCandidates(value: string | null | undefined): string[] {
  const full = normalize(value);
  if (!full) return [];
  const candidates = [full];
  for (const segment of full.split(/[—–\-/,]/)) {
    const trimmed = segment.trim();
    if (trimmed && !candidates.includes(trimmed)) candidates.push(trimmed);
  }
  return candidates;
}

function normalize(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}
