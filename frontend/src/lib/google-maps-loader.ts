import type { Libraries } from "@react-google-maps/api";

export const GOOGLE_MAPS_LOADER_ID = "stls-google-maps-loader";
export const GOOGLE_MAPS_LIBRARIES: Libraries = [];
/**
 * ISO 3166-1 alpha-2 region bias for the Maps JS API. Setting it
 * to "MA" makes geocoding, autocomplete and places results
 * preferentially resolve to Moroccan entities, which matches every
 * deployment of STLS. All `useJsApiLoader` callsites must share
 * the same region or the second load is silently ignored.
 */
export const GOOGLE_MAPS_REGION = "MA";
