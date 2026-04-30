#!/usr/bin/env python3
"""Build per-theme GeoJSON files and per-POI content JSON from data/raw/.

Stolpersteine are grouped by address — many stones share an address
(a family memorial). Each group becomes one map feature; the sidebar
content lists all stones at that location.

Outputs:
  app/public/data/stolpersteine.geojson    — Point per address
  app/public/data/baudenkmaeler.geojson    — Point per Denkmal
  app/public/data/content/stolpersteine/<location_id>.json
  app/public/data/content/baudenkmaeler/<id>.json
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT_DATA = ROOT / "app" / "public" / "data"
OUT_CONTENT = OUT_DATA / "content"


def slugify(s: str) -> str:
    s = (s or "").lower()
    table = {"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"}
    s = "".join(table.get(c, c) for c in s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-") or "x"


def build_stolpersteine() -> tuple[int, int]:
    src_path = RAW / "stolpersteine_wp.json"
    if not src_path.exists():
        return 0, 0
    src = json.loads(src_path.read_text())
    out_dir = OUT_CONTENT / "stolpersteine"
    out_dir.mkdir(parents=True, exist_ok=True)

    # group by (lat6, lng6) — locations with same coordinates collapse
    groups: dict[tuple[float, float], list[dict]] = defaultdict(list)
    for e in src:
        if e.get("lat") is None or e.get("lng") is None:
            continue
        key = (round(e["lat"], 6), round(e["lng"], 6))
        groups[key].append(e)

    # generate stable location ids: <district>-<address-slug>
    location_ids: dict[tuple[float, float], str] = {}
    used: set[str] = set()
    for key, stones in groups.items():
        first = stones[0]
        addr = first.get("address") or ""
        district = first.get("district", "")
        base = f"{district}-{slugify(addr)}"[:80] or f"loc-{len(location_ids)}"
        loc_id = base
        i = 2
        while loc_id in used:
            loc_id = f"{base}-{i}"
            i += 1
        used.add(loc_id)
        location_ids[key] = loc_id

    features: list[dict] = []
    total_stones = 0
    for key, stones in groups.items():
        loc_id = location_ids[key]
        first = stones[0]
        lat, lng = key
        names = [s["name"] for s in stones]
        features.append({
            "type": "Feature",
            "id": loc_id,
            "geometry": {"type": "Point", "coordinates": [lng, lat]},
            "properties": {
                "id": loc_id,
                "address": first.get("address"),
                "district": first.get("district"),
                "count": len(stones),
                "names": names[:6],  # for tooltip; truncate
            },
        })
        # content file: address + list of stones
        (out_dir / f"{loc_id}.json").write_text(
            json.dumps(
                {
                    "kind": "stolperstein-group",
                    "id": loc_id,
                    "address": first.get("address"),
                    "district": first.get("district"),
                    "lat": lat,
                    "lng": lng,
                    "source_url": first.get("source_url"),
                    "stones": [
                        {
                            "id": s["id"],
                            "name": s["name"],
                            "install_date": s.get("install_date"),
                            "inscription": s.get("inscription"),
                            "image": s.get("image"),
                            "bio": s.get("bio"),
                        }
                        for s in stones
                    ],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        total_stones += len(stones)

    fc = {"type": "FeatureCollection", "features": features}
    OUT_DATA.mkdir(parents=True, exist_ok=True)
    (OUT_DATA / "stolpersteine.geojson").write_text(
        json.dumps(fc, ensure_ascii=False)
    )
    return len(features), total_stones


def build_baudenkmaeler() -> int:
    src_path = RAW / "baudenkmaeler_wp.json"
    if not src_path.exists():
        return 0
    src = json.loads(src_path.read_text())
    out_dir = OUT_CONTENT / "baudenkmaeler"
    out_dir.mkdir(parents=True, exist_ok=True)

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
                "bezeichnung": e.get("bezeichnung", ""),
                "address": e.get("address", ""),
                "ortsteil": e.get("ortsteil", ""),
                "image": e.get("image"),
            },
        })
        (out_dir / f"{e['id']}.json").write_text(
            json.dumps(
                {"kind": "baudenkmal", **e},
                ensure_ascii=False,
                indent=2,
            )
        )

    fc = {"type": "FeatureCollection", "features": features}
    OUT_DATA.mkdir(parents=True, exist_ok=True)
    (OUT_DATA / "baudenkmaeler.geojson").write_text(
        json.dumps(fc, ensure_ascii=False)
    )
    return len(features)


def main() -> None:
    n_loc, n_stones = build_stolpersteine()
    n_bd = build_baudenkmaeler()
    print(f"stolpersteine: {n_loc} locations covering {n_stones} stones")
    print(f"baudenkmaeler: {n_bd} features")


if __name__ == "__main__":
    main()
