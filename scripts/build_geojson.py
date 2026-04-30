#!/usr/bin/env python3
"""Build per-theme GeoJSON files and per-POI content JSON.

Layers:
- stolpersteine — grouped by address, each feature is one address
- ns-orte       — combined from:
                    1. OSM historic NS-related (osm_ns.py)
                    2. Baudenkmäler filtered by NS keyword
                    3. Curated overrides in overrides/ns_orte/curated.json

Outputs:
  app/public/data/stolpersteine.geojson
  app/public/data/ns-orte.geojson
  app/public/data/content/<theme>/<id>.json
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OVERRIDES = ROOT / "overrides"
OUT_DATA = ROOT / "app" / "public" / "data"
OUT_CONTENT = OUT_DATA / "content"

NS_KEYWORDS = re.compile(
    r"(bunker|luftschutz|hochbunk|synagog|mahnm|gedenk|kriegerdenkm|"
    r"opfer|1933|1945|reichspogrom|stolperschw|zwangsarbeit|"
    r"jüdisch|judisch|deportier|nationalsoz|widerstand|gefallen|"
    r"krieg)",
    re.I,
)


def slugify(s: str) -> str:
    s = (s or "").lower()
    table = {"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"}
    s = "".join(table.get(c, c) for c in s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-") or "x"


# ---------------------------------------------------------------- Stolpersteine

def build_stolpersteine() -> tuple[int, int]:
    src_path = RAW / "stolpersteine_wp.json"
    if not src_path.exists():
        return 0, 0
    src = json.loads(src_path.read_text())
    out_dir = OUT_CONTENT / "stolpersteine"
    out_dir.mkdir(parents=True, exist_ok=True)

    groups: dict[tuple[float, float], list[dict]] = defaultdict(list)
    for e in src:
        if e.get("lat") is None or e.get("lng") is None:
            continue
        key = (round(e["lat"], 6), round(e["lng"], 6))
        groups[key].append(e)

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
                "names": names[:6],
            },
        })
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


# ---------------------------------------------------------------- NS-Orte

def collect_ns_baudenkmaeler() -> list[dict]:
    """Filter Baudenkmäler to NS-related entries by keyword."""
    src_path = RAW / "baudenkmaeler_wp.json"
    if not src_path.exists():
        return []
    out: list[dict] = []
    for e in json.loads(src_path.read_text()):
        if e.get("lat") is None or e.get("lng") is None:
            continue
        text = " ".join([
            e.get("name", ""),
            e.get("bezeichnung", ""),
            e.get("description", ""),
            e.get("address", ""),
        ])
        if not NS_KEYWORDS.search(text):
            continue
        bez = e.get("bezeichnung", "").lower()
        if "luftschutz" in bez or "bunker" in bez:
            cat = "bunker"
        elif "jüdisch" in bez or "synagog" in bez:
            cat = "jewish_cemetery" if "friedhof" in bez else "jewish_site"
        elif "krieg" in bez or "gefallen" in bez:
            cat = "war_memorial"
        else:
            cat = "memorial_other"
        out.append({
            "id": f"bd-{e['id']}",
            "name": e.get("bezeichnung") or e.get("name") or e.get("address", ""),
            "category": cat,
            "lat": e["lat"],
            "lng": e["lng"],
            "address": e.get("address", ""),
            "ortsteil": e.get("ortsteil", ""),
            "description": e.get("description", ""),
            "build_date": e.get("build_date", ""),
            "image": e.get("image") or "",
            "source": "baudenkmal",
            "source_url": e.get("source_url", ""),
            "denkmal_nummer": e.get("nummer", ""),
        })
    return out


def collect_ns_osm() -> list[dict]:
    src_path = RAW / "ns_orte_osm.json"
    if not src_path.exists():
        return []
    return json.loads(src_path.read_text())


def collect_ns_curated() -> list[dict]:
    src_path = OVERRIDES / "ns_orte" / "curated.json"
    if not src_path.exists():
        return []
    data = json.loads(src_path.read_text())
    return data.get("entries", [])


def build_ns_orte() -> int:
    out_dir = OUT_CONTENT / "ns-orte"
    out_dir.mkdir(parents=True, exist_ok=True)

    all_entries: list[dict] = []
    all_entries.extend(collect_ns_curated())
    all_entries.extend(collect_ns_baudenkmaeler())
    all_entries.extend(collect_ns_osm())

    # de-dupe by spatial proximity within 25 m AND same category, keeping
    # curated > baudenkmal > osm priority. (Curated comes first in the list.)
    keep: list[dict] = []
    for e in all_entries:
        e_lat, e_lng = e.get("lat"), e.get("lng")
        if e_lat is None or e_lng is None:
            continue
        if any(
            abs(e_lat - k["lat"]) < 0.0003
            and abs(e_lng - k["lng"]) < 0.0005
            and e.get("category") == k.get("category")
            for k in keep
        ):
            continue
        keep.append(e)

    seen_ids: set[str] = set()
    features: list[dict] = []
    for e in keep:
        eid = e.get("id") or ""
        while eid in seen_ids or not eid:
            eid = f"{eid}-x" if eid else f"ns-{len(seen_ids)}"
        seen_ids.add(eid)
        e["id"] = eid

        features.append({
            "type": "Feature",
            "id": eid,
            "geometry": {"type": "Point", "coordinates": [e["lng"], e["lat"]]},
            "properties": {
                "id": eid,
                "name": e.get("name", ""),
                "category": e.get("category", "other"),
                "address": e.get("address", ""),
            },
        })
        (out_dir / f"{eid}.json").write_text(
            json.dumps({"kind": "ns-orte", **e}, ensure_ascii=False, indent=2)
        )

    fc = {"type": "FeatureCollection", "features": features}
    OUT_DATA.mkdir(parents=True, exist_ok=True)
    (OUT_DATA / "ns-orte.geojson").write_text(json.dumps(fc, ensure_ascii=False))
    return len(features)


def main() -> None:
    n_loc, n_stones = build_stolpersteine()
    n_ns = build_ns_orte()
    print(f"stolpersteine: {n_loc} locations covering {n_stones} stones")
    print(f"ns-orte:       {n_ns} features")


if __name__ == "__main__":
    main()
