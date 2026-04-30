import { useEffect, useRef, useState } from "react";
import type { Map as MlMap, GeoJSONSource } from "maplibre-gl";
import { Sidebar, type SidebarSelection } from "./Sidebar";
import { createMapStyle } from "../lib/mapStyle";
import { THEMES, type ThemeId } from "../lib/themes";
import { useLayerState } from "../lib/layerState";

const MG_CENTER: [number, number] = [6.444, 51.196];
const MG_DEFAULT_ZOOM = 12;

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

// Re-feed a theme's cumulative source with the visible feature set,
// merging `_fade` values from the in-flight life-map. The cumulative
// source's `clusterProperties` then aggregates `_fade_max` per
// cluster, so the recent ring lights up the cluster bubble itself
// rather than the original lat/lng of each member.
function paintCumulativeWithFades(
  map: MlMap,
  theme: string,
  features: GeoJSON.Feature[],
  life: Map<string, RecentLifeFeature>,
) {
  const src = map.getSource(theme) as GeoJSONSource | undefined;
  if (!src) return;
  const out: GeoJSON.Feature[] = features.map((f) => {
    const id = featureKey(f);
    const entry = life.get(id);
    if (!entry || entry.fade <= 0) return f;
    return {
      ...f,
      properties: {
        ...(f.properties ?? {}),
        _fade: entry.fade,
      },
    };
  });
  src.setData({ type: "FeatureCollection", features: out });
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
      paintCumulativeWithFades(map, theme, cumulative, life);
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
        paintCumulativeWithFades(map, theme, cumulative, life);
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
  } = useLayerState();
  const [selection, setSelection] = useState<SidebarSelection>(null);
  const selectionRef = useRef<SidebarSelection>(null);
  const deportationModeRef = useRef(false);
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
        // Wide max bounds so the cinematic deportation view can fit.
        maxBounds: [
          [-2, 44],
          [32, 60],
        ],
        attributionControl: { compact: true },
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

        map.addSource("deportations", { type: "geojson", data: arcs });
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
            "circle-opacity": 0,
            "circle-stroke-color": "#1c1814",
            "circle-stroke-width": 1,
            "circle-stroke-opacity": 0,
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
            "circle-opacity": 0,
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
            "text-opacity": 0,
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

      // Per-theme "new in this month" overlay. Reads from the same
      // source as the cluster/point layers so the ring lights up at
      // whatever spot the feature is currently rendered — the cluster
      // bubble at low zoom, the individual point at high zoom. The
      // `_fade` is set per-feature and aggregated as `_fade_max` on
      // clusters via clusterProperties on the source.
      function addRecentOverlay(map: MlMap, theme: ThemeId) {
        const colors = THEMES[theme];
        const opacityFade: any = [
          "case",
          ["has", "point_count"],
          ["coalesce", ["get", "_fade_max"], 0],
          ["coalesce", ["get", "_fade"], 0],
        ];
        const haloRadius: any = [
          "case",
          ["has", "point_count"],
          // For clusters, hug the cluster bubble (point_count steps
          // mirror the `${theme}-clusters` layer's circle-radius) plus
          // a halo offset.
          ["step", ["get", "point_count"], 21, 10, 25, 50, 30],
          ["interpolate", ["linear"], ["zoom"], 10, 14, 14, 22],
        ];
        const ringRadius: any = [
          "case",
          ["has", "point_count"],
          ["step", ["get", "point_count"], 16, 10, 20, 50, 25],
          ["interpolate", ["linear"], ["zoom"], 10, 7, 14, 11],
        ];

        map.addLayer({
          id: `${theme}-recent-halo`,
          type: "circle",
          source: theme,
          paint: {
            "circle-color": colors.pointColor,
            "circle-opacity": ["*", HALO_MAX_OPACITY, opacityFade] as any,
            "circle-blur": 0.6,
            "circle-radius": haloRadius,
          },
        });
        map.addLayer({
          id: `${theme}-recent-ring`,
          type: "circle",
          source: theme,
          paint: {
            "circle-color": "transparent",
            "circle-stroke-color": "#8a1f0e",
            "circle-stroke-width": 1.6,
            "circle-stroke-opacity": opacityFade,
            "circle-radius": ringRadius,
          },
        });
      }
    })();

    return () => {
      cancelled = true;
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
              _fade_max: [
                ["max", ["accumulated"], ["get", "_fade_max"]],
                ["coalesce", ["get", "_fade"], 0],
              ],
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
          // jump so bubbles visibly breathe rather than snap.
          "circle-radius-transition": { duration: 350, delay: 0 },
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
      paintCumulativeWithFades(map, theme, cumulativeFeatures, life);
    }

    ensureRecentTicker(
      map,
      cumulativeRef,
      recentLifeRef,
      recentTickerRef,
      reduceMotion,
    );
  }, [currentDate]);

  // Cinematic deportation-mode transition
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let raf: number | null = null;
    let cancelled = false;

    function animate(
      from: number,
      to: number,
      ms: number,
      onTick: (v: number) => void,
      onDone?: () => void,
    ) {
      const start = performance.now();
      function step(now: number) {
        if (cancelled) return;
        const t = Math.min(1, (now - start) / ms);
        // ease-in-out cubic
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        onTick(from + (to - from) * e);
        if (t < 1) raf = requestAnimationFrame(step);
        else onDone?.();
      }
      raf = requestAnimationFrame(step);
    }

    if (deportationMode) {
      // Close any open sidebar first
      setSelection(null);
      // Pan to a wide bounds covering MG + all destinations.
      // Padded so the lines have breathing room.
      map.fitBounds(
        [
          [3.5, 47.8],
          [27.5, 57.8],
        ],
        {
          padding: { top: 80, bottom: 80, left: 320, right: 80 },
          duration: 1500,
          essential: true,
        },
      );

      // Fade out theme markers, fade in arcs after the camera settles.
      animate(1, 0.18, 700, (v) => setPoiOpacity(map, v));
      const settle = setTimeout(() => {
        if (cancelled) return;
        animate(0, 0.85, 1100, (v) => {
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
        cancelled = true;
        clearTimeout(settle);
        if (raf) cancelAnimationFrame(raf);
      };
    } else {
      // Exit: fade arcs out, restore POI opacity, fly home.
      if (map.getLayer("deportation-arcs")) {
        animate(
          map.getPaintProperty("deportation-arcs", "line-opacity") as number ??
            0,
          0,
          500,
          (v) => {
            map.setPaintProperty("deportation-arcs", "line-opacity", v);
            map.setPaintProperty(
              "deportation-arcs-glow",
              "line-opacity",
              v * 0.35,
            );
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
      }
      animate(0.18, 1, 600, (v) => setPoiOpacity(map, v));
      map.flyTo({
        center: MG_CENTER,
        zoom: MG_DEFAULT_ZOOM,
        duration: 1500,
        essential: true,
      });

      return () => {
        cancelled = true;
        if (raf) cancelAnimationFrame(raf);
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
