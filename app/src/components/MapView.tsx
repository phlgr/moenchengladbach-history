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

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const {
    active,
    setCount,
    deportationMode,
    setDeportationCount,
  } = useLayerState();
  const [selection, setSelection] = useState<SidebarSelection>(null);
  const selectionRef = useRef<SidebarSelection>(null);
  const deportationModeRef = useRef(false);

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
            const fc = await res.json();
            if (cancelled) return;
            setCount(theme, fc.features.length);
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
        const colors = THEMES[theme];
        if (fc.features.length === 0) return;
        map.addSource(theme, {
          type: "geojson",
          data: fc,
          cluster: true,
          clusterRadius: 40,
          clusterMaxZoom: 14,
        });

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

        map.addLayer({
          id: `${theme}-points`,
          type: "circle",
          source: theme,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": colors.pointColor,
            "circle-stroke-color": "#faf8f5",
            "circle-stroke-width": 1.5,
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              12,
              4,
              16,
              7,
            ],
          },
        });

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

        for (const lid of [`${theme}-clusters`, `${theme}-points`]) {
          map.on("mouseenter", lid, () => {
            if (deportationModeRef.current) return;
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", lid, () => {
            map.getCanvas().style.cursor = "";
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      mapInstance?.remove();
      mapRef.current = null;
    };
  }, []);

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
