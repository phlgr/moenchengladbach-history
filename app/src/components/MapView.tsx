import { useEffect, useRef, useState } from "react";
import type { Map as MlMap, GeoJSONSource } from "maplibre-gl";
import { Sidebar, type SidebarSelection } from "./Sidebar";
import { createMapStyle } from "../lib/mapStyle";
import { THEMES, type ThemeId } from "../lib/themes";
import { useLayerState } from "../lib/layerState";

const MG_CENTER: [number, number] = [6.444, 51.196];
const MG_DEFAULT_ZOOM = 12;
// Snug bounds around Mönchengladbach for normal browsing — keeps the
// user from panning into the void. Dropped while deportation mode is
// active so the cinematic European overview can fit on portrait
// phones (which need to zoom out far past these bounds).
const MG_MAX_BOUNDS: [[number, number], [number, number]] = [
  [4.5, 49],
  [9, 53],
];

const ORDERED_THEMES: ThemeId[] = [
  "stolpersteine",
  "ns-synagogen",
  "ns-friedhoefe",
  "ns-bunker",
  "ns-stolperschwellen",
  "ns-zwangsarbeit",
  "ns-taeter",
  "ns-strassen",
  "ns-gedenkorte",
];

function contentDirFor(theme: ThemeId): string {
  return theme === "stolpersteine" ? "stolpersteine" : "ns-orte";
}

const DEPORTATION_LAYERS = [
  "deportation-arcs",
  "deportation-arcs-glow",
  "deportation-dest-circle",
  "deportation-dest-ring",
  "deportation-dest-label",
];

const POI_OPACITY_PROPS: Array<{ suffix: string; prop: string }> = [
  { suffix: "-clusters", prop: "circle-opacity" },
  { suffix: "-cluster-count", prop: "text-opacity" },
  { suffix: "-points", prop: "circle-opacity" },
  { suffix: "-points-selected", prop: "circle-opacity" },
];

function setPoiOpacity(map: MlMap, value: number) {
  for (const theme of ORDERED_THEMES) {
    for (const { suffix, prop } of POI_OPACITY_PROPS) {
      const id = `${theme}${suffix}`;
      if (map.getLayer(id)) {
        map.setPaintProperty(id, prop, value);
      }
    }
  }
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

const HALO_MAX_OPACITY = 0.18;
const FADE_IN_MS = 120;
const FADE_OUT_MS = 400;
// Cadence of the life-manager interval. 30 ms ≈ 33 fps — fine-grained
// enough that a 400 ms fade-out is rendered in ~13 steps without
// running per-frame.
const LIFE_TICK_MS = 30;

// A feature currently visible in the "recent arrivals" overlay. The
// life manager mutates `fade` on each tick; the lifecycle phase
// determines the direction and rate.
//   in: fading 0 → 1 over FADE_IN_MS (just arrived)
//   hold: fully visible while currentDate's month equals arrivalMonth
//   out: fading 1 → 0 over FADE_OUT_MS (currentDate has moved past)
type RecentLifeFeature = {
  feature: GeoJSON.Feature;
  arrivalMonth: string;
  phase: "in" | "hold" | "out";
  fade: number;
  lastUpdate: number;
};

function featureKey(f: GeoJSON.Feature): string {
  const props = f.properties as Record<string, unknown> | null;
  const id = props?.["id"];
  if (typeof id === "string" && id.length > 0) return id;
  // Fallback — coordinates uniquely identify features without an `id`.
  if (f.geometry?.type === "Point") {
    const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
    return `${lng.toFixed(6)},${lat.toFixed(6)}`;
  }
  return JSON.stringify(f.geometry);
}

// Re-feed both sources for a theme:
//   1. cumulative `${theme}` — same visible features as before, but
//      with `_fade` merged onto features that are currently fading.
//      The source's `clusterProperties._fade_max` aggregate then
//      drives the cluster-bubble ring (so clustered features get a
//      ring on the cluster, not on each member's original lat/lng).
//   2. `${theme}-recent` — only the currently-fading individual
//      features, with `_fade`. Drives the per-point ring at high
//      zoom (where features are un-clustered).
function paintRecentLife(
  map: MlMap,
  theme: string,
  cumulative: GeoJSON.Feature[],
  life: Map<string, RecentLifeFeature>,
) {
  const cumSrc = map.getSource(theme) as GeoJSONSource | undefined;
  if (cumSrc) {
    const out: GeoJSON.Feature[] = cumulative.map((f) => {
      const id = featureKey(f);
      const entry = life.get(id);
      if (!entry || entry.fade <= 0) return f;
      return {
        ...f,
        properties: { ...(f.properties ?? {}), _fade: entry.fade },
      };
    });
    cumSrc.setData({ type: "FeatureCollection", features: out });
  }

  const recentSrc = map.getSource(`${theme}-recent`) as
    | GeoJSONSource
    | undefined;
  if (recentSrc) {
    const recent: GeoJSON.Feature[] = [];
    for (const entry of life.values()) {
      if (entry.fade <= 0) continue;
      recent.push({
        ...entry.feature,
        properties: {
          ...(entry.feature.properties ?? {}),
          _fade: entry.fade,
        },
      });
    }
    recentSrc.setData({ type: "FeatureCollection", features: recent });
  }
}

// Run the life manager interval. Each tick advances `fade` for every
// in-flight feature in every theme and re-feeds the cumulative source
// with merged values. When nothing is in-flight, the interval is
// paused. Reduced-motion short-circuits to terminal values.
function ensureRecentTicker(
  map: MlMap,
  cumulativeRef: React.MutableRefObject<Record<string, GeoJSON.Feature[]>>,
  lifeRef: React.MutableRefObject<Record<string, Map<string, RecentLifeFeature>>>,
  tickerRef: React.MutableRefObject<number | null>,
  reduceMotion: boolean,
) {
  if (reduceMotion) {
    if (tickerRef.current != null) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    for (const [theme, life] of Object.entries(lifeRef.current)) {
      for (const entry of life.values()) {
        entry.fade = entry.phase === "out" ? 0 : 1;
        if (entry.phase === "in") entry.phase = "hold";
      }
      const cumulative = cumulativeRef.current[theme] ?? [];
      paintRecentLife(map, theme, cumulative, life);
    }
    return;
  }
  if (tickerRef.current != null) return; // Already running.
  tickerRef.current = window.setInterval(() => {
    const now = performance.now();
    let anyAlive = false;
    for (const [theme, life] of Object.entries(lifeRef.current)) {
      let mutated = false;
      for (const [id, entry] of life) {
        const dt = now - entry.lastUpdate;
        entry.lastUpdate = now;
        if (entry.phase === "in") {
          entry.fade = Math.min(1, entry.fade + dt / FADE_IN_MS);
          if (entry.fade >= 1) entry.phase = "hold";
          mutated = true;
        } else if (entry.phase === "out") {
          entry.fade = Math.max(0, entry.fade - dt / FADE_OUT_MS);
          mutated = true;
          if (entry.fade <= 0) {
            life.delete(id);
          }
        }
      }
      if (mutated) {
        const cumulative = cumulativeRef.current[theme] ?? [];
        paintRecentLife(map, theme, cumulative, life);
      }
      if (life.size > 0) anyAlive = true;
    }
    if (!anyAlive && tickerRef.current != null) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  }, LIFE_TICK_MS);
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const {
    active,
    setCount,
    deportationMode,
    setDeportationCount,
    currentDate,
    setAttributionExpanded,
  } = useLayerState();
  const [selection, setSelection] = useState<SidebarSelection>(null);
  const selectionRef = useRef<SidebarSelection>(null);
  const deportationModeRef = useRef(false);
  // Monotonically increasing ID for the deportation-mode effect.
  // Cleanup sets it to -1 so every pending timeout / RAF from the
  // previous invocation bails out before touching the map, preventing
  // race conditions when the user toggles quickly (e.g. on → off → on).
  const effectIdRef = useRef(-1);
  // Original (unfiltered) GeoJSON kept per theme so we can re-filter
  // by year without re-fetching.
  const sourceDataRef = useRef<Record<string, GeoJSON.FeatureCollection>>({});
  // The currently-visible (cumulative) feature set per theme — the
  // subset of `sourceDataRef` whose date is null or <= currentDate.
  // Recomputed only when `currentDate` changes; the life manager
  // re-feeds it to the source on each tick with merged `_fade` values.
  const cumulativeRef = useRef<Record<string, GeoJSON.Feature[]>>({});
  // In-flight "recent" features per theme keyed by feature id. The
  // life manager mutates the entries in place between paint frames.
  const recentLifeRef = useRef<Record<string, Map<string, RecentLifeFeature>>>(
    {},
  );
  const recentTickerRef = useRef<number | null>(null);
  // Snapshots of original GeoJSON for exit cleanup (reset truncated coords + fade).
  const arcOrigDataRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const destOrigDataRef = useRef<GeoJSON.FeatureCollection | null>(null);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    deportationModeRef.current = deportationMode;
  }, [deportationMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    for (const theme of ORDERED_THEMES) {
      const visible = active[theme] ? "visible" : "none";
      for (const lid of [
        `${theme}-clusters`,
        `${theme}-cluster-count`,
        `${theme}-points`,
        `${theme}-points-selected`,
        `${theme}-recent-halo`,
        `${theme}-recent-ring`,
        `${theme}-cluster-fade-halo`,
        `${theme}-cluster-fade-ring`,
      ]) {
        if (map.getLayer(lid)) {
          map.setLayoutProperty(lid, "visibility", visible);
        }
      }
    }
  }, [active]);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let mapInstance: MlMap | null = null;
    let attribObserver: MutationObserver | null = null;

    (async () => {
      const [maplibregl, { Protocol }] = await Promise.all([
        import("maplibre-gl").then((m) => m.default),
        import("pmtiles"),
      ]);
      if (cancelled || !containerRef.current) return;

      const proto = new Protocol();
      maplibregl.addProtocol("pmtiles", proto.tile);

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: createMapStyle(),
        center: MG_CENTER,
        zoom: MG_DEFAULT_ZOOM,
        maxBounds: MG_MAX_BOUNDS,
        // Disable the auto-mounted bottom-right attribution; we mount
        // it manually at bottom-left so it never collides with the
        // centered Timeline strip at the bottom of the viewport.
        attributionControl: false,
      });
      mapInstance = map;
      mapRef.current = map;
      if (typeof window !== "undefined") {
        (window as unknown as { __map?: MlMap }).__map = map;
      }

      map.addControl(new maplibregl.NavigationControl(), "top-right");
      map.addControl(
        new maplibregl.GeolocateControl({
          positionOptions: { enableHighAccuracy: false },
          trackUserLocation: true,
        }),
        "top-right",
      );
      map.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        "bottom-left",
      );

      map.on("load", async () => {
        await Promise.all(
          ORDERED_THEMES.map(async (theme) => {
            const res = await fetch(`/data/${theme}.geojson`);
            if (!res.ok) return;
            const fc = (await res.json()) as GeoJSON.FeatureCollection;
            if (cancelled) return;
            setCount(theme, fc.features.length);
            sourceDataRef.current[theme] = fc;
            addThemeLayers(map, theme, fc);
          }),
        );

        // Deportation network — sources + layers stay added, opacity
        // animates between 0 and 1 when the user toggles cinematic mode.
        await loadDeportationLayers(map);

        // Watch for attribution box expand/collapse to shift timeline.
        // MapLibre adds `maplibregl-compact-show` while the panel is
        // expanded; absence means collapsed (just the "i" icon).
        const attribEl = document.querySelector(".maplibregl-ctrl-attrib");
        if (attribEl) {
          const sync = () =>
            setAttributionExpanded(
              attribEl.classList.contains("maplibregl-compact-show"),
            );
          sync();
          attribObserver = new MutationObserver(sync);
          attribObserver.observe(attribEl, { attributes: true, attributeFilter: ["class"] });
        }

        map.on("click", (e) => {
          if (deportationModeRef.current) return;
          const layers = ORDERED_THEMES.flatMap((t) => [
            `${t}-points`,
            `${t}-clusters`,
          ]).filter((l) => map.getLayer(l));
          const hits = map.queryRenderedFeatures(e.point, { layers });
          if (hits.length === 0 && selectionRef.current !== null) {
            setSelection(null);
            for (const t of ORDERED_THEMES) {
              if (map.getLayer(`${t}-points-selected`)) {
                map.setFilter(`${t}-points-selected`, [
                  "==",
                  ["get", "id"],
                  "",
                ]);
              }
            }
          }
        });
      });

      async function loadDeportationLayers(map: MlMap) {
        const [arcsRes, destRes] = await Promise.all([
          fetch("/data/deportations.geojson"),
          fetch("/data/deportation-destinations.geojson"),
        ]);
        if (!arcsRes.ok || !destRes.ok) return;
        const arcs = await arcsRes.json();
        const dests = await destRes.json();
        if (cancelled) return;

        setDeportationCount(arcs.features.length);

        // Seed each arc with _progress so the trace animation can
        // drive per-feature trim via a data-driven expression.
        const arcsFc: GeoJSON.FeatureCollection = {
          ...arcs,
          features: arcs.features.map((f: GeoJSON.Feature) => ({
            ...f,
            properties: { ...(f.properties ?? {}), _progress: 0 },
          })),
        };

        // Keep a pristine copy for exit cleanup (reset truncated coords).
        arcOrigDataRef.current = { type: "FeatureCollection", features: arcs.features };

        // Store full coordinates on each feature so the trace loop always
        // has fresh data — MapLibre may replace objects internally after
        // setData, so we never rely on mutated geometry persisting.
        for (const f of arcsFc.features) {
          const coords = f.geometry?.type === "LineString"
            ? (f.geometry as GeoJSON.LineString).coordinates
            : null;
          if (coords) {
            (f.properties as Record<string, unknown>)["_full_coords"] = coords;
          }
        }

        map.addSource("deportations", { type: "geojson", data: arcsFc });

        // Store pristine destination data for exit cleanup.
        destOrigDataRef.current = JSON.parse(
          JSON.stringify(dests),
        ) as GeoJSON.FeatureCollection;

        map.addSource("deportation-destinations", {
          type: "geojson",
          data: dests,
        });

        // Soft glow under the arcs — broader, very faint.
        map.addLayer({
          id: "deportation-arcs-glow",
          type: "line",
          source: "deportations",
          paint: {
            "line-color": "#8a1f0e",
            "line-opacity": 0,
            "line-blur": 4,
            "line-width": [
              "interpolate",
              ["linear"],
              ["get", "count"],
              1,
              4,
              12,
              10,
            ],
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });

        map.addLayer({
          id: "deportation-arcs",
          type: "line",
          source: "deportations",
          paint: {
            "line-color": "#8a1f0e",
            "line-opacity": 0,
            "line-width": [
              "interpolate",
              ["linear"],
              ["get", "count"],
              1,
              0.7,
              4,
              1.4,
              12,
              2.4,
            ],
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });

        map.addLayer({
          id: "deportation-dest-ring",
          type: "circle",
          source: "deportation-destinations",
          paint: {
            "circle-color": "transparent",
            "circle-opacity": [
              "*",
              ["coalesce", ["get", "_fade"], 0],
              1,
            ],
            "circle-stroke-color": "#1c1814",
            "circle-stroke-width": 1,
            "circle-stroke-opacity": [
              "*",
              ["coalesce", ["get", "_fade"], 0],
              0.6,
            ],
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["get", "count"],
              1,
              7,
              80,
              22,
            ],
          },
        });

        map.addLayer({
          id: "deportation-dest-circle",
          type: "circle",
          source: "deportation-destinations",
          paint: {
            "circle-color": "#8a1f0e",
            "circle-opacity": [
              "*",
              ["coalesce", ["get", "_fade"], 0],
              1,
            ],
            "circle-stroke-color": "#faf3df",
            "circle-stroke-width": 1.6,
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["get", "count"],
              1,
              4,
              80,
              12,
            ],
          },
        });

        map.addLayer({
          id: "deportation-dest-label",
          type: "symbol",
          source: "deportation-destinations",
          layout: {
            "text-field": [
              "format",
              ["get", "name"],
              { "font-scale": 1 },
              "  ",
              {},
              ["to-string", ["get", "count"]],
              { "font-scale": 0.85 },
            ],
            "text-font": ["Noto Sans Regular"],
            "text-size": [
              "interpolate",
              ["linear"],
              ["zoom"],
              4,
              10,
              7,
              13,
            ],
            "text-offset": [0, 1.4],
            "text-anchor": "top",
            "text-letter-spacing": 0.04,
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": "#1c1814",
            "text-halo-color": "#f5edd6",
            "text-halo-width": 1.5,
            "text-opacity": [
              "*",
              ["coalesce", ["get", "_fade"], 0],
              1,
            ],
          },
        });
      }

      function addThemeLayers(
        map: MlMap,
        theme: ThemeId,
        fc: GeoJSON.FeatureCollection,
      ) {
        addThemeSourceAndLayers(map, theme, fc, true);
        addRecentOverlay(map, theme);
      }

      // Per-theme "new in this month" overlay. Two pairs of layers:
      //   - `${theme}-recent-halo`/`-ring` read from the separate
      //     `${theme}-recent` source and render the per-feature ring
      //     at each in-flight feature's lat/lng. This source is small
      //     (just whatever's fading) and visible at every zoom.
      //   - `${theme}-cluster-fade-halo`/`-ring` read from the
      //     cumulative `${theme}` source (filtered to clusters) and
      //     light up the cluster bubble itself when any of its
      //     members are still fading, so the ring sits on the
      //     cluster, not on each member's original lat/lng.
      function addRecentOverlay(map: MlMap, theme: ThemeId) {
        const colors = THEMES[theme];

        const sourceId = `${theme}-recent`;
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
        }

        // Per-feature individual ring + halo.
        map.addLayer({
          id: `${theme}-recent-halo`,
          type: "circle",
          source: sourceId,
          paint: {
            "circle-color": colors.pointColor,
            "circle-opacity": [
              "*",
              HALO_MAX_OPACITY,
              ["coalesce", ["get", "_fade"], 0],
            ] as any,
            "circle-blur": 0.6,
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              14,
              14,
              22,
            ],
          },
        });
        map.addLayer({
          id: `${theme}-recent-ring`,
          type: "circle",
          source: sourceId,
          paint: {
            "circle-color": "transparent",
            "circle-stroke-color": "#8a1f0e",
            "circle-stroke-width": 1.6,
            "circle-stroke-opacity": [
              "coalesce",
              ["get", "_fade"],
              0,
            ] as any,
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              7,
              14,
              11,
            ],
          },
        });

        // Cluster-bubble ring + halo, driven by `_fade_max` aggregate.
        map.addLayer({
          id: `${theme}-cluster-fade-halo`,
          type: "circle",
          source: theme,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": colors.pointColor,
            "circle-opacity": [
              "*",
              HALO_MAX_OPACITY,
              ["coalesce", ["get", "_fade_max"], 0],
            ] as any,
            "circle-blur": 0.6,
            "circle-radius": [
              "step",
              ["get", "point_count"],
              21,
              10,
              25,
              50,
              30,
            ],
          },
        });
        map.addLayer({
          id: `${theme}-cluster-fade-ring`,
          type: "circle",
          source: theme,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "transparent",
            "circle-stroke-color": "#8a1f0e",
            "circle-stroke-width": 1.6,
            "circle-stroke-opacity": [
              "coalesce",
              ["get", "_fade_max"],
              0,
            ] as any,
            "circle-radius": [
              "step",
              ["get", "point_count"],
              16,
              10,
              20,
              50,
              25,
            ],
          },
        });
      }
    })();

    return () => {
      cancelled = true;
      attribObserver?.disconnect();
      if (recentTickerRef.current != null) {
        clearInterval(recentTickerRef.current);
        recentTickerRef.current = null;
      }
      mapInstance?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shared layer-creation helper used both during initial map setup
  // (clustered) and when the timeline toggles cluster mode off/on.
  function addThemeSourceAndLayers(
    map: MlMap,
    theme: ThemeId,
    fc: GeoJSON.FeatureCollection,
    cluster: boolean,
  ) {
    const colors = THEMES[theme];
    if (fc.features.length === 0 && cluster) {
      // empty source still useful so subsequent setData works
    }
    map.addSource(theme, {
      type: "geojson",
      data: fc,
      ...(cluster
        ? {
            cluster: true,
            clusterRadius: 40,
            clusterMaxZoom: 14,
            // Aggregate the maximum `_fade` across leaves so the
            // recent-overlay ring sits on the cluster bubble itself
            // (instead of at the original lat/lng of each member,
            // which would be hidden inside the cluster). The cluster
            // bubble lights up while any of its features are still
            // fading.
            clusterProperties: {
              _fade_max: ["max", ["coalesce", ["get", "_fade"], 0]],
            },
          }
        : { cluster: false }),
    });

    if (cluster) {
      map.addLayer({
        id: `${theme}-clusters`,
        type: "circle",
        source: theme,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": colors.clusterColor,
          "circle-stroke-color": "#faf8f5",
          "circle-stroke-width": 2,
          "circle-radius": [
            "step",
            ["get", "point_count"],
            13,
            10,
            17,
            50,
            22,
          ],
          // When the timeline ticks bring fresh features into a
          // cluster, the radius bumps to the next step. This eases the
          // jump so bubbles visibly breathe rather than snap. Honors
          // prefers-reduced-motion (instant when the user opts out).
          "circle-radius-transition": {
            duration: prefersReducedMotion() ? 0 : 350,
            delay: 0,
          },
          "circle-opacity": 0.92,
        },
      });
      map.addLayer({
        id: `${theme}-cluster-count`,
        type: "symbol",
        source: theme,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
        },
        paint: { "text-color": "#faf8f5" },
      });
    }

    const pointsLayer: any = {
      id: `${theme}-points`,
      type: "circle",
      source: theme,
      paint: {
        "circle-color": colors.pointColor,
        "circle-stroke-color": "#faf8f5",
        "circle-stroke-width": 1.5,
        "circle-radius": cluster
          ? ["interpolate", ["linear"], ["zoom"], 12, 4, 16, 7]
          // When clustering is off, scale points up slightly at the
          // mid zooms so individuals stay visible across the city.
          : ["interpolate", ["linear"], ["zoom"], 10, 3, 14, 5, 17, 8],
      },
    };
    if (cluster) {
      pointsLayer.filter = ["!", ["has", "point_count"]];
    }
    map.addLayer(pointsLayer);

    map.addLayer({
      id: `${theme}-points-selected`,
      type: "circle",
      source: theme,
      filter: ["==", ["get", "id"], ""],
      paint: {
        "circle-color": colors.pointColor,
        "circle-stroke-color": "#3a3530",
        "circle-stroke-width": 2.5,
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          12,
          7,
          16,
          11,
        ],
      },
    });

    // Click handlers — same handlers attach for both modes (cluster
    // expansion is a no-op when cluster: false).
    if (cluster) {
      map.on("click", `${theme}-clusters`, (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const clusterId = f.properties?.cluster_id;
        const src = map.getSource(theme) as GeoJSONSource;
        src.getClusterExpansionZoom(clusterId).then((zoom) => {
          const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
          map.easeTo({ center: [lng, lat], zoom });
        });
      });
    }

    map.on("click", `${theme}-points`, (e) => {
      if (deportationModeRef.current) return;
      const f = e.features?.[0];
      if (!f) return;
      const id = f.properties?.id as string;
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
      setSelection({ theme, id, contentDir: contentDirFor(theme) });
      for (const t of ORDERED_THEMES) {
        if (map.getLayer(`${t}-points-selected`)) {
          map.setFilter(`${t}-points-selected`, [
            "==",
            ["get", "id"],
            t === theme ? id : "",
          ]);
        }
      }
      map.easeTo({
        center: [lng, lat],
        offset: [-Math.min(window.innerWidth * 0.25, 210), 0],
        duration: 600,
      });
    });

    for (const lid of cluster
      ? [`${theme}-clusters`, `${theme}-points`]
      : [`${theme}-points`]) {
      map.on("mouseenter", lid, () => {
        if (deportationModeRef.current) return;
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", lid, () => {
        map.getCanvas().style.cursor = "";
      });
    }
  }

  // Date filter — re-feed each theme's cumulative source with the
  // subset of features whose `date` is null (always visible) or
  // <= currentDate. The recent overlay is driven separately by the
  // life manager: when currentDate moves into a new month, freshly
  // arriving features start fading in; features that were "in" or
  // "hold" but no longer match the current month switch to "out" and
  // fade away over FADE_OUT_MS, completing even when the playhead has
  // already moved several months ahead.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const now = performance.now();

    for (const theme of ORDERED_THEMES) {
      const original = sourceDataRef.current[theme];
      if (!original) continue;

      const life =
        recentLifeRef.current[theme] ??
        (recentLifeRef.current[theme] = new Map());

      let cumulativeFeatures: GeoJSON.Feature[];
      if (currentDate === null) {
        cumulativeFeatures = original.features;
        // No recent overlay in "show all" — kill any in-flight rings.
        life.clear();
      } else {
        const curMonth = currentDate.slice(0, 7);
        cumulativeFeatures = [];
        for (const f of original.features) {
          const d = (f.properties as Record<string, unknown> | null)?.["date"];
          const ds = typeof d === "string" ? d : null;
          if (ds == null) {
            cumulativeFeatures.push(f);
            continue;
          }
          if (ds <= currentDate) {
            cumulativeFeatures.push(f);
            const m = ds.slice(0, 7);
            if (m === curMonth) {
              const id = featureKey(f);
              const existing = life.get(id);
              if (!existing) {
                life.set(id, {
                  feature: f,
                  arrivalMonth: m,
                  phase: reduceMotion ? "hold" : "in",
                  fade: reduceMotion ? 1 : 0,
                  lastUpdate: now,
                });
              } else if (existing.arrivalMonth !== m) {
                // Backwards user jump landed back on this feature's
                // own month — restart the lifecycle.
                existing.arrivalMonth = m;
                existing.phase = reduceMotion ? "hold" : "in";
                existing.fade = reduceMotion ? 1 : existing.fade;
                existing.lastUpdate = now;
              }
            }
          }
        }

        // Anything in the life-map whose arrival month no longer
        // matches the current month should start fading out — unless
        // it's already out.
        for (const [id, entry] of life) {
          if (entry.arrivalMonth !== curMonth && entry.phase !== "out") {
            entry.phase = "out";
            entry.lastUpdate = now;
            if (reduceMotion) {
              life.delete(id);
            }
          }
        }
      }

      cumulativeRef.current[theme] = cumulativeFeatures;
      paintRecentLife(map, theme, cumulativeFeatures, life);
    }

    ensureRecentTicker(
      map,
      cumulativeRef,
      recentLifeRef,
      recentTickerRef,
      reduceMotion,
    );
  }, [currentDate]);

  // Cinematic deportation-mode transition — per-arc trace animation.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let raf: number | null = null;

    function animate(
      from: number,
      to: number,
      ms: number,
      onTick: (v: number) => void,
      onDone?: () => void,
    ) {
      const start = performance.now();
      function step(now: number) {
        if (effectIdRef.current === -1) return;
        const t = Math.min(1, (now - start) / ms);
        // ease-in-out cubic
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        onTick(from + (to - from) * e);
        if (t < 1) raf = requestAnimationFrame(step);
        else onDone?.();
      }
      raf = requestAnimationFrame(step);
    }

    // ease-out cubic — head decelerates as it approaches destination
    function easeOutCubic(t: number): number {
      return 1 - Math.pow(1 - t, 3);
    }

    if (deportationMode) {
      const id = ++effectIdRef.current;
      setSelection(null);
      map.setMaxBounds(undefined);

      // The exit animation calls setPaintProperty with numeric constants
      // for circle/text opacity, which overwrites the data-driven `_fade`
      // expressions installed at layer creation. Re-install them here so
      // the trace loop's per-feature `_fade` updates take effect on every
      // entry — without this, the second toggle-on shows arcs but no
      // destination markers (paint stuck at constant 0 from the prior fade).
      if (map.getLayer("deportation-dest-circle")) {
        map.setPaintProperty(
          "deportation-dest-circle",
          "circle-opacity",
          ["coalesce", ["get", "_fade"], 0] as any,
        );
      }
      if (map.getLayer("deportation-dest-ring")) {
        map.setPaintProperty(
          "deportation-dest-ring",
          "circle-opacity",
          ["coalesce", ["get", "_fade"], 0] as any,
        );
        map.setPaintProperty(
          "deportation-dest-ring",
          "circle-stroke-opacity",
          ["*", ["coalesce", ["get", "_fade"], 0], 0.6] as any,
        );
      }
      if (map.getLayer("deportation-dest-label")) {
        map.setPaintProperty(
          "deportation-dest-label",
          "text-opacity",
          ["coalesce", ["get", "_fade"], 0] as any,
        );
      }

      const narrow =
        typeof window !== "undefined" && window.innerWidth < 640;
      map.fitBounds(
        [
          [3.5, 47.8],
          [27.5, 57.8],
        ],
        {
          padding: narrow
            ? { top: 24, bottom: 24, left: 16, right: 16 }
            : { top: 80, bottom: 80, left: 320, right: 80 },
          duration: 1500,
          essential: true,
        },
      );

      // Fade out POI markers during camera move.
      animate(1, 0.18, 700, (v) => setPoiOpacity(map, v));

      const reduceMotion = prefersReducedMotion();

      if (reduceMotion) {
        // Fallback: simple fade-in after camera settles — no trace.
        const settle2 = setTimeout(() => {
          if (id !== effectIdRef.current) return;
          animate(0, 0.85, 1100, (v) => {
            if (id !== effectIdRef.current) return;
            if (!map.getLayer("deportation-arcs")) return;
            map.setPaintProperty("deportation-arcs", "line-opacity", v);
            map.setPaintProperty(
              "deportation-arcs-glow",
              "line-opacity",
              v * 0.35,
            );
          });
          animate(
            0,
            1,
            900,
            (v) => {
              if (id !== effectIdRef.current) return;
              if (!map.getLayer("deportation-dest-circle")) return;
              map.setPaintProperty(
                "deportation-dest-circle",
                "circle-opacity",
                v,
              );
              map.setPaintProperty(
                "deportation-dest-ring",
                "circle-stroke-opacity",
                v * 0.6,
              );
              map.setPaintProperty(
                "deportation-dest-label",
                "text-opacity",
                v,
              );
            },
          );
        }, 800);
        return () => {
          effectIdRef.current = -1;
          clearTimeout(settle2);
          if (raf) cancelAnimationFrame(raf);
        };
      }

      const settle = setTimeout(async () => {
        if (id !== effectIdRef.current) return;

        // --- Per-arc trace animation ---
        if (id !== effectIdRef.current) return;
        const arcsSrc = map.getSource("deportations") as GeoJSONSource | undefined;
        const destsSrc = map.getSource("deportation-destinations") as GeoJSONSource | undefined;
        if (!arcsSrc || !destsSrc) return;

        // Snapshot original arc features (full coords + properties).
        const origArcs = (await arcsSrc.getData()) as GeoJSON.FeatureCollection;
        // Snapshot original destination features.
        const origDests = (await destsSrc.getData()) as GeoJSON.FeatureCollection;

        if (id !== effectIdRef.current) return;

        // Build a lookup from destination display name → original feature.
        const origDestByName = new Map<string, GeoJSON.Feature>();
        for (const d of origDests.features) {
          if (id !== effectIdRef.current) return;
          const props = d.properties as Record<string, unknown> | null;
          if (props?.["name"] && typeof props["name"] === "string") {
            origDestByName.set(props["name"], d);
          }
        }

        // Calculate distance from MG to each arc's destination.
        const mg: [number, number] = MG_CENTER;
        function haversine(a: [number, number], b: [number, number]): number {
          const R = 6371e3;
          const dLat = (b[1] - a[1]) * Math.PI / 180;
          const dLon = (b[0] - a[0]) * Math.PI / 180;
          const x = Math.sin(dLat / 2) ** 2 +
            Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
          return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
        }

        // Store original arc features with their distances, sorted by distance.
        type ArcEntry = { orig: GeoJSON.Feature; dist: number };
        const arcsByDist: ArcEntry[] = [];
        for (const f of origArcs.features) {
          const coords = f.geometry?.type === "LineString"
            ? (f.geometry as GeoJSON.LineString).coordinates
            : null;
          if (!coords || coords.length < 2) continue;
          arcsByDist.push({ orig: f, dist: haversine(mg, coords[coords.length - 1] as [number, number]) });
        }
        arcsByDist.sort((a, b) => a.dist - b.dist);

        const TRACE_DURATION = 1100; // ms per arc
        const STAGGER_SPAN = 1800;   // total stagger window for all arcs

        const staggerDelayForIndex = (i: number, n: number) => {
          if (n <= 1) return 0;
          return (i / (n - 1)) * STAGGER_SPAN;
        };

        // Per-destination fade state.
        type DestFadeState = { cur: number; start: number | null; active: boolean };
        const destFades = new Map<string, DestFadeState>();

        function traceFrame() {
          if (id !== effectIdRef.current) return;
          const now = performance.now();

          // Build fresh arc features from originals + current progress.
          const arcFeatures: GeoJSON.Feature[] = [];
          for (let i = 0; i < arcsByDist.length; i++) {
            if (id !== effectIdRef.current) return;
            const elapsed = now - arcStartTimes[i];
            const raw = Math.min(1, Math.max(0, elapsed / TRACE_DURATION));
            const p = easeOutCubic(raw);

            const orig = arcsByDist[i].orig;
            const props = orig.properties ?? {};
            const fullCoords = (orig.geometry as GeoJSON.LineString).coordinates as [number, number][];

            // Truncate to prefix up to current head position.
            const headIndex = Math.min(
              Math.floor(p * (fullCoords.length - 1)),
              fullCoords.length - 1,
            );
            arcFeatures.push({
              ...orig,
              geometry: {
                type: "LineString",
                coordinates: fullCoords.slice(0, headIndex + 1),
              } as GeoJSON.LineString,
              properties: { ...props, _progress: p },
            });

            // Handle destination fade-in when arc completes.
            const destName = props["dest_name"] as string;
            if (raw >= 1) {
              let ds = destFades.get(destName);
              if (!ds || !ds.active) {
                ds = { cur: 0, start: now, active: true };
                destFades.set(destName, ds);
              }
              const ft = Math.min(1, (now - (ds.start!)) / 250);
              // ease-out cubic for gentle pop-in
              ds.cur = ft < 0.5 ? 4 * ft * ft * ft : 1 - Math.pow(-2 * ft + 2, 3) / 2;
            } else {
              const ds = destFades.get(destName);
              if (ds && ds.cur > 0) {
                ds.active = false; // stop animating
              }
            }
          }

          // Build fresh destination features with per-destination _fade.
          const destFeatures: GeoJSON.Feature[] = origDests.features.map((d) => {
            const props = d.properties ?? {};
            const name = props["name"] as string;
            if (!name) return d;

            let fade = 0;
            const ds = destFades.get(name);
            if (ds && ds.cur > 0) {
              fade = ds.cur;
            }
            return { ...d, properties: { ...props, _fade: fade } };
          });

          // Feed updated data back to sources.
          if (!arcsSrc || !destsSrc) return;
          arcsSrc.setData({ type: "FeatureCollection", features: arcFeatures });
          destsSrc.setData({ type: "FeatureCollection", features: destFeatures });

          // Stop when all arcs are fully drawn and destinations have faded in.
          const allDone = arcsByDist.every((_, i) => {
            const elapsed = now - arcStartTimes[i];
            return Math.max(0, elapsed / TRACE_DURATION) >= 1;
          }) && [...destFades.values()].every(ds => ds.cur >= 1);
          if (!allDone) {
            raf = requestAnimationFrame(traceFrame);
          } else {
            raf = null;
          }
        }

        const arcStartTimes = arcsByDist.map((_, i) =>
          performance.now() + staggerDelayForIndex(i, arcsByDist.length),
        );

        // Start trace loop after a dramatic still beat — let the empty map
        // sink in before lines begin stretching outward.
        setTimeout(() => {
          if (id !== effectIdRef.current) return;

          // Fade in arc opacity so the trace is visible.
          animate(0, 0.85, 1100, (v) => {
            if (id !== effectIdRef.current) return;
            if (!map.getLayer("deportation-arcs")) return;
            map.setPaintProperty("deportation-arcs", "line-opacity", v);
            map.setPaintProperty("deportation-arcs-glow", "line-opacity", v * 0.35);
          });

          raf = requestAnimationFrame(traceFrame);
        }, 800);

        return () => {
          effectIdRef.current = -1;
          clearTimeout(settle);
          if (raf) cancelAnimationFrame(raf);
        };
      }, 800);

      return () => {
        effectIdRef.current = -1;
        clearTimeout(settle);
        if (raf) cancelAnimationFrame(raf);
      };
    } else {
      // Exit: fade arcs out, restore POI opacity, fly home.
      const id = ++effectIdRef.current;
      let raf2: number | null = null;

      function animateOut() {
        if (!map) return;
        const start = performance.now();
        function step(now: number) {
          if (id !== effectIdRef.current || !map) return;
          const t = Math.min(1, (now - start) / 500);
          const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          const v = (1 - e);

          if (map.getLayer("deportation-arcs")) {
            map.setPaintProperty("deportation-arcs", "line-opacity", v * 0.85);
            map.setPaintProperty("deportation-arcs-glow", "line-opacity", v * 0.35);
          }
          if (map.getLayer("deportation-dest-circle")) {
            map.setPaintProperty("deportation-dest-circle", "circle-opacity", v);
            map.setPaintProperty("deportation-dest-ring", "circle-stroke-opacity", v * 0.6);
            map.setPaintProperty("deportation-dest-label", "text-opacity", v);
          }

          if (t < 1) raf2 = requestAnimationFrame(step);
        }
        raf2 = requestAnimationFrame(step);
      }

      animateOut();
      animate(0.18, 1, 600, (v) => setPoiOpacity(map, v));
      map.flyTo({
        center: MG_CENTER,
        zoom: MG_DEFAULT_ZOOM,
        duration: 1500,
        essential: true,
      });

      // Restore snug MG bounds after flyTo completes.
      const restore = setTimeout(() => {
        if (id !== effectIdRef.current) return;
        if (!map) return;
        map.setMaxBounds(MG_MAX_BOUNDS);
      }, 1600);

      return () => {
        effectIdRef.current = -1;
        clearTimeout(restore);
        if (raf2) cancelAnimationFrame(raf2);
        // Reset source data to pristine coordinates + zero progress.
        if (!map) return;
        const arcsSrc = map.getSource("deportations") as GeoJSONSource | undefined;
        if (arcsSrc && arcOrigDataRef.current) {
          arcsSrc.setData({
            type: "FeatureCollection",
            features: arcOrigDataRef.current.features.map((f) => ({
              ...f,
              properties: { ...(f.properties ?? {}), _progress: 0 },
            })),
          });
        }
        // Also reset destination fade state.
        const destsSrc = map.getSource("deportation-destinations") as GeoJSONSource | undefined;
        if (destsSrc && destOrigDataRef.current) {
          destsSrc.setData({
            type: "FeatureCollection",
            features: destOrigDataRef.current.features.map((f) => ({
              ...f,
              properties: { ...(f.properties ?? {}), _fade: 0 },
            })),
          });
        }
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deportationMode]);

  return (
    <>
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" />
      </div>
      <Sidebar
        selection={selection}
        onClose={() => {
          setSelection(null);
          const map = mapRef.current;
          if (map) {
            for (const t of ORDERED_THEMES) {
              if (map.getLayer(`${t}-points-selected`)) {
                map.setFilter(`${t}-points-selected`, [
                  "==",
                  ["get", "id"],
                  "",
                ]);
              }
            }
          }
        }}
      />
    </>
  );
}
