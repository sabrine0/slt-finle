export interface ReferenceLatLng {
  lat: number;
  lng: number;
}

export interface ReferenceZone {
  id: string;
  cityId: string;
  name: string;
  nameAr: string;
  zoneKeys: string[];
  center: ReferenceLatLng;
}

export interface ReferenceCity {
  id: string;
  regionId: string;
  name: string;
  nameAr: string;
  center: ReferenceLatLng;
  defaultZoom: number;
  zones: ReferenceZone[];
}

export interface ReferenceRegion {
  id: string;
  name: string;
  nameAr: string;
  center: ReferenceLatLng;
  defaultZoom: number;
  cities: ReferenceCity[];
}

const casablancaZones: ReferenceZone[] = [
  {
    id: 'dist-cas-maarif',
    cityId: 'city-casablanca',
    name: 'Maarif',
    nameAr: 'المعاريف',
    zoneKeys: ['Maarif'],
    center: { lat: 33.5857, lng: -7.6281 },
  },
  {
    id: 'dist-cas-anfa',
    cityId: 'city-casablanca',
    name: 'Anfa',
    nameAr: 'أنفا',
    zoneKeys: ['Anfa'],
    center: { lat: 33.5738, lng: -7.6502 },
  },
  {
    id: 'dist-cas-sidi-belyout',
    cityId: 'city-casablanca',
    name: 'Sidi Belyout',
    nameAr: 'سيدي بليوط',
    zoneKeys: ['Sidi Belyout'],
    center: { lat: 33.5921, lng: -7.6148 },
  },
  {
    id: 'dist-cas-port',
    cityId: 'city-casablanca',
    name: 'Port',
    nameAr: 'الميناء',
    zoneKeys: ['Port'],
    center: { lat: 33.6066, lng: -7.6063 },
  },
  {
    id: 'dist-cas-ain-diab',
    cityId: 'city-casablanca',
    name: 'Aïn Diab',
    nameAr: 'عين الذياب',
    zoneKeys: ['Ain Diab', 'Aïn Diab'],
    center: { lat: 33.5893, lng: -7.6761 },
  },
  {
    id: 'dist-cas-mers-sultan',
    cityId: 'city-casablanca',
    name: 'Mers Sultan',
    nameAr: 'مرس السلطان',
    zoneKeys: ['Mers Sultan'],
    center: { lat: 33.5781, lng: -7.6338 },
  },
  {
    id: 'dist-cas-ain-sebaa',
    cityId: 'city-casablanca',
    name: 'Aïn Sebaâ',
    nameAr: 'عين السبع',
    zoneKeys: ['Ain Sebaa', 'Aïn Sebaâ'],
    center: { lat: 33.6116, lng: -7.5432 },
  },
  {
    id: 'dist-cas-hay-hassani',
    cityId: 'city-casablanca',
    name: 'Hay Hassani',
    nameAr: 'الحي الحسني',
    zoneKeys: ['Hay Hassani'],
    center: { lat: 33.5481, lng: -7.6826 },
  },
];

export const referenceGeography: {
  countryName: string;
  countryNameAr: string;
  center: ReferenceLatLng;
  defaultZoom: number;
  regions: ReferenceRegion[];
} = {
  countryName: 'Morocco',
  countryNameAr: 'المغرب',
  center: { lat: 31.79, lng: -7.09 },
  defaultZoom: 6,
  regions: [
    {
      id: 'reg-tanger-tetouan-alhoceima',
      name: 'Tanger-Tétouan-Al Hoceïma',
      nameAr: 'طنجة-تطوان-الحسيمة',
      center: { lat: 35.38, lng: -5.48 },
      defaultZoom: 9,
      cities: [
        {
          id: 'city-tangier',
          regionId: 'reg-tanger-tetouan-alhoceima',
          name: 'Tangier',
          nameAr: 'طنجة',
          center: { lat: 35.7595, lng: -5.834 },
          defaultZoom: 12,
          zones: [],
        },
        {
          id: 'city-tetouan',
          regionId: 'reg-tanger-tetouan-alhoceima',
          name: 'Tétouan',
          nameAr: 'تطوان',
          center: { lat: 35.5785, lng: -5.3684 },
          defaultZoom: 12,
          zones: [],
        },
        {
          id: 'city-alhoceima',
          regionId: 'reg-tanger-tetouan-alhoceima',
          name: 'Al Hoceïma',
          nameAr: 'الحسيمة',
          center: { lat: 35.2517, lng: -3.9372 },
          defaultZoom: 12,
          zones: [],
        },
      ],
    },
    {
      id: 'reg-oriental',
      name: 'Oriental',
      nameAr: 'الشرق',
      center: { lat: 34.69, lng: -2.9 },
      defaultZoom: 8,
      cities: [
        {
          id: 'city-oujda',
          regionId: 'reg-oriental',
          name: 'Oujda',
          nameAr: 'وجدة',
          center: { lat: 34.6814, lng: -1.9086 },
          defaultZoom: 12,
          zones: [],
        },
        {
          id: 'city-nador',
          regionId: 'reg-oriental',
          name: 'Nador',
          nameAr: 'الناظور',
          center: { lat: 35.1681, lng: -2.9335 },
          defaultZoom: 12,
          zones: [],
        },
      ],
    },
    {
      id: 'reg-fes-meknes',
      name: 'Fès-Meknès',
      nameAr: 'فاس-مكناس',
      center: { lat: 33.9, lng: -4.9 },
      defaultZoom: 9,
      cities: [
        {
          id: 'city-fes',
          regionId: 'reg-fes-meknes',
          name: 'Fès',
          nameAr: 'فاس',
          center: { lat: 34.0181, lng: -5.0078 },
          defaultZoom: 12,
          zones: [],
        },
        {
          id: 'city-meknes',
          regionId: 'reg-fes-meknes',
          name: 'Meknès',
          nameAr: 'مكناس',
          center: { lat: 33.8935, lng: -5.5473 },
          defaultZoom: 12,
          zones: [],
        },
      ],
    },
    {
      id: 'reg-rabat-sale-kenitra',
      name: 'Rabat-Salé-Kénitra',
      nameAr: 'الرباط-سلا-القنيطرة',
      center: { lat: 34.3, lng: -6.3 },
      defaultZoom: 9,
      cities: [
        {
          id: 'city-rabat',
          regionId: 'reg-rabat-sale-kenitra',
          name: 'Rabat',
          nameAr: 'الرباط',
          center: { lat: 34.0209, lng: -6.8416 },
          defaultZoom: 12,
          zones: [],
        },
        {
          id: 'city-sale',
          regionId: 'reg-rabat-sale-kenitra',
          name: 'Salé',
          nameAr: 'سلا',
          center: { lat: 34.038, lng: -6.8132 },
          defaultZoom: 12,
          zones: [],
        },
        {
          id: 'city-kenitra',
          regionId: 'reg-rabat-sale-kenitra',
          name: 'Kénitra',
          nameAr: 'القنيطرة',
          center: { lat: 34.261, lng: -6.5802 },
          defaultZoom: 12,
          zones: [],
        },
      ],
    },
    {
      id: 'reg-beni-mellal-khenifra',
      name: 'Béni Mellal-Khénifra',
      nameAr: 'بني ملال-خنيفرة',
      center: { lat: 32.5, lng: -6.1 },
      defaultZoom: 8,
      cities: [
        {
          id: 'city-beni-mellal',
          regionId: 'reg-beni-mellal-khenifra',
          name: 'Béni Mellal',
          nameAr: 'بني ملال',
          center: { lat: 32.3373, lng: -6.3498 },
          defaultZoom: 12,
          zones: [],
        },
        {
          id: 'city-khouribga',
          regionId: 'reg-beni-mellal-khenifra',
          name: 'Khouribga',
          nameAr: 'خريبكة',
          center: { lat: 32.8811, lng: -6.9063 },
          defaultZoom: 12,
          zones: [],
        },
      ],
    },
    {
      id: 'reg-casablanca-settat',
      name: 'Casablanca-Settat',
      nameAr: 'الدار البيضاء-سطات',
      center: { lat: 33.35, lng: -7.4 },
      defaultZoom: 9,
      cities: [
        {
          id: 'city-casablanca',
          regionId: 'reg-casablanca-settat',
          name: 'Casablanca',
          nameAr: 'الدار البيضاء',
          center: { lat: 33.5876, lng: -7.6114 },
          defaultZoom: 12,
          zones: casablancaZones,
        },
        {
          id: 'city-mohammedia',
          regionId: 'reg-casablanca-settat',
          name: 'Mohammedia',
          nameAr: 'المحمدية',
          center: { lat: 33.686, lng: -7.383 },
          defaultZoom: 12,
          zones: [],
        },
        {
          id: 'city-settat',
          regionId: 'reg-casablanca-settat',
          name: 'Settat',
          nameAr: 'سطات',
          center: { lat: 33.0022, lng: -7.6167 },
          defaultZoom: 12,
          zones: [],
        },
        {
          id: 'city-eljadida',
          regionId: 'reg-casablanca-settat',
          name: 'El Jadida',
          nameAr: 'الجديدة',
          center: { lat: 33.2316, lng: -8.5007 },
          defaultZoom: 12,
          zones: [],
        },
      ],
    },
    {
      id: 'reg-marrakech-safi',
      name: 'Marrakech-Safi',
      nameAr: 'مراكش-آسفي',
      center: { lat: 31.8, lng: -8.5 },
      defaultZoom: 8,
      cities: [
        {
          id: 'city-marrakech',
          regionId: 'reg-marrakech-safi',
          name: 'Marrakech',
          nameAr: 'مراكش',
          center: { lat: 31.6295, lng: -7.9811 },
          defaultZoom: 12,
          zones: [],
        },
        {
          id: 'city-safi',
          regionId: 'reg-marrakech-safi',
          name: 'Safi',
          nameAr: 'آسفي',
          center: { lat: 32.3008, lng: -9.2272 },
          defaultZoom: 12,
          zones: [],
        },
      ],
    },
    {
      id: 'reg-draa-tafilalet',
      name: 'Drâa-Tafilalet',
      nameAr: 'درعة-تافيلالت',
      center: { lat: 31.3, lng: -4.9 },
      defaultZoom: 7,
      cities: [
        {
          id: 'city-errachidia',
          regionId: 'reg-draa-tafilalet',
          name: 'Errachidia',
          nameAr: 'الرشيدية',
          center: { lat: 31.9314, lng: -4.4247 },
          defaultZoom: 12,
          zones: [],
        },
        {
          id: 'city-ouarzazate',
          regionId: 'reg-draa-tafilalet',
          name: 'Ouarzazate',
          nameAr: 'ورزازات',
          center: { lat: 30.9335, lng: -6.937 },
          defaultZoom: 12,
          zones: [],
        },
      ],
    },
    {
      id: 'reg-souss-massa',
      name: 'Souss-Massa',
      nameAr: 'سوس-ماسة',
      center: { lat: 30.4, lng: -9.0 },
      defaultZoom: 8,
      cities: [
        {
          id: 'city-agadir',
          regionId: 'reg-souss-massa',
          name: 'Agadir',
          nameAr: 'أكادير',
          center: { lat: 30.4278, lng: -9.5981 },
          defaultZoom: 12,
          zones: [],
        },
        {
          id: 'city-taroudant',
          regionId: 'reg-souss-massa',
          name: 'Taroudant',
          nameAr: 'تارودانت',
          center: { lat: 30.4703, lng: -8.8775 },
          defaultZoom: 12,
          zones: [],
        },
      ],
    },
    {
      id: 'reg-guelmim-oued-noun',
      name: 'Guelmim-Oued Noun',
      nameAr: 'كلميم-واد نون',
      center: { lat: 28.8, lng: -10.4 },
      defaultZoom: 7,
      cities: [
        {
          id: 'city-guelmim',
          regionId: 'reg-guelmim-oued-noun',
          name: 'Guelmim',
          nameAr: 'كلميم',
          center: { lat: 28.9865, lng: -10.0575 },
          defaultZoom: 12,
          zones: [],
        },
      ],
    },
    {
      id: 'reg-laayoune-sakia',
      name: 'Laâyoune-Sakia El Hamra',
      nameAr: 'العيون-الساقية الحمراء',
      center: { lat: 26.5, lng: -12.5 },
      defaultZoom: 7,
      cities: [
        {
          id: 'city-laayoune',
          regionId: 'reg-laayoune-sakia',
          name: 'Laâyoune',
          nameAr: 'العيون',
          center: { lat: 27.1536, lng: -13.2033 },
          defaultZoom: 12,
          zones: [],
        },
      ],
    },
    {
      id: 'reg-dakhla-oued-eddahab',
      name: 'Dakhla-Oued Ed-Dahab',
      nameAr: 'الداخلة-وادي الذهب',
      center: { lat: 23.7, lng: -15.9 },
      defaultZoom: 7,
      cities: [
        {
          id: 'city-dakhla',
          regionId: 'reg-dakhla-oued-eddahab',
          name: 'Dakhla',
          nameAr: 'الداخلة',
          center: { lat: 23.6848, lng: -15.958 },
          defaultZoom: 12,
          zones: [],
        },
      ],
    },
  ],
};

export function findReferenceRegion(regionId: string | undefined) {
  if (!regionId) return undefined;
  return referenceGeography.regions.find((region) => region.id === regionId);
}

export function findReferenceCity(cityId: string | undefined) {
  if (!cityId) return undefined;
  for (const region of referenceGeography.regions) {
    const city = region.cities.find((candidate) => candidate.id === cityId);
    if (city) return city;
  }
  return undefined;
}

export function findReferenceZone(zoneId: string | undefined) {
  if (!zoneId) return undefined;
  for (const region of referenceGeography.regions) {
    for (const city of region.cities) {
      const zone = city.zones.find((candidate) => candidate.id === zoneId);
      if (zone) return zone;
    }
  }
  return undefined;
}

export function findNearestReferenceCity(point: ReferenceLatLng) {
  let best: ReferenceCity | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const region of referenceGeography.regions) {
    for (const city of region.cities) {
      const distance = haversineMetres(point, city.center);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = city;
      }
    }
  }
  return best;
}

/**
 * Nearest zone within a single city, bounded by `maxMetres` so an
 * intersection on the far side of the city is left unzoned rather than
 * being attached to an implausible district.
 */
export function findNearestZoneInCity(
  city: ReferenceCity,
  point: ReferenceLatLng,
  maxMetres = 6000,
) {
  let best: ReferenceZone | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const zone of city.zones) {
    const distance = haversineMetres(point, zone.center);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = zone;
    }
  }
  return bestDistance <= maxMetres ? best : undefined;
}

function haversineMetres(a: ReferenceLatLng, b: ReferenceLatLng) {
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
