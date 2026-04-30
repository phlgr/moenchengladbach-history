import type { StyleSpecification } from "maplibre-gl";

const ARCHIVAL = {
  paper: "#efe6cf",
  paperLight: "#faf8f5",
  earth: "#ede4cf",
  park: "#d6cda8",
  forest: "#bdb38c",
  water: "#a8b8b6",
  road: "#fbf4dd",
  roadCasingMinor: "#a89878",
  roadCasingMajor: "#7a6a4a",
  roadCasingHighway: "#5e4f30",
  building: "#d8cbac",
  buildingOutline: "#9a8a68",
  ink: "#3a3530",
  fadedInk: "#5e564a",
  sepia: "#7a5e3a",
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
          "fill-outline-color": ARCHIVAL.buildingOutline,
          "fill-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            13,
            0,
            14,
            0.9,
          ],
        },
      },

      // Minor / service roads — visible from mid zoom outwards
      {
        id: "road-minor-casing",
        type: "line",
        source: "ofm",
        "source-layer": "transportation",
        minzoom: 12,
        filter: [
          "in",
          ["get", "class"],
          ["literal", ["minor", "service", "track"]],
        ],
        paint: {
          "line-color": ARCHIVAL.roadCasingMinor,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            12,
            0.6,
            14,
            1.6,
            18,
            5,
          ],
        },
      },
      {
        id: "road-minor",
        type: "line",
        source: "ofm",
        "source-layer": "transportation",
        minzoom: 13,
        filter: [
          "in",
          ["get", "class"],
          ["literal", ["minor", "service", "track"]],
        ],
        paint: {
          "line-color": ARCHIVAL.road,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            13,
            0.4,
            16,
            2.4,
            18,
            4,
          ],
        },
      },

      // Tertiary / secondary
      {
        id: "road-major-casing",
        type: "line",
        source: "ofm",
        "source-layer": "transportation",
        filter: [
          "in",
          ["get", "class"],
          ["literal", ["secondary", "tertiary"]],
        ],
        paint: {
          "line-color": ARCHIVAL.roadCasingMajor,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            0.6,
            12,
            2.4,
            16,
            10,
          ],
        },
      },
      {
        id: "road-major",
        type: "line",
        source: "ofm",
        "source-layer": "transportation",
        filter: [
          "in",
          ["get", "class"],
          ["literal", ["secondary", "tertiary"]],
        ],
        paint: {
          "line-color": ARCHIVAL.road,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            0.3,
            12,
            1.6,
            16,
            8,
          ],
        },
      },

      // Primary / motorway / trunk
      {
        id: "road-highway-casing",
        type: "line",
        source: "ofm",
        "source-layer": "transportation",
        filter: [
          "in",
          ["get", "class"],
          ["literal", ["motorway", "trunk", "primary"]],
        ],
        paint: {
          "line-color": ARCHIVAL.roadCasingHighway,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            6,
            0.6,
            10,
            2.4,
            14,
            7,
            18,
            16,
          ],
        },
      },
      {
        id: "road-highway",
        type: "line",
        source: "ofm",
        "source-layer": "transportation",
        filter: [
          "in",
          ["get", "class"],
          ["literal", ["motorway", "trunk", "primary"]],
        ],
        paint: {
          "line-color": ARCHIVAL.road,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            6,
            0.4,
            10,
            1.6,
            14,
            5,
            18,
            13,
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
          "line-color": ARCHIVAL.roadCasingMajor,
          "line-width": 0.8,
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
