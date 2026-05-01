import type { StyleSpecification } from "maplibre-gl";
import { layersWithPartialCustomTheme } from "protomaps-themes-base";

/**
 * PMTiles archive — served from the app's own public directory so the
 * map has no third-party runtime dependency. Built by extracting a tight
 * MG city archive at z=8..14 and a wide Europe overview at z=0..7, then
 * merging them into a single ~38 MB archive (see README for commands).
 * One file is enough because z<8 covers the deportation cinematic
 * frame and z>=8 covers city detail; the two zoom ranges are disjoint
 * so `pmtiles merge` can stitch them without overlap conflicts.
 *
 * Override with VITE_PMTILES_URL (e.g. a CDN copy or the protomaps
 * demo bucket if you haven't run the extract yet).
 */
type ImportMetaEnv = {
  VITE_PMTILES_URL?: string;
};
const env = (import.meta as { env?: ImportMetaEnv }).env ?? {};
const PMTILES_URL = env.VITE_PMTILES_URL ?? "/map-assets/basemap.pmtiles";

const archivalTheme = {
  background: "#FAF8F5",
  earth: "#F0EBE4",
  park_a: "#E6DFCF",
  park_b: "#E0D9C8",
  hospital: "#EDE7DB",
  industrial: "#EDE9E0",
  school: "#EDE7DB",
  wood_a: "#DDD7C5",
  wood_b: "#D8D1BF",
  pedestrian: "#F0EBE4",
  scrub_a: "#E2DBC9",
  scrub_b: "#DDD5C3",
  glacier: "#E8E4DC",
  sand: "#E8E0CC",
  beach: "#E8E0CC",
  aerodrome: "#EDE9E0",
  runway: "#D4CFC4",
  water: "#C4CECE",
  zoo: "#E6DFCF",
  military: "#E0D9C8",

  tunnel_other_casing: "#D4C5AD",
  tunnel_minor_casing: "#D4C5AD",
  tunnel_link_casing: "#D4C5AD",
  tunnel_major_casing: "#C8B99A",
  tunnel_highway_casing: "#C8B99A",
  tunnel_other: "#F0EBE4",
  tunnel_minor: "#F0EBE4",
  tunnel_link: "#EDE7DB",
  tunnel_major: "#EDE7DB",
  tunnel_highway: "#E8DFD0",

  pier: "#E8E1D4",
  buildings: "#E0D9CC",

  minor_service_casing: "#D4C5AD",
  minor_casing: "#D4C5AD",
  link_casing: "#C8B99A",
  major_casing_late: "#C8B99A",
  highway_casing_late: "#B8A98A",
  other: "#F5F0E8",
  minor_service: "#F5F0E8",
  minor_a: "#F5F0E8",
  minor_b: "#F0EBE4",
  link: "#EDE7DB",
  major_casing_early: "#C8B99A",
  major: "#EDE7DB",
  highway_casing_early: "#B8A98A",
  highway: "#E8DFD0",
  railway: "#C8B99A",
  boundaries: "#B8A98A",

  waterway_label: "#8B9B9B",

  bridges_other_casing: "#D4C5AD",
  bridges_minor_casing: "#D4C5AD",
  bridges_link_casing: "#C8B99A",
  bridges_major_casing: "#C8B99A",
  bridges_highway_casing: "#B8A98A",
  bridges_other: "#F5F0E8",
  bridges_minor: "#F5F0E8",
  bridges_link: "#EDE7DB",
  bridges_major: "#EDE7DB",
  bridges_highway: "#E8DFD0",

  roads_label_minor: "#8B7355",
  roads_label_minor_halo: "#FAF8F5",
  roads_label_major: "#6B6560",
  roads_label_major_halo: "#FAF8F5",
  ocean_label: "#8B9B9B",
  peak_label: "#8B7355",
  subplace_label: "#8B7355",
  subplace_label_halo: "#FAF8F5",
  city_label: "#6B6560",
  city_label_halo: "#FAF8F5",
  state_label: "#8B7355",
  state_label_halo: "#FAF8F5",
  country_label: "#6B6560",
  address_label: "#A09080",
  address_label_halo: "#FAF8F5",
  landcover: {
    grassland: "#E4DDD0",
    barren: "#E8E0CC",
    urban_area: "#EDE9E0",
    farmland: "#E2DBC9",
    glacier: "#E8E4DC",
    scrub: "#DDD5C3",
    forest: "#D8D1BF",
  },
};

export function createMapStyle(): StyleSpecification {
  return {
    version: 8,
    sprite: "/map-assets/sprites/v4/light",
    glyphs: "/map-assets/fonts/{fontstack}/{range}.pbf",
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${PMTILES_URL}`,
        attribution: [
          'Karte © <a href="https://protomaps.com" target="_blank" rel="noreferrer">Protomaps</a>',
          '© <a href="https://openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> / Overpass',
          'Inhalte © <a href="https://de.wikipedia.org/wiki/Liste_der_Stolpersteine_in_M%C3%B6nchengladbach" target="_blank" rel="noreferrer">Wikipedia</a> (CC&nbsp;BY-SA&nbsp;4.0)',
          'NS-Personen: <a href="https://www.wikidata.org" target="_blank" rel="noreferrer">Wikidata</a>',
        ].join(" · "),
      },
    },
    layers: layersWithPartialCustomTheme(
      "protomaps",
      "light",
      archivalTheme,
      "de",
      "Latin",
    ) as StyleSpecification["layers"],
  };
}
