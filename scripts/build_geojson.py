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

# Strict keywords — only listed monuments matching one of these are
# treated as NS-era related. Generic "Kriegerdenkmal" (mostly WW1) and
# "Gedenkbüste" (often imperial-era) are deliberately excluded.
NS_KEYWORDS_STRICT = re.compile(
    r"(bunker|luftschutz|hochbunk|synagog|reichspogrom|stolperschw|"
    r"zwangsarbeit|jüdisch|judisch|deportier|nationalsoz|widerstand|"
    r"konzentrationsl|opfer\s+des|kriegsgefangen)",
    re.I,
)


def slugify(s: str) -> str:
    s = (s or "").lower()
    table = {"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"}
    s = "".join(table.get(c, c) for c in s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-") or "x"


# Year-of-persecution extraction. Each Stolperstein inscription almost
# always contains a year next to the verb of persecution (Deportiert
# 1942, Verhaftet 1938, Flucht 1938, Ermordet 1944, …). The earliest of
# those is the year the person's life was decisively touched by the NS
# state — used by the time-slider so victims appear on the map as their
# persecution begins.
PERSECUTION_YEAR_PATTERNS = [
    re.compile(r"(?:Verhaftet|verhaftet)\s+(19[34][0-9])"),
    re.compile(r"(?:Flucht|geflohen|emigriert)\s+(?:im\s+Jahr\s+)?(19[34][0-9])"),
    re.compile(r"(?:Deportiert|deportiert|verschleppt)\s+(?:am\s+\d+[\.\d]*\s+)?(19[34][0-9])"),
    re.compile(r"(?:Tot|tot|ermordet|verstarb|umgekommen)\s+(?:am\s+\d+[\.\d]*\s+)?(19[34][0-9])"),
    re.compile(r"(?:in\s+den\s+Tod\s+getrieben|gewaltsam\s+gestorben)\s+(?:am\s+\d+[\.\d]*\s+)?(19[34][0-9])"),
]


def persecution_year(stone: dict) -> int | None:
    text = " ".join(filter(None, [
        stone.get("inscription") or "",
        stone.get("bio") or "",
    ]))
    if not text:
        return None
    found: list[int] = []
    for pat in PERSECUTION_YEAR_PATTERNS:
        for m in pat.finditer(text):
            try:
                year = int(m.group(1))
                if 1933 <= year <= 1945:
                    found.append(year)
            except ValueError:
                continue
    return min(found) if found else None


# ---------------------------------------------------------------- Stolpersteine

def _prune_orphans(out_dir: Path, written: set[str]) -> None:
    """Remove stale .json files in `out_dir` that weren't written this run.

    Avoids `rm -rf` of the directory before build, which would break Vite's
    public-dir file watcher and cause 404s on all freshly-written files
    until they're touched a second time.
    """
    if not out_dir.exists():
        return
    for f in out_dir.glob("*.json"):
        if f.stem not in written:
            f.unlink()


def build_stolpersteine() -> tuple[int, int]:
    src_path = RAW / "stolpersteine_wp.json"
    if not src_path.exists():
        return 0, 0
    src = json.loads(src_path.read_text())
    out_dir = OUT_CONTENT / "stolpersteine"
    out_dir.mkdir(parents=True, exist_ok=True)
    written: set[str] = set()

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
        # Earliest persecution year across all stones at this address —
        # the timeline shows the address from this year onward.
        years = [persecution_year(s) for s in stones]
        valid_years = [y for y in years if y is not None]
        first_year = min(valid_years) if valid_years else None
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
                # year is null when no persecution date could be parsed —
                # frontend treats those as "always visible" so we don't
                # erase real Stolpersteine from the timeline.
                "year": first_year,
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
        written.add(loc_id)
        total_stones += len(stones)

    fc = {"type": "FeatureCollection", "features": features}
    OUT_DATA.mkdir(parents=True, exist_ok=True)
    (OUT_DATA / "stolpersteine.geojson").write_text(
        json.dumps(fc, ensure_ascii=False)
    )
    _prune_orphans(out_dir, written)
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
        if not NS_KEYWORDS_STRICT.search(text):
            continue
        bez = e.get("bezeichnung", "").lower()
        if "luftschutz" in bez or "bunker" in bez:
            cat = "bunker"
        elif "jüdisch" in bez or "synagog" in bez:
            cat = "jewish_cemetery" if "friedhof" in bez else "jewish_site"
        elif "zwangsarbeit" in bez:
            cat = "forced_labor"
        else:
            cat = "ns_memorial"
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


# Generic city/district WP articles that would just dump a marker on a
# centroid without a specific story. The smaller districts (Westend,
# Hehn, Venn, Rheindahlen, Wickrath, Wanlo, Odenkirchen) ARE allowed —
# their narrative often points to a single concrete NS event (Aktion T4,
# Pfarrer-vs-Gestapo, destroyed synagogue) so the centroid is the best
# anchor we have.
NARRATIVE_BLOCKLIST: set[str] = {
    "Mönchengladbach",
    "Rheydt",
    "Broich (Mönchengladbach)",
    "Lürrip",
}


def collect_ns_narrative() -> list[dict]:
    src_path = RAW / "ns_orte_narrative.json"
    if not src_path.exists():
        return []
    out: list[dict] = []
    for e in json.loads(src_path.read_text()):
        if e.get("name") in NARRATIVE_BLOCKLIST:
            continue
        out.append(e)
    return out


def collect_ns_curated() -> list[dict]:
    src_path = OVERRIDES / "ns_orte" / "curated.json"
    if not src_path.exists():
        return []
    data = json.loads(src_path.read_text())
    return data.get("entries", [])


def collect_ns_auto() -> list[dict]:
    """Auto-extracted curated-style entries (bunkers, Stolperschwellen, …)
    parsed from canonical Wikipedia list pages.

    Loaded *after* the manual curated.json so the manual entries win
    spatial dedup and hand-edits aren't overwritten.
    """
    src_path = RAW / "ns_orte_auto.json"
    if not src_path.exists():
        return []
    return json.loads(src_path.read_text())


def collect_ns_renamed_streets() -> list[dict]:
    """Streets/squares renamed during the NS era (1933–1945) and
    reverted after the war. Hand-curated from cited Wikipedia
    references to the RP-Online local-history piece 'Wie die Stadt
    braun wurde'."""
    src_path = OVERRIDES / "renamed_streets" / "curated.json"
    if not src_path.exists():
        return []
    data = json.loads(src_path.read_text())
    return data.get("entries", [])


def collect_ns_persons() -> list[dict]:
    """NS-era persons born/died in MG, harvested from Wikidata."""
    src_path = RAW / "ns_personen.json"
    if not src_path.exists():
        return []
    out: list[dict] = []
    for p in json.loads(src_path.read_text()):
        # Compute representative NS-era year for the timeline:
        # - Holocaust victims → year of death
        # - NSDAP / Widerstand → first NS-era touchpoint (1933 baseline,
        #   or year of death if earlier than 1945)
        year: int | None = None
        if p.get("death"):
            try:
                y = int(p["death"][:4])
                if 1933 <= y <= 1945:
                    year = y
            except ValueError:
                pass
        if year is None and "Holocaust-Opfer" not in p.get("roles", []):
            year = 1933
        out.append({
            **p,
            "year": year,
        })
    return out


# When a sub-layer's entries have a clear NS-era year, the timeline
# uses it. For categories that span the whole period (cemeteries,
# memorials erected post-war) we leave year=null so they remain visible
# at every slider position.
CATEGORY_DEFAULT_YEAR: dict[str, int | None] = {
    "destroyed_synagogue": 1938,    # Reichspogromnacht
    "synagogue_memorial": 1938,
    "bunker": 1941,                  # NS air-raid bunker construction phase begins
    "stolperschwelle": None,         # post-war commemoration
    "perpetrator_site": 1933,        # Machtergreifung anchor
    "forced_labor": 1942,            # peak forced-labor recruitment
    "pow_camp_memorial": 1941,
    "concentration_camp": 1941,
    "ns_victim_memorial": 1942,      # mid-war
    "resistance_memorial": 1933,     # ongoing throughout NS era
    "jewish_cemetery": None,         # pre-existing, persisted through NS
    "jewish_site": None,
    "ns_memorial": None,
    "memorial_other": None,
    "aryanization": 1938,
    "renamed_street": 1933,
}


CATEGORY_TO_SUBLAYER: dict[str, str] = {
    "destroyed_synagogue": "ns-synagogen",
    "synagogue_memorial": "ns-synagogen",
    "jewish_cemetery": "ns-friedhoefe",
    "jewish_site": "ns-friedhoefe",
    "bunker": "ns-bunker",
    "stolperschwelle": "ns-stolperschwellen",
    "forced_labor": "ns-zwangsarbeit",
    "pow_camp_memorial": "ns-zwangsarbeit",
    "concentration_camp": "ns-zwangsarbeit",
    "aryanization": "ns-taeter",
    "perpetrator_site": "ns-taeter",
    "renamed_street": "ns-strassen",
    "ns_victim_memorial": "ns-gedenkorte",
    "ns_memorial": "ns-gedenkorte",
    "resistance_memorial": "ns-gedenkorte",
    "memorial_other": "ns-gedenkorte",
}


def build_ns_orte() -> dict[str, int]:
    """Split the merged NS corpus into one GeoJSON per sub-layer.

    Per-entry content JSON files are still written under content/ns-orte/
    (single namespace) so the sidebar fetcher only needs to know the
    category, not which sub-layer file it lives in.
    """
    out_dir = OUT_CONTENT / "ns-orte"
    out_dir.mkdir(parents=True, exist_ok=True)
    written: set[str] = set()

    all_entries: list[dict] = []
    all_entries.extend(collect_ns_curated())   # manual — highest priority
    all_entries.extend(collect_ns_auto())      # auto-extracted from WP lists
    all_entries.extend(collect_ns_renamed_streets())  # NS street namings
    all_entries.extend(collect_ns_persons())   # Wikidata persons
    all_entries.extend(collect_ns_baudenkmaeler())
    all_entries.extend(collect_ns_osm())
    all_entries.extend(collect_ns_narrative())

    # de-dupe by spatial proximity within 25 m AND same category, priority
    # curated > baudenkmal > osm (insertion order). Persons are exempt:
    # they have a deterministic jitter and represent distinct individuals,
    # so we don't want any to be merged with each other or with sites.
    keep: list[dict] = []
    for e in all_entries:
        e_lat, e_lng = e.get("lat"), e.get("lng")
        if e_lat is None or e_lng is None:
            continue
        if e.get("source") == "wikidata":
            keep.append(e)
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
    by_sublayer: dict[str, list[dict]] = {}
    for e in keep:
        eid = e.get("id") or ""
        while eid in seen_ids or not eid:
            eid = f"{eid}-x" if eid else f"ns-{len(seen_ids)}"
        seen_ids.add(eid)
        e["id"] = eid

        cat = e.get("category", "ns_memorial")
        sublayer = CATEGORY_TO_SUBLAYER.get(cat, "ns-gedenkorte")
        # Try to extract an explicit NS-era year from the description;
        # otherwise fall back to the category default. null means "always
        # visible on the timeline".
        year: int | None = None
        desc = e.get("description") or ""
        for ym in re.finditer(r"\b(19[34][0-9])\b", desc):
            try:
                y = int(ym.group(1))
                if 1933 <= y <= 1945:
                    year = y if year is None else min(year, y)
            except ValueError:
                continue
        if year is None:
            year = CATEGORY_DEFAULT_YEAR.get(cat)
        feature = {
            "type": "Feature",
            "id": eid,
            "geometry": {"type": "Point", "coordinates": [e["lng"], e["lat"]]},
            "properties": {
                "id": eid,
                "name": e.get("name", ""),
                "category": cat,
                "address": e.get("address", ""),
                "year": year,
            },
        }
        by_sublayer.setdefault(sublayer, []).append(feature)

        (out_dir / f"{eid}.json").write_text(
            json.dumps({"kind": "ns-orte", **e}, ensure_ascii=False, indent=2)
        )
        written.add(eid)

    _prune_orphans(out_dir, written)
    OUT_DATA.mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}
    # Always write empty FeatureCollections for known sub-layers so the
    # frontend doesn't 404 on layers that happen to have no entries.
    for sublayer in {
        "ns-synagogen",
        "ns-friedhoefe",
        "ns-bunker",
        "ns-stolperschwellen",
        "ns-zwangsarbeit",
        "ns-taeter",
        "ns-strassen",
        "ns-gedenkorte",
    } | set(by_sublayer):
        feats = by_sublayer.get(sublayer, [])
        fc = {"type": "FeatureCollection", "features": feats}
        (OUT_DATA / f"{sublayer}.geojson").write_text(
            json.dumps(fc, ensure_ascii=False)
        )
        counts[sublayer] = len(feats)
    return counts


def main() -> None:
    n_loc, n_stones = build_stolpersteine()
    counts = build_ns_orte()
    print(f"stolpersteine: {n_loc} locations covering {n_stones} stones")
    total_ns = sum(counts.values())
    print(f"ns-orte:       {total_ns} features split into:")
    for k in sorted(counts, key=lambda x: -counts[x]):
        print(f"   {counts[k]:3d}  {k}")


if __name__ == "__main__":
    main()
