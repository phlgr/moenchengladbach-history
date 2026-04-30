import { useEffect, useRef, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";

const MG_CENTER: [number, number] = [6.444, 51.196];
const STYLE = {
  version: 8 as const,
  sources: {
    "osm-raster": {
      type: "raster" as const,
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap-Mitwirkende",
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "osm-raster",
      type: "raster" as const,
      source: "osm-raster",
    },
  ],
};

type StolpersteinContent = {
  id: string;
  name: string;
  address: string;
  install_date: string | null;
  inscription: string;
  image: string | null;
  bio: string;
  district: string;
  source_url: string;
};

function commonsThumb(filename: string, width = 320): string {
  const safe = filename.replace(/ /g, "_");
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
    safe,
  )}?width=${width}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function popupHtml(c: StolpersteinContent): string {
  const safeName = escapeHtml(c.name);
  const img = c.image
    ? `<img src="${commonsThumb(c.image, 320)}" alt="Stolperstein für ${safeName}" style="display:block;width:100%;max-height:240px;object-fit:cover;border-bottom:1px solid var(--color-sepia-light)" loading="lazy" />`
    : "";
  const insc = c.inscription
    ? `<pre style="white-space:pre-wrap;font-family:var(--font-serif);font-size:0.85rem;margin:0 0 0.5rem 0;color:#3a3530;background:#f4efe7;padding:0.5rem;border-left:2px solid var(--color-sepia)">${escapeHtml(
        c.inscription,
      )}</pre>`
    : "";
  const bio = c.bio
    ? `<div style="font-size:0.85rem;line-height:1.4;color:var(--color-ink)">${escapeHtml(
        c.bio.length > 600 ? `${c.bio.slice(0, 600)}…` : c.bio,
      )}</div>`
    : "";
  const meta = [
    c.address ? `<span>${escapeHtml(c.address)}</span>` : null,
    c.install_date ? `<span>Verlegt&nbsp;${c.install_date}</span>` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return `
    <div style="font-family:var(--font-sans)">
      ${img}
      <div style="padding:0.75rem 1rem">
        <h2 style="font-family:var(--font-serif);font-size:1.05rem;font-weight:700;margin:0 0 0.25rem 0">${safeName}</h2>
        <div style="font-size:0.72rem;color:var(--color-faded-ink);margin-bottom:0.5rem">${meta}</div>
        ${insc}
        ${bio}
        <div style="margin-top:0.75rem;font-size:0.7rem">
          <a href="${c.source_url}" target="_blank" rel="noreferrer" style="color:var(--color-sepia);text-decoration:underline">Quelle: Wikipedia</a>
        </div>
      </div>
    </div>`;
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let mapInstance: MlMap | null = null;

    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: STYLE,
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
            "circle-opacity": 0.9,
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
            "circle-color": "#a0522d",
            "circle-stroke-color": "#faf8f5",
            "circle-stroke-width": 1.5,
            "circle-radius": 6,
          },
        });

        map.on("click", "stolpersteine-clusters", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const clusterId = f.properties?.cluster_id;
          const src = map.getSource(
            "stolpersteine",
          ) as maplibregl.GeoJSONSource;
          src.getClusterExpansionZoom(clusterId).then((zoom) => {
            const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
            map.easeTo({ center: [lng, lat], zoom });
          });
        });

        map.on("click", "stolpersteine-points", async (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const id = f.properties?.id as string;
          const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
          const popup = new maplibregl.Popup({
            closeOnClick: true,
            maxWidth: "360px",
          })
            .setLngLat([lng, lat])
            .setHTML('<div style="padding:1rem">Lade…</div>')
            .addTo(map);

          try {
            const r = await fetch(`/data/content/stolpersteine/${id}.json`);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const c = (await r.json()) as StolpersteinContent;
            popup.setHTML(popupHtml(c));
          } catch (err) {
            popup.setHTML(
              `<div style="padding:1rem;color:#a0522d">Fehler beim Laden: ${escapeHtml(
                String(err),
              )}</div>`,
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
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" />
      {count !== null && (
        <div className="pointer-events-none absolute left-4 top-20 z-10 rounded border border-sepia-light bg-paper/95 px-3 py-1 text-xs text-faded-ink shadow">
          {count} Stolpersteine
        </div>
      )}
    </div>
  );
}
