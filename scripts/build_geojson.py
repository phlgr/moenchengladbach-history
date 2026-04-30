#!/usr/bin/env python3
"""Build per-theme GeoJSON files from data/raw/*.json.

Currently emits:
  app/public/data/stolpersteine.geojson — Point features, one per stone

Properties on each feature are kept lean so the layer is fast to load:
  id, name, address, install_date, district, image
The full bio + inscription are written separately to
  app/public/data/content/stolpersteine/<id>.json
so they can be lazy-loaded only when an article is opened.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT_DATA = ROOT / "app" / "public" / "data"
OUT_CONTENT = OUT_DATA / "content" / "stolpersteine"


def build_stolpersteine() -> None:
    src = json.loads((RAW / "stolpersteine_wp.json").read_text())
    OUT_DATA.mkdir(parents=True, exist_ok=True)
    OUT_CONTENT.mkdir(parents=True, exist_ok=True)

    features = []
    for e in src:
        if e.get("lat") is None or e.get("lng") is None:
            continue
        features.append({
            "type": "Feature",
            "id": e["id"],
            "geometry": {"type": "Point", "coordinates": [e["lng"], e["lat"]]},
            "properties": {
                "id": e["id"],
                "name": e["name"],
                "address": e["address"],
                "install_date": e["install_date"],
                "district": e["district"],
                "image": e.get("image"),
            },
        })
        # full content (lazy-loaded per article)
        (OUT_CONTENT / f"{e['id']}.json").write_text(
            json.dumps(
                {
                    "id": e["id"],
                    "name": e["name"],
                    "address": e["address"],
                    "lat": e["lat"],
                    "lng": e["lng"],
                    "install_date": e["install_date"],
                    "inscription": e["inscription"],
                    "image": e.get("image"),
                    "bio": e["bio"],
                    "district": e["district"],
                    "source_url": e["source_url"],
                },
                ensure_ascii=False,
                indent=2,
            )
        )

    fc = {"type": "FeatureCollection", "features": features}
    (OUT_DATA / "stolpersteine.geojson").write_text(
        json.dumps(fc, ensure_ascii=False)
    )
    print(f"wrote {len(features)} stolperstein features → app/public/data/stolpersteine.geojson")


if __name__ == "__main__":
    build_stolpersteine()
