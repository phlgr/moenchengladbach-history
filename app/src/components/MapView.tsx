import { useEffect, useRef, useState } from "react";
import type { Map as MlMap, GeoJSONSource } from "maplibre-gl";
import { Sidebar, type SidebarSelection } from "./Sidebar";
import { LayerToggle } from "./LayerToggle";
import { createMapStyle } from "../lib/mapStyle";
import { THEMES, type ThemeId } from "../lib/themes";

const MG_CENTER: [number, number] = [6.444, 51.196];

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

/** All NS sub-themes share one content directory. */
function contentDirFor(theme: ThemeId): string {
  return theme === "stolpersteine" ? "stolpersteine" : "ns-orte";
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [counts, setCounts] = useState<Partial<Record<ThemeId, number>>>({});
  const [active, setActive] = useState<Record<ThemeId, boolean>>(() => {
    const a = {} as Record<ThemeId, boolean>;
    for (const t of ORDERED_THEMES) a[t] = true;
    return a;
  });
  const [selection, setSelection] = useState<SidebarSelection>(null);
  const selectionRef = useRef<SidebarSelection>(null);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

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
        zoom: 12,
        maxBounds: [
          [6.2, 51.05],
          [6.7, 51.35],
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
            setCounts((prev) => ({ ...prev, [theme]: fc.features.length }));
            addThemeLayers(map, theme, fc);
          }),
        );

        map.on("click", (e) => {
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

  return (
    <>
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" />
        <div className="pointer-events-none absolute left-4 top-20 z-10 flex w-52 flex-col gap-2">
          <LayerToggle
            active={active}
            counts={counts}
            onToggle={(id) => setActive((a) => ({ ...a, [id]: !a[id] }))}
            onToggleGroup={(group, allOn) =>
              setActive((a) => {
                const next = { ...a };
                for (const t of ORDERED_THEMES) {
                  if (THEMES[t].group === group) next[t] = allOn;
                }
                return next;
              })
            }
          />
        </div>
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
