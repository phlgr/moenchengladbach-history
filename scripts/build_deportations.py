#!/usr/bin/env python3
"""Build the deportation-network GeoJSON.

Parses each Stolperstein inscription + biography for the deportation
destination ("Deportiert 1942 Riga", "ermordet in Auschwitz", etc.),
matches it against a curated set of well-known ghetto/camp coordinates,
and emits two artefacts:

  public/data/deportations.geojson       — LineString per (origin, dest)
  public/data/deportation-destinations.geojson — Point per destination
                                                     with victim count

The line LayerString uses a quadratic-bezier approximation (10 points)
bowed slightly to the north so multiple lines from the same origin fan
out on the map rather than overlapping. MapLibre renders the resulting
poly-line smoothly.

Sources of destination names: canonical inscriptions in
data/raw/stolpersteine_wp.json. Unknown destinations are skipped rather
than guessed.
"""
from __future__ import annotations

import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "raw" / "stolpersteine_wp.json"
OUT_DATA = ROOT / "public" / "data"

# Canonical destinations: (display_name, lat, lng, kind)
# Coordinates of the actual ghetto / camp / killing site. Where multiple
# locations share a name (Lodz the city, Łódź the ghetto inside it) we
# pick the historically meaningful one.
DESTINATIONS: dict[str, tuple[str, float, float, str]] = {
    "riga":          ("Ghetto Riga",            56.9450, 24.1050, "ghetto"),
    "izbica":        ("Ghetto Izbica",          50.8730, 23.1650, "ghetto"),
    "theresienstadt":("Ghetto Theresienstadt",  50.5140, 14.1510, "ghetto"),
    "auschwitz":     ("KZ Auschwitz",           50.0270, 19.2100, "kz"),
    "sobibor":       ("Vernichtungslager Sobibor", 51.4350, 23.5940, "vernichtung"),
    "lodz":          ("Ghetto Łódź",            51.7600, 19.4560, "ghetto"),
    "łodz":          ("Ghetto Łódź",            51.7600, 19.4560, "ghetto"),
    "łódz":          ("Ghetto Łódź",            51.7600, 19.4560, "ghetto"),
    "litzmannstadt": ("Ghetto Łódź",            51.7600, 19.4560, "ghetto"),
    "minsk":         ("Ghetto Minsk",           53.9020, 27.5630, "ghetto"),
    "treblinka":     ("Vernichtungslager Treblinka", 52.6300, 22.0450, "vernichtung"),
    "majdanek":      ("KZ Majdanek (Lublin)",   51.2240, 22.6020, "kz"),
    "belzec":        ("Vernichtungslager Bełżec", 50.3720, 23.4570, "vernichtung"),
    "hadamar":       ("Tötungsanstalt Hadamar", 50.4430, 8.0380,  "t4"),
    "mauthausen":    ("KZ Mauthausen",          48.2580, 14.4990, "kz"),
    "bergen-belsen": ("KZ Bergen-Belsen",       52.7580, 9.9080,  "kz"),
    "dachau":        ("KZ Dachau",              48.2700, 11.4660, "kz"),
    "buchenwald":    ("KZ Buchenwald",          51.0220, 11.2490, "kz"),
    "ravensbrück":   ("KZ Ravensbrück",         53.1880, 13.1730, "kz"),
    "stutthof":      ("KZ Stutthof",            54.3290, 19.1530, "kz"),
    "mechelen":      ("Sammellager Mechelen",   51.0250, 4.4810,  "transit"),
    "drancy":        ("Sammellager Drancy",     48.9270, 2.4570,  "transit"),
    "blechhammer":   ("Zwangsarbeitslager Blechhammer", 50.3010, 18.3340, "zwangsarbeit"),
    # Common in MG bios
    "kaiserwald":    ("KZ Kaiserwald (Riga)",   56.9710, 24.1740, "kz"),
}

# Words that look like destinations but are actually transit / collection
# points within Germany. We don't draw lines to these.
TRANSIT_INTERMEDIATE = {
    "düsseldorf", "duesseldorf", "aachen", "berlin", "köln", "koeln",
}

DEPORT_PATTERNS = [
    re.compile(r"deportiert\s+(?:nach\s+|am\s+\d+[\.\d]*\s+)?(?:in\s+das\s+|in\s+den\s+|in\s+die\s+)?(?:Ghetto\s+|KZ\s+|Lager\s+|Transit-?Ghetto\s+)?([A-ZŁÄÖÜ][a-zäöüłéè\-]+)", re.I),
    re.compile(r"verbracht\s+(?:nach\s+|in\s+das\s+)?(?:Ghetto\s+|KZ\s+)?([A-ZŁÄÖÜ][a-zäöüłéè\-]+)", re.I),
    re.compile(r"(?:ermordet|tot|umgekommen|verstarb)\s+(?:in\s+|im\s+|am\s+)?(?:Ghetto\s+|KZ\s+|Lager\s+|Transit-?Ghetto\s+)?([A-ZŁÄÖÜ][a-zäöüłéè\-]+)", re.I),
    re.compile(r"transport[a-z]*\s+(?:in\s+das\s+|in\s+den\s+|nach\s+)(?:Ghetto\s+|KZ\s+|Lager\s+)?([A-ZŁÄÖÜ][a-zäöüłéè\-]+)", re.I),
]


def normalise(name: str) -> str:
    n = name.lower().strip().rstrip(",.;:")
    n = n.replace("ł", "ł")  # canonical
    return n


def find_destination(text: str) -> tuple[str, str, float, float] | None:
    """Return (key, display_name, lat, lng) for the first recognised
    destination in `text`, or None."""
    if not text:
        return None
    # Try each pattern; collect candidate words; resolve against known map.
    for pat in DEPORT_PATTERNS:
        for m in pat.finditer(text):
            cand = normalise(m.group(1))
            if cand in TRANSIT_INTERMEDIATE:
                continue
            if cand in DESTINATIONS:
                disp, lat, lng, _ = DESTINATIONS[cand]
                return cand, disp, lat, lng
    # Fallback: scan plain text for any canonical destination keyword.
    low = text.lower()
    for key, (disp, lat, lng, _) in DESTINATIONS.items():
        # Avoid matching short keys inside longer words
        if re.search(rf"\b{re.escape(key)}\b", low):
            return key, disp, lat, lng
    return None


def bezier_arc(
    a: tuple[float, float],
    b: tuple[float, float],
    bow_ratio: float = 0.18,
    n: int = 20,
) -> list[list[float]]:
    """Quadratic-bezier curve from `a` to `b`, control point offset
    perpendicular to the segment by `bow_ratio` * segment length, biased
    toward the upper hemisphere so all arcs from MG fan north.

    Returns a list of [lng, lat] points (n+1 of them)."""
    ax, ay = a
    bx, by = b
    mx, my = (ax + bx) / 2.0, (ay + by) / 2.0
    dx, dy = bx - ax, by - ay
    length = math.hypot(dx, dy) or 1.0
    # perpendicular vector (rotated 90° counter-clockwise)
    px, py = -dy / length, dx / length
    # Bias: always bow toward higher latitude
    if py < 0:
        px, py = -px, -py
    cx = mx + px * length * bow_ratio
    cy = my + py * length * bow_ratio
    pts: list[list[float]] = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        x = u * u * ax + 2 * u * t * cx + t * t * bx
        y = u * u * ay + 2 * u * t * cy + t * t * by
        pts.append([x, y])
    return pts


def main() -> None:
    OUT_DATA.mkdir(parents=True, exist_ok=True)
    src = json.loads(SRC.read_text())

    # Parse destinations per Stolperstein
    routes: list[dict] = []
    unmatched: list[str] = []
    for stone in src:
        if stone.get("lat") is None or stone.get("lng") is None:
            continue
        text = " ".join(filter(None, [
            stone.get("inscription", ""),
            stone.get("bio", ""),
        ]))
        match = find_destination(text)
        if not match:
            unmatched.append(stone.get("name", "?"))
            continue
        key, dest_name, dest_lat, dest_lng = match
        routes.append({
            "stone_id": stone["id"],
            "name": stone["name"],
            "address": stone.get("address", ""),
            "origin_lat": stone["lat"],
            "origin_lng": stone["lng"],
            "dest_key": key,
            "dest_name": dest_name,
            "dest_lat": dest_lat,
            "dest_lng": dest_lng,
        })

    print(f"  parsed:    {len(routes)} routes")
    print(f"  unmatched: {len(unmatched)} stones")
    by_dest: Counter[str] = Counter(r["dest_key"] for r in routes)
    print("  by destination:")
    for k, n in by_dest.most_common():
        print(f"    {n:3d}  {DESTINATIONS[k][0]}")

    # Aggregate (origin_address, destination) pairs to keep the visual
    # readable — multiple family members at the same address & same
    # destination collapse to one line, with a count.
    pair_routes: dict[tuple[float, float, str], dict] = {}
    for r in routes:
        key = (
            round(r["origin_lat"], 6),
            round(r["origin_lng"], 6),
            r["dest_key"],
        )
        if key not in pair_routes:
            pair_routes[key] = {
                "origin_lat": r["origin_lat"],
                "origin_lng": r["origin_lng"],
                "dest_key": r["dest_key"],
                "dest_name": r["dest_name"],
                "dest_lat": r["dest_lat"],
                "dest_lng": r["dest_lng"],
                "count": 0,
                "names": [],
                "address": r["address"],
            }
        pair_routes[key]["count"] += 1
        pair_routes[key]["names"].append(r["name"])

    # Build line features
    line_features: list[dict] = []
    for r in pair_routes.values():
        coords = bezier_arc(
            (r["origin_lng"], r["origin_lat"]),
            (r["dest_lng"], r["dest_lat"]),
            bow_ratio=0.14,
            n=24,
        )
        line_features.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {
                "dest_key": r["dest_key"],
                "dest_name": r["dest_name"],
                "count": r["count"],
                "address": r["address"],
                "names": r["names"][:12],
            },
        })

    (OUT_DATA / "deportations.geojson").write_text(
        json.dumps(
            {"type": "FeatureCollection", "features": line_features},
            ensure_ascii=False,
        )
    )

    # Build destination point features — collapse aliases (e.g. lodz /
    # łodz / łódz / litzmannstadt all map to "Ghetto Łódź") into one
    # marker per display name.
    by_disp: dict[str, dict] = {}
    for r in routes:
        disp = r["dest_name"]
        if disp not in by_disp:
            _, lat, lng, kind = DESTINATIONS[r["dest_key"]]
            by_disp[disp] = {
                "name": disp,
                "lat": lat,
                "lng": lng,
                "kind": kind,
                "count": 0,
                "names": [],
                "key": disp.lower().replace(" ", "-").replace("ł", "l"),
            }
        by_disp[disp]["count"] += 1
        by_disp[disp]["names"].append(r["name"])

    dest_features: list[dict] = []
    for d in sorted(by_disp.values(), key=lambda x: -x["count"]):
        eid = f"dest-{d['key']}"
        dest_features.append({
            "type": "Feature",
            "id": eid,
            "geometry": {"type": "Point", "coordinates": [d["lng"], d["lat"]]},
            "properties": {
                "id": eid,
                "key": d["key"],
                "name": d["name"],
                "kind": d["kind"],
                "count": d["count"],
            },
        })
    (OUT_DATA / "deportation-destinations.geojson").write_text(
        json.dumps(
            {"type": "FeatureCollection", "features": dest_features},
            ensure_ascii=False,
        )
    )

    print(f"  wrote {len(line_features)} arcs and {len(dest_features)} destinations")


if __name__ == "__main__":
    main()
