import { useEffect, useRef, useState } from "react";
import type { Map as MlMap, GeoJSONSource } from "maplibre-gl";
import { Sidebar } from "./Sidebar";
import { createMapStyle } from "../lib/mapStyle";

const MG_CENTER: [number, number] = [6.444, 51.196];

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let mapInstance: MlMap | null = null;

    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current) return;

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
        const res = await fetch("/data/stolpersteine.geojson");
        const fc = await res.json();
        if (cancelled) return;
        setCount(fc.features.length);

        map.addSource("stolpersteine", {
          type: "geojson",
          data: fc,
          cluster: true,
          clusterRadius: 40,
          clusterMaxZoom: 14,
        });

        map.addLayer({
          id: "stolpersteine-clusters",
          type: "circle",
          source: "stolpersteine",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#8b7355",
            "circle-stroke-color": "#faf8f5",
            "circle-stroke-width": 2,
            "circle-radius": [
              "step",
              ["get", "point_count"],
              14,
              10,
              18,
              50,
              22,
            ],
            "circle-opacity": 0.92,
          },
        });

        map.addLayer({
          id: "stolpersteine-cluster-count",
          type: "symbol",
          source: "stolpersteine",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 12,
          },
          paint: { "text-color": "#faf8f5" },
        });

        map.addLayer({
          id: "stolpersteine-points",
          type: "circle",
          source: "stolpersteine",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": [
              "case",
              ["==", ["get", "id"], ["literal", ""]],
              "#3a3530",
              "#a0522d",
            ],
            "circle-stroke-color": "#faf8f5",
            "circle-stroke-width": 1.5,
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              12,
              5,
              16,
              8,
            ],
          },
        });

        // Highlight ring for selected point
        map.addLayer({
          id: "stolpersteine-points-selected",
          type: "circle",
          source: "stolpersteine",
          filter: ["==", ["get", "id"], ""],
          paint: {
            "circle-color": "#a0522d",
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

        map.on("click", "stolpersteine-clusters", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const clusterId = f.properties?.cluster_id;
          const src = map.getSource("stolpersteine") as GeoJSONSource;
          src.getClusterExpansionZoom(clusterId).then((zoom) => {
            const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
            map.easeTo({ center: [lng, lat], zoom });
          });
        });

        map.on("click", "stolpersteine-points", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const id = f.properties?.id as string;
          const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
          setSelectedId(id);
          map.setFilter("stolpersteine-points-selected", ["==", ["get", "id"], id]);
          map.easeTo({
            center: [lng, lat],
            offset: [
              -Math.min(window.innerWidth * 0.25, 210),
              0,
            ],
            duration: 600,
          });
        });

        // Empty-area click closes the sidebar (only if no feature was hit)
        map.on("click", (e) => {
          const hits = map.queryRenderedFeatures(e.point, {
            layers: ["stolpersteine-points", "stolpersteine-clusters"],
          });
          if (hits.length === 0 && selectedIdRef.current !== null) {
            setSelectedId(null);
            map.setFilter(
              "stolpersteine-points-selected",
              ["==", ["get", "id"], ""],
            );
          }
        });

        for (const lid of ["stolpersteine-clusters", "stolpersteine-points"]) {
          map.on("mouseenter", lid, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", lid, () => {
            map.getCanvas().style.cursor = "";
          });
        }
      });
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
        {count !== null && (
          <div className="pointer-events-none absolute left-4 top-20 z-10 rounded border border-sepia-light bg-paper/95 px-3 py-1 text-xs text-faded-ink shadow">
            {count} Stolpersteine
          </div>
        )}
      </div>
      <Sidebar
        selectedId={selectedId}
        onClose={() => {
          setSelectedId(null);
          if (mapRef.current) {
            mapRef.current.setFilter(
              "stolpersteine-points-selected",
              ["==", ["get", "id"], ""],
            );
          }
        }}
      />
    </>
  );
}
