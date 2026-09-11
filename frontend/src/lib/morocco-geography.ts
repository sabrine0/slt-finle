import type { LatLngPoint } from "@/types/command-platform";

export interface MoroccoDistrict {
  id: string;
  cityId: string;
  name: string;
  nameAr: string;
  districtKeys: string[];
  center: LatLngPoint;
}

export interface MoroccoCity {
  id: string;
  regionId: string;
  name: string;
  nameAr: string;
  center: LatLngPoint;
  defaultZoom: number;
  districts: MoroccoDistrict[];
}

export interface RegionBounds {
  north: number;
  south: number;
  west: number;
  east: number;
}

export interface MoroccoRegion {
  id: string;
  name: string;
  nameAr: string;
  center: LatLngPoint;
  defaultZoom: number;
  bounds: RegionBounds;
  cities: MoroccoCity[];
}

export interface MoroccoGeography {
  countryName: string;
  countryNameAr: string;
  center: LatLngPoint;
  defaultZoom: number;
  regions: MoroccoRegion[];
}

const casablancaDistricts: MoroccoDistrict[] = [
  {
    id: "dist-cas-maarif",
    cityId: "city-casablanca",
    name: "Maarif",
    nameAr: "المعاريف",
    districtKeys: ["Maarif"],
    center: { lat: 33.5857, lng: -7.6281 },
  },
  {
    id: "dist-cas-anfa",
    cityId: "city-casablanca",
    name: "Anfa",
    nameAr: "أنفا",
    districtKeys: ["Anfa"],
    center: { lat: 33.5738, lng: -7.6502 },
  },
  {
    id: "dist-cas-sidi-belyout",
    cityId: "city-casablanca",
    name: "Sidi Belyout",
    nameAr: "سيدي بليوط",
    districtKeys: ["Sidi Belyout"],
    center: { lat: 33.5921, lng: -7.6148 },
  },
  {
    id: "dist-cas-port",
    cityId: "city-casablanca",
    name: "Port",
    nameAr: "الميناء",
    districtKeys: ["Port"],
    center: { lat: 33.6066, lng: -7.6063 },
  },
  {
    id: "dist-cas-ain-diab",
    cityId: "city-casablanca",
    name: "Aïn Diab",
    nameAr: "عين الذياب",
    districtKeys: ["Ain Diab", "Aïn Diab"],
    center: { lat: 33.5893, lng: -7.6761 },
  },
  {
    id: "dist-cas-mers-sultan",
    cityId: "city-casablanca",
    name: "Mers Sultan",
    nameAr: "مرس السلطان",
    districtKeys: ["Mers Sultan"],
    center: { lat: 33.5781, lng: -7.6338 },
  },
  {
    id: "dist-cas-ain-sebaa",
    cityId: "city-casablanca",
    name: "Aïn Sebaâ",
    nameAr: "عين السبع",
    districtKeys: ["Ain Sebaa", "Aïn Sebaâ"],
    center: { lat: 33.6116, lng: -7.5432 },
  },
  {
    id: "dist-cas-hay-hassani",
    cityId: "city-casablanca",
    name: "Hay Hassani",
    nameAr: "الحي الحسني",
    districtKeys: ["Hay Hassani"],
    center: { lat: 33.5481, lng: -7.6826 },
  },
];

export const moroccoGeography: MoroccoGeography = {
  countryName: "Morocco",
  countryNameAr: "المغرب",
  center: { lat: 31.79, lng: -7.09 },
  defaultZoom: 6,
  regions: [
    {
      id: "reg-tanger-tetouan-alhoceima",
      name: "Tanger-Tétouan-Al Hoceïma",
      nameAr: "طنجة-تطوان-الحسيمة",
      center: { lat: 35.38, lng: -5.48 },
      defaultZoom: 9,
      bounds: { north: 35.85, south: 34.55, west: -6.20, east: -3.35 },
      cities: [
        {
          id: "city-tangier",
          regionId: "reg-tanger-tetouan-alhoceima",
          name: "Tangier",
          nameAr: "طنجة",
          center: { lat: 35.7595, lng: -5.834 },
          defaultZoom: 12,
          districts: [],
        },
        {
          id: "city-tetouan",
          regionId: "reg-tanger-tetouan-alhoceima",
          name: "Tétouan",
          nameAr: "تطوان",
          center: { lat: 35.5785, lng: -5.3684 },
          defaultZoom: 12,
          districts: [],
        },
        {
          id: "city-alhoceima",
          regionId: "reg-tanger-tetouan-alhoceima",
          name: "Al Hoceïma",
          nameAr: "الحسيمة",
          center: { lat: 35.2517, lng: -3.9372 },
          defaultZoom: 12,
          districts: [],
        },
      ],
    },
    {
      id: "reg-oriental",
      name: "Oriental",
      nameAr: "الشرق",
      center: { lat: 34.69, lng: -2.9 },
      defaultZoom: 8,
      bounds: { north: 35.25, south: 32.10, west: -3.70, east: -1.10 },
      cities: [
        {
          id: "city-oujda",
          regionId: "reg-oriental",
          name: "Oujda",
          nameAr: "وجدة",
          center: { lat: 34.6814, lng: -1.9086 },
          defaultZoom: 12,
          districts: [],
        },
        {
          id: "city-nador",
          regionId: "reg-oriental",
          name: "Nador",
          nameAr: "الناظور",
          center: { lat: 35.1681, lng: -2.9335 },
          defaultZoom: 12,
          districts: [],
        },
      ],
    },
    {
      id: "reg-fes-meknes",
      name: "Fès-Meknès",
      nameAr: "فاس-مكناس",
      center: { lat: 33.9, lng: -4.9 },
      defaultZoom: 9,
      bounds: { north: 34.55, south: 33.00, west: -5.65, east: -3.80 },
      cities: [
        {
          id: "city-fes",
          regionId: "reg-fes-meknes",
          name: "Fès",
          nameAr: "فاس",
          center: { lat: 34.0181, lng: -5.0078 },
          defaultZoom: 12,
          districts: [],
        },
        {
          id: "city-meknes",
          regionId: "reg-fes-meknes",
          name: "Meknès",
          nameAr: "مكناس",
          center: { lat: 33.8935, lng: -5.5473 },
          defaultZoom: 12,
          districts: [],
        },
      ],
    },
    {
      id: "reg-rabat-sale-kenitra",
      name: "Rabat-Salé-Kénitra",
      nameAr: "الرباط-سلا-القنيطرة",
      center: { lat: 34.3, lng: -6.3 },
      defaultZoom: 9,
      bounds: { north: 34.85, south: 33.75, west: -7.05, east: -5.70 },
      cities: [
        {
          id: "city-rabat",
          regionId: "reg-rabat-sale-kenitra",
          name: "Rabat",
          nameAr: "الرباط",
          center: { lat: 34.0209, lng: -6.8416 },
          defaultZoom: 12,
          districts: [],
        },
        {
          id: "city-sale",
          regionId: "reg-rabat-sale-kenitra",
          name: "Salé",
          nameAr: "سلا",
          center: { lat: 34.038, lng: -6.8132 },
          defaultZoom: 12,
          districts: [],
        },
        {
          id: "city-kenitra",
          regionId: "reg-rabat-sale-kenitra",
          name: "Kénitra",
          nameAr: "القنيطرة",
          center: { lat: 34.261, lng: -6.5802 },
          defaultZoom: 12,
          districts: [],
        },
      ],
    },
    {
      id: "reg-beni-mellal-khenifra",
      name: "Béni Mellal-Khénifra",
      nameAr: "بني ملال-خنيفرة",
      center: { lat: 32.5, lng: -6.1 },
      defaultZoom: 8,
      bounds: { north: 33.25, south: 31.90, west: -7.25, east: -5.35 },
      cities: [
        {
          id: "city-beni-mellal",
          regionId: "reg-beni-mellal-khenifra",
          name: "Béni Mellal",
          nameAr: "بني ملال",
          center: { lat: 32.3373, lng: -6.3498 },
          defaultZoom: 12,
          districts: [],
        },
        {
          id: "city-khouribga",
          regionId: "reg-beni-mellal-khenifra",
          name: "Khouribga",
          nameAr: "خريبكة",
          center: { lat: 32.8811, lng: -6.9063 },
          defaultZoom: 12,
          districts: [],
        },
      ],
    },
    {
      id: "reg-casablanca-settat",
      name: "Casablanca-Settat",
      nameAr: "الدار البيضاء-سطات",
      center: { lat: 33.35, lng: -7.4 },
      defaultZoom: 9,
      bounds: { north: 33.90, south: 32.50, west: -9.25, east: -6.65 },
      cities: [
        {
          id: "city-casablanca",
          regionId: "reg-casablanca-settat",
          name: "Casablanca",
          nameAr: "الدار البيضاء",
          center: { lat: 33.5876, lng: -7.6114 },
          defaultZoom: 12,
          districts: casablancaDistricts,
        },
        {
          id: "city-mohammedia",
          regionId: "reg-casablanca-settat",
          name: "Mohammedia",
          nameAr: "المحمدية",
          center: { lat: 33.686, lng: -7.383 },
          defaultZoom: 12,
          districts: [],
        },
        {
          id: "city-settat",
          regionId: "reg-casablanca-settat",
          name: "Settat",
          nameAr: "سطات",
          center: { lat: 33.0022, lng: -7.6167 },
          defaultZoom: 12,
          districts: [],
        },
        {
          id: "city-eljadida",
          regionId: "reg-casablanca-settat",
          name: "El Jadida",
          nameAr: "الجديدة",
          center: { lat: 33.2316, lng: -8.5007 },
          defaultZoom: 12,
          districts: [],
        },
      ],
    },
    {
      id: "reg-marrakech-safi",
      name: "Marrakech-Safi",
      nameAr: "مراكش-آسفي",
      center: { lat: 31.8, lng: -8.5 },
      defaultZoom: 8,
      bounds: { north: 32.45, south: 30.75, west: -10.00, east: -7.05 },
      cities: [
        {
          id: "city-marrakech",
          regionId: "reg-marrakech-safi",
          name: "Marrakech",
          nameAr: "مراكش",
          center: { lat: 31.6295, lng: -7.9811 },
          defaultZoom: 12,
          districts: [],
        },
        {
          id: "city-safi",
          regionId: "reg-marrakech-safi",
          name: "Safi",
          nameAr: "آسفي",
          center: { lat: 32.3008, lng: -9.2272 },
          defaultZoom: 12,
          districts: [],
        },
      ],
    },
    {
      id: "reg-draa-tafilalet",
      name: "Drâa-Tafilalet",
      nameAr: "درعة-تافيلالت",
      center: { lat: 31.3, lng: -4.9 },
      defaultZoom: 7,
      bounds: { north: 32.30, south: 29.55, west: -7.05, east: -2.90 },
      cities: [
        {
          id: "city-errachidia",
          regionId: "reg-draa-tafilalet",
          name: "Errachidia",
          nameAr: "الرشيدية",
          center: { lat: 31.9314, lng: -4.4247 },
          defaultZoom: 12,
          districts: [],
        },
        {
          id: "city-ouarzazate",
          regionId: "reg-draa-tafilalet",
          name: "Ouarzazate",
          nameAr: "ورزازات",
          center: { lat: 30.9335, lng: -6.937 },
          defaultZoom: 12,
          districts: [],
        },
      ],
    },
    {
      id: "reg-souss-massa",
      name: "Souss-Massa",
      nameAr: "سوس-ماسة",
      center: { lat: 30.4, lng: -9.0 },
      defaultZoom: 8,
      bounds: { north: 31.00, south: 29.05, west: -10.30, east: -7.60 },
      cities: [
        {
          id: "city-agadir",
          regionId: "reg-souss-massa",
          name: "Agadir",
          nameAr: "أكادير",
          center: { lat: 30.4278, lng: -9.5981 },
          defaultZoom: 12,
          districts: [],
        },
        {
          id: "city-taroudant",
          regionId: "reg-souss-massa",
          name: "Taroudant",
          nameAr: "تارودانت",
          center: { lat: 30.4703, lng: -8.8775 },
          defaultZoom: 12,
          districts: [],
        },
      ],
    },
    {
      id: "reg-guelmim-oued-noun",
      name: "Guelmim-Oued Noun",
      nameAr: "كلميم-واد نون",
      center: { lat: 28.8, lng: -10.4 },
      defaultZoom: 7,
      bounds: { north: 29.35, south: 27.50, west: -11.25, east: -8.75 },
      cities: [
        {
          id: "city-guelmim",
          regionId: "reg-guelmim-oued-noun",
          name: "Guelmim",
          nameAr: "كلميم",
          center: { lat: 28.9865, lng: -10.0575 },
          defaultZoom: 12,
          districts: [],
        },
      ],
    },
    {
      id: "reg-laayoune-sakia",
      name: "Laâyoune-Sakia El Hamra",
      nameAr: "العيون-الساقية الحمراء",
      center: { lat: 26.5, lng: -12.5 },
      defaultZoom: 7,
      bounds: { north: 27.95, south: 25.40, west: -14.75, east: -11.15 },
      cities: [
        {
          id: "city-laayoune",
          regionId: "reg-laayoune-sakia",
          name: "Laâyoune",
          nameAr: "العيون",
          center: { lat: 27.1536, lng: -13.2033 },
          defaultZoom: 12,
          districts: [],
        },
      ],
    },
    {
      id: "reg-dakhla-oued-eddahab",
      name: "Dakhla-Oued Ed-Dahab",
      nameAr: "الداخلة-وادي الذهب",
      center: { lat: 23.7, lng: -15.9 },
      defaultZoom: 7,
      bounds: { north: 25.40, south: 21.00, west: -16.80, east: -12.40 },
      cities: [
        {
          id: "city-dakhla",
          regionId: "reg-dakhla-oued-eddahab",
          name: "Dakhla",
          nameAr: "الداخلة",
          center: { lat: 23.6848, lng: -15.958 },
          defaultZoom: 12,
          districts: [],
        },
      ],
    },
  ],
};

export function findRegion(regionId: string | undefined) {
  if (!regionId) return undefined;
  return moroccoGeography.regions.find((region) => region.id === regionId);
}

export function findCity(cityId: string | undefined) {
  if (!cityId) return undefined;
  for (const region of moroccoGeography.regions) {
    const city = region.cities.find((candidate) => candidate.id === cityId);
    if (city) return city;
  }
  return undefined;
}

export function findDistrict(districtId: string | undefined) {
  if (!districtId) return undefined;
  for (const region of moroccoGeography.regions) {
    for (const city of region.cities) {
      const district = city.districts.find(
        (candidate) => candidate.id === districtId,
      );
      if (district) return district;
    }
  }
  return undefined;
}

/**
 * Pick the closest city to a lat/lng by great-circle distance.
 * Used to slot locally-saved zone proposals under the right city in
 * the project tree so operators don't have to hunt for them in a
 * separate branch.
 */
export function findNearestCity(
  point: { lat: number; lng: number },
): MoroccoCity | undefined {
  let best: MoroccoCity | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const region of moroccoGeography.regions) {
    for (const city of region.cities) {
      const d = haversineMetres(point, city.center);
      if (d < bestDistance) {
        bestDistance = d;
        best = city;
      }
    }
  }
  return best;
}

function haversineMetres(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const DEFAULT_LIVE_REGION_ID = "reg-casablanca-settat";
export const DEFAULT_LIVE_CITY_ID = "city-casablanca";
