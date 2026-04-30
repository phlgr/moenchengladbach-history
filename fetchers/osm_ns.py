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

from _common import UA, slugify

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

# Keywords that confidently mark an entry as NS-regime-related.
# Deliberately *narrow* — generic "krieg" and "kriegerdenkmal" matches
# almost any village WW1 memorial and are excluded.
NS_KEYWORDS_STRICT = re.compile(
    r"(bunker|luftschutz|hochbunk|synagog|reichspogrom|stolperschw|"
    r"zwangsarbeit|jüdisch|judisch|deportier|nationalsoz|widerstand|"
    r"konzentrationsl|opfer\s+des|kriegsgefangen)",
    re.I,
)

# Looser markers — only treat as NS if combined with a WW2-era date,
# i.e. these names alone aren't enough to qualify.
NS_KEYWORDS_LOOSE = re.compile(
    r"(mahnm|gedenk|kriegerdenkm|gefallen)",
    re.I,
)

WW2_DATES = re.compile(r"(193[3-9]|194[0-5]|2\.\s*Weltkrieg|II\.\s*Weltkrieg|Drittes\s*Reich)")


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
    """Return (matches, category) for entries that are *specifically*
    NS-regime-related. Excludes WW1-only memorials, wayside crosses,
    and 19th-century imperial monuments.
    """
    mt = tags.get("memorial:type", "")
    mem = tags.get("memorial", "")
    hist = tags.get("historic", "")
    mil = tags.get("military", "")
    name = tags.get("name", "")
    inscr = tags.get("inscription", "")
    desc = tags.get("description", "")

    if mt == "stolperstein" or mem == "stolperstein":
        return False, ""

    # Wayside crosses & shrines are almost never NS-Orte.
    if hist in {"wayside_cross", "wayside_shrine", "wayside_chapel"}:
        return False, ""

    if mt == "stolperschwelle" or mem == "stolperschwelle":
        return True, "stolperschwelle"
    if mil == "bunker":
        return True, "bunker"

    text = " ".join([name, inscr, desc, mt, mem, hist, mil])
    low = text.lower()

    # Strict keywords pin the category directly.
    if NS_KEYWORDS_STRICT.search(text):
        if "synagog" in low:
            return True, "synagogue_memorial"
        if "jüdisch" in low or "judisch" in low:
            return True, (
                "jewish_cemetery"
                if "friedhof" in low or "cemetery" in low
                else "jewish_site"
            )
        if "bunker" in low or "luftschutz" in low or "hochbunk" in low:
            return True, "bunker"
        if "kriegsgefangen" in low:
            return True, "pow_camp_memorial"
        if "stolperschw" in low:
            return True, "stolperschwelle"
        if "zwangsarbeit" in low:
            return True, "forced_labor"
        if "konzentrationsl" in low:
            return True, "concentration_camp"
        if "deportier" in low or "opfer des" in low or "nationalsoz" in low:
            return True, "ns_victim_memorial"
        if "widerstand" in low:
            return True, "resistance_memorial"
        return True, "ns_memorial"

    # Loose keywords (Mahnmal/Gedenk/Kriegerdenkmal/Gefallen) only
    # qualify if explicit NS-era date is present.
    if NS_KEYWORDS_LOOSE.search(text) and WW2_DATES.search(text):
        return True, "ns_victim_memorial"

    return False, ""


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
            # synthesize a name from category, then from inscription/description
            cat_label = {
                "bunker": "Luftschutzbunker",
                "jewish_cemetery": "Jüdischer Friedhof",
                "jewish_site": "Gedenktafel jüdische Bürger",
                "synagogue_memorial": "Gedenkort Synagoge",
                "stolperschwelle": "Stolperschwelle",
                "pow_camp_memorial": "Kriegsgefangenenlager-Denkmal",
                "forced_labor": "Zwangsarbeit-Gedenkort",
                "concentration_camp": "KZ-Gedenkort",
                "ns_victim_memorial": "NS-Opfer-Gedenkort",
                "ns_memorial": "NS-Gedenkort",
                "resistance_memorial": "Widerstands-Gedenkort",
            }.get(category, "")
            if cat_label:
                name = cat_label
            else:
                inscr = tags.get("inscription") or tags.get("description") or ""
                if inscr:
                    name = inscr.split(".")[0][:60].strip()
                else:
                    name = (
                        tags.get("memorial:type")
                        or tags.get("memorial")
                        or tags.get("historic")
                        or "Denkmal"
                    ).replace("_", " ").title()

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
