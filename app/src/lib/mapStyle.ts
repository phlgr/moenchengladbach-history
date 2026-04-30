import type { StyleSpecification } from "maplibre-gl";

const ARCHIVAL = {
  paper: "#f4ecd8",
  paperLight: "#faf8f5",
  earth: "#ede4cf",
  park: "#dfd6bf",
  forest: "#cfc6ad",
  water: "#c8d4d2",
  road: "#f6efde",
  roadCasing: "#c8b99a",
  building: "#e2d8c2",
  ink: "#3a3530",
  fadedInk: "#736b5e",
  sepia: "#8b7355",
};

/**
 * Lean archival style: small set of vector layers from OpenFreeMap's planet
 * tileset, recoloured with the warm-paper palette used by frankfurt-history.
 * Free public vector tiles, no API key, no `pmtiles` binary required for
 * the prototype. Swap in a self-hosted PMTiles file later for offline / pin
 * basemap archival assets in the repo.
 */
export function createMapStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      ofm: {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet",
        attribution:
          'Karte © <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> · Daten © <a href="https://openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap-Mitwirkende</a>',
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": ARCHIVAL.paper },
      },
      {
        id: "landuse-residential",
        type: "fill",
        source: "ofm",
        "source-layer": "landuse",
        filter: [
          "in",
          ["get", "class"],
          ["literal", ["residential", "neighbourhood", "suburb"]],
        ],
        paint: { "fill-color": ARCHIVAL.paper, "fill-opacity": 0.6 },
      },
      {
        id: "landuse-park",
        type: "fill",
        source: "ofm",
        "source-layer": "landuse",
        filter: [
          "in",
          ["get", "class"],
          ["literal", ["park", "garden", "playground", "cemetery", "grass"]],
        ],
        paint: { "fill-color": ARCHIVAL.park, "fill-opacity": 0.7 },
      },
      {
        id: "park",
        type: "fill",
        source: "ofm",
        "source-layer": "park",
        paint: { "fill-color": ARCHIVAL.park },
      },
      {
        id: "landcover-wood",
        type: "fill",
        source: "ofm",
        "source-layer": "landcover",
        filter: ["==", ["get", "class"], "wood"],
        paint: { "fill-color": ARCHIVAL.forest, "fill-opacity": 0.9 },
      },
      {
        id: "water",
        type: "fill",
        source: "ofm",
        "source-layer": "water",
        paint: { "fill-color": ARCHIVAL.water },
      },
      {
        id: "waterway",
        type: "line",
        source: "ofm",
        "source-layer": "waterway",
        paint: {
          "line-color": ARCHIVAL.water,
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 16, 3],
        },
      },
      {
        id: "buildings",
        type: "fill",
        source: "ofm",
        "source-layer": "building",
        minzoom: 13,
        paint: {
          "fill-color": ARCHIVAL.building,
          "fill-outline-color": ARCHIVAL.roadCasing,
          "fill-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            13,
            0,
            14,
            0.85,
          ],
        },
      },
      {
        id: "road-casing",
        type: "line",
        source: "ofm",
        "source-layer": "transportation",
        filter: [
          "in",
          ["get", "class"],
          ["literal", ["motorway", "trunk", "primary", "secondary", "tertiary"]],
        ],
        paint: {
          "line-color": ARCHIVAL.roadCasing,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            0.6,
            12,
            2,
            16,
            8,
          ],
        },
      },
      {
        id: "road-fill",
        type: "line",
        source: "ofm",
        "source-layer": "transportation",
        filter: [
          "in",
          ["get", "class"],
          [
            "literal",
            [
              "motorway",
              "trunk",
              "primary",
              "secondary",
              "tertiary",
              "minor",
              "service",
            ],
          ],
        ],
        paint: {
          "line-color": ARCHIVAL.road,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            0.4,
            12,
            1.4,
            16,
            6,
          ],
        },
      },
      {
        id: "rail",
        type: "line",
        source: "ofm",
        "source-layer": "transportation",
        filter: ["==", ["get", "class"], "rail"],
        paint: {
          "line-color": ARCHIVAL.roadCasing,
          "line-width": 0.6,
          "line-dasharray": [2, 2],
        },
      },
      {
        id: "place-city",
        type: "symbol",
        source: "ofm",
        "source-layer": "place",
        filter: ["in", ["get", "class"], ["literal", ["city", "town"]]],
        layout: {
          "text-field": ["coalesce", ["get", "name:de"], ["get", "name"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            12,
            14,
            16,
          ],
          "text-letter-spacing": 0.05,
        },
        paint: {
          "text-color": ARCHIVAL.fadedInk,
          "text-halo-color": ARCHIVAL.paperLight,
          "text-halo-width": 1.5,
        },
      },
      {
        id: "place-suburb",
        type: "symbol",
        source: "ofm",
        "source-layer": "place",
        minzoom: 11,
        filter: [
          "in",
          ["get", "class"],
          ["literal", ["suburb", "neighbourhood", "village", "hamlet"]],
        ],
        layout: {
          "text-field": ["coalesce", ["get", "name:de"], ["get", "name"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-letter-spacing": 0.05,
        },
        paint: {
          "text-color": ARCHIVAL.sepia,
          "text-halo-color": ARCHIVAL.paperLight,
          "text-halo-width": 1.2,
        },
      },
      {
        id: "road-label",
        type: "symbol",
        source: "ofm",
        "source-layer": "transportation_name",
        minzoom: 14,
        layout: {
          "text-field": ["coalesce", ["get", "name:de"], ["get", "name"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": 10,
          "symbol-placement": "line",
        },
        paint: {
          "text-color": ARCHIVAL.fadedInk,
          "text-halo-color": ARCHIVAL.paperLight,
          "text-halo-width": 1,
        },
      },
    ],
  };
}
