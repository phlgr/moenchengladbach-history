#!/usr/bin/env python3
"""Automatically generate the kind of override entries that we previously
hand-wrote in overrides/ns_orte/curated.json.

Sources scanned:
1. Wikipedia 'Liste von Bunkeranlagen in Nordrhein-Westfalen', the
   Mönchengladbach section. Each bullet is parsed for an address +
   description; the address is geocoded via Nominatim.
2. Wikipedia 'Liste der Synagogen in Deutschland', NRW section.
   Filtered to MG-area places (Mönchengladbach, Rheydt, Odenkirchen,
   Wickrathberg, Wickrath, Wanlo).
3. Stolperschwellen — already extracted in the regular Stolperstein
   pipeline, so this fetcher just rebuilds the canonical entry from
   the same wikitext to keep the curation pipeline self-contained.

Output: data/raw/ns_orte_auto.json — same schema as the manual curated
file. The manual overrides/ns_orte/curated.json keeps priority over
this file via spatial dedup so hand-edits never get overwritten.
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

import httpx

from _common import UA, slugify, strip_wikitext

OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "ns_orte_auto.json"

MG_PLACES = re.compile(
    r"\b(Mönchengladbach|Rheydt|Odenkirchen|Wickrathberg|Wickrath|Wanlo|"
    r"Hardt|Hardterbroich|Eicken|Lürrip|Geneicken|Giesenkirchen|Holt|"
    r"Wickrathhahn|Pesch|Waldhausen|Westend|Windberg|Winkeln|"
    r"Rheindahlen|Beltinghoven|Schelsen|Bonnenbroich)\b",
    re.I,
)


def fetch_wikitext(title: str) -> str:
    r = httpx.get(
        "https://de.wikipedia.org/w/index.php",
        params={"title": title, "action": "raw"},
        headers={"User-Agent": UA},
        follow_redirects=True,
        timeout=30,
    )
    r.raise_for_status()
    return r.text


def geocode(query: str) -> tuple[float, float] | None:
    r = httpx.get(
        "https://nominatim.openstreetmap.org/search",
        params={
            "q": query,
            "format": "jsonv2",
            "limit": 1,
            "countrycodes": "de",
        },
        headers={"User-Agent": UA},
        timeout=30,
    )
    if not r.is_success:
        return None
    data = r.json()
    if not data:
        return None
    return float(data[0]["lat"]), float(data[0]["lon"])


# ---------------------------------------------------------------------- bunkers

def parse_bunker_nrw_mg() -> list[dict]:
    title = "Liste von Bunkeranlagen in Nordrhein-Westfalen"
    print(f"  fetching {title}", file=sys.stderr)
    wikitext = fetch_wikitext(title)
    # extract the MG section
    m = re.search(
        r"=== Mönchengladbach ===(.*?)(?=^===|\Z)",
        wikitext,
        re.DOTALL | re.MULTILINE,
    )
    if not m:
        return []
    block = m.group(1)
    lines = [
        line.strip().lstrip("*").strip()
        for line in block.split("\n")
        if line.strip().startswith("*")
    ]
    out: list[dict] = []
    for line in lines:
        text = strip_wikitext(line)
        if not text or len(text) < 10:
            continue
        # Try to extract a street/address-looking head: "<Address>, <description>"
        # or just the whole line as the description.
        # Geocode with the whole text + ', Mönchengladbach' suffix.
        addr_query = re.split(r"[,(]", text, 1)[0].strip()
        if not addr_query:
            continue
        coords = geocode(f"{addr_query}, Mönchengladbach")
        time.sleep(1)
        if not coords:
            continue
        lat, lng = coords
        slug = slugify(addr_query)[:50]
        out.append({
            "id": f"auto-bunker-{slug}",
            "name": f"Hochbunker {addr_query}",
            "category": "bunker",
            "lat": lat,
            "lng": lng,
            "address": addr_query,
            "description": text,
            "source": "wp-auto",
            "source_url": (
                f"https://de.wikipedia.org/wiki/{title.replace(' ', '_')}"
            ),
        })
    return out


# ------------------------------------------------------------------ synagogues

def parse_synagogues_de_mg() -> list[dict]:
    title = "Liste der Synagogen in Deutschland"
    print(f"  fetching {title}", file=sys.stderr)
    wikitext = fetch_wikitext(title)
    out: list[dict] = []
    seen_places: set[str] = set()
    # Lines with [[Synagoge (X)]] or '[[X]]' near MG keywords
    line_re = re.compile(r"\[\[(?:Synagoge[^|\]]*\|)?([^\]|]*?)(?:\|[^\]]*)?\]\]")
    for line in wikitext.splitlines():
        if not MG_PLACES.search(line):
            continue
        if "synagog" not in line.lower():
            continue
        # Skip headings + table rows that aren't entries
        if line.startswith("=="):
            continue
        clean = strip_wikitext(line)
        if not clean or "Mönchengladbach" not in clean and not any(
            p in clean for p in ("Rheydt", "Odenkirchen", "Wickrathberg", "Wanlo")
        ):
            # second filter: only keep entries that name our locales explicitly
            continue
        # pick the locale name
        place_match = MG_PLACES.search(clean)
        place = place_match.group(1) if place_match else "Mönchengladbach"
        place_key = place.lower()
        if place_key in seen_places:
            continue
        seen_places.add(place_key)
        coords = geocode(f"Synagoge {place}")
        time.sleep(1)
        if not coords:
            coords = geocode(place)
            time.sleep(1)
        if not coords:
            continue
        lat, lng = coords
        out.append({
            "id": f"auto-synagoge-{slugify(place)}",
            "name": f"Synagoge {place}",
            "category": "destroyed_synagogue",
            "lat": lat,
            "lng": lng,
            "address": place,
            "description": clean[:600],
            "source": "wp-auto",
            "source_url": (
                f"https://de.wikipedia.org/wiki/{title.replace(' ', '_')}"
            ),
        })
    return out


# ------------------------------------------------------------ Stolperschwellen

def parse_stolperschwellen() -> list[dict]:
    title = "Liste der Stolpersteine in Mönchengladbach – Stadtbezirk Süd"
    print(f"  fetching {title}", file=sys.stderr)
    wikitext = fetch_wikitext(title)
    sec = re.split(r"==\s*Verlegte Stolperschwellen\s*==", wikitext, maxsplit=1)
    if len(sec) < 2:
        return []
    block = sec[1].split("\n|}", 1)[0]
    out: list[dict] = []
    coord_re = re.compile(
        r"NS\s*=\s*([0-9.]+)[^}]*?EW\s*=\s*([0-9.]+)",
        re.DOTALL,
    )
    # Take everything from the first |- to end
    rows = re.split(r"\n\|-\s*\n", block)[1:]
    for row in rows:
        m = coord_re.search(row)
        if not m:
            continue
        lat = float(m.group(1))
        lng = float(m.group(2))
        # Address is the first cell content before the {{Coordinate ...}}
        addr_match = re.search(
            r"^\|\s*(?:rowspan=\"[^\"]+\"\|\s*)?(.+?)\s*<br\s*/?>\s*\{\{Coordinate",
            row,
            re.DOTALL | re.MULTILINE,
        )
        address = strip_wikitext(addr_match.group(1)) if addr_match else ""
        # Inscription cell — contains 'Hier' or 'Als ' headline
        rest = strip_wikitext(row)
        out.append({
            "id": f"auto-stolperschwelle-{slugify(address)[:50]}",
            "name": f"Stolperschwelle {address}",
            "category": "stolperschwelle",
            "lat": lat,
            "lng": lng,
            "address": address,
            "description": rest[:1500],
            "source": "wp-auto",
            "source_url": (
                f"https://de.wikipedia.org/wiki/{title.replace(' ', '_')}"
            ),
        })
    return out


# ----------------------------------------------------------------------- main

def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    entries: list[dict] = []
    entries.extend(parse_bunker_nrw_mg())
    entries.extend(parse_synagogues_de_mg())
    entries.extend(parse_stolperschwellen())
    OUT.write_text(json.dumps(entries, ensure_ascii=False, indent=2))
    print(f"wrote {len(entries)} auto-curated entries → {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
