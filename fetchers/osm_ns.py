#!/usr/bin/env python3
"""Fetch NS-regime-related historical features from OSM via Overpass.

Includes:
- historic=memorial filtered by name/inscription keywords (Synagoge, Mahnmal,
  Gedenkstein, Kriegerdenkmal, Stolperschwelle, etc.)
- memorial:type=war_memorial / stolperschwelle
- military=bunker (NS-era only — exclude generic concrete pillboxes that
  don't match NS keywords)
- explicit war_memorial regardless of name (Kriegerdenkmäler are
  WW1/WW2-era artefacts and culturally NS-adjacent)

Output: data/raw/ns_orte_osm.json
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import httpx

UA = (
    "moenchengladbach-history/0.1 "
    "(https://github.com/pgrigorov/moenchengladbach-history; pg@bgdlabs.com) httpx"
)

OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "ns_orte_osm.json"

OVERPASS_QUERY = """
[out:json][timeout:60];
area["name"="Mönchengladbach"]["boundary"="administrative"]->.a;
(
  nwr["historic"](area.a);
  nwr["military"="bunker"](area.a);
);
out tags center;
"""

NS_KEYWORDS = re.compile(
    r"(bunker|luftschutz|hochbunk|synagog|mahnm|gedenk|kriegerdenkm|"
    r"opfer|1933|1945|reichspogrom|stolperschw|zwangsarbeit|"
    r"jüdisch|judisch|deportier|nationalsoz|widerstand|gefallen|"
    r"krieg)",
    re.I,
)


def fetch() -> dict:
    r = httpx.post(
        "https://overpass-api.de/api/interpreter",
        data={"data": OVERPASS_QUERY},
        headers={"User-Agent": UA},
        timeout=90,
    )
    r.raise_for_status()
    return r.json()


def is_ns_related(tags: dict[str, str]) -> tuple[bool, str]:
    """Return (matches, category). category is one of:
    war_memorial, synagogue_memorial, jewish_cemetery, bunker,
    pow_camp_memorial, stolperschwelle, plaque, other.
    """
    mt = tags.get("memorial:type", "")
    mem = tags.get("memorial", "")
    hist = tags.get("historic", "")
    mil = tags.get("military", "")
    name = tags.get("name", "")
    inscr = tags.get("inscription", "")

    if mt == "stolperstein" or mem == "stolperstein":
        return False, ""

    if mt == "stolperschwelle" or mem == "stolperschwelle":
        return True, "stolperschwelle"
    if mt == "war_memorial" or mem == "war_memorial":
        return True, "war_memorial"
    if mil == "bunker":
        return True, "bunker"

    text = " ".join([name, inscr, mt, mem, hist, mil])
    if not NS_KEYWORDS.search(text):
        return False, ""

    low = text.lower()
    if "synagog" in low:
        return True, "synagogue_memorial"
    if "jüdisch" in low or "judisch" in low:
        return True, "jewish_cemetery" if "friedhof" in low or "cemetery" in low else "jewish_site"
    if "bunker" in low or "luftschutz" in low:
        return True, "bunker"
    if "kriegsgefangen" in low:
        return True, "pow_camp_memorial"
    if "stolperschw" in low:
        return True, "stolperschwelle"
    if "krieger" in low or "gefallen" in low:
        return True, "war_memorial"
    if "mahnm" in low or "gedenk" in low:
        return True, "memorial_other"
    return True, "other"


def slugify(s: str) -> str:
    s = (s or "").lower()
    table = {"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"}
    s = "".join(table.get(c, c) for c in s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-") or "x"


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    data = fetch()
    entries: list[dict] = []
    seen_ids: set[str] = set()
    for e in data.get("elements", []):
        tags = e.get("tags") or {}
        match, category = is_ns_related(tags)
        if not match:
            continue
        if e["type"] == "node":
            lat, lng = e.get("lat"), e.get("lon")
        else:
            c = e.get("center") or {}
            lat, lng = c.get("lat"), c.get("lon")
        if lat is None or lng is None:
            continue

        name = tags.get("name") or tags.get("memorial:name") or ""
        if not name:
            # synthesize a name
            mtype = tags.get("memorial:type") or tags.get("memorial") or tags.get("historic") or "Denkmal"
            name = mtype.replace("_", " ").title()

        osm_id = f"osm-{e['type'][0]}{e['id']}"
        slug = slugify(name)[:60]
        eid = f"ns-{slug}-{osm_id}" if slug else f"ns-{osm_id}"
        if eid in seen_ids:
            eid = f"{eid}-{len(seen_ids)}"
        seen_ids.add(eid)

        entries.append({
            "id": eid,
            "name": name,
            "category": category,
            "lat": lat,
            "lng": lng,
            "address": tags.get("addr:street") or "",
            "description": tags.get("description") or tags.get("inscription") or "",
            "wikipedia": tags.get("wikipedia") or "",
            "wikidata": tags.get("wikidata") or "",
            "image": tags.get("image") or "",
            "source": "osm",
            "source_url": (
                f"https://www.openstreetmap.org/{e['type']}/{e['id']}"
            ),
            "raw_tags": {
                k: v for k, v in tags.items()
                if k in {"historic", "memorial", "memorial:type", "military", "name"}
            },
        })

    OUT.write_text(json.dumps(entries, ensure_ascii=False, indent=2))
    print(f"wrote {len(entries)} entries → {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
