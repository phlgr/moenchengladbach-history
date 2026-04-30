#!/usr/bin/env python3
"""Fetch Mönchengladbach Baudenkmäler from the 7 alphabetical Wikipedia pages.

Each entry uses the {{Denkmalliste Moenchengladbach Tabellenzeile}} template
with named params: Bild, Bezeichnung, Ortsteil, Adresse, NS, EW, Region,
Beschreibung, Bauzeit, Eintragung, Nummer.

Output: data/raw/baudenkmaeler_wp.json — flat list of entries with:
  id, name, ortsteil, address, lat, lng, build_date, registration_date,
  description, image, source_url

Coverage measured 2026-04-30: ~1000 entries with coordinates.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import httpx
import mwparserfromhell as mwp

from _common import UA, slugify, strip_wikitext

PAGES = [
    "Liste der Baudenkmäler in Mönchengladbach (Denkmäler A–C)",
    "Liste der Baudenkmäler in Mönchengladbach (Denkmäler D–F)",
    "Liste der Baudenkmäler in Mönchengladbach (Denkmäler G–J)",
    "Liste der Baudenkmäler in Mönchengladbach (Denkmäler K–M)",
    "Liste der Baudenkmäler in Mönchengladbach (Denkmäler N–P)",
    "Liste der Baudenkmäler in Mönchengladbach (Denkmäler Q–S)",
    "Liste der Baudenkmäler in Mönchengladbach (Denkmäler T–Z)",
]

OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "baudenkmaeler_wp.json"

TEMPLATE_NAME = "Denkmalliste Moenchengladbach Tabellenzeile"


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


def parse_page(title: str, wikitext: str) -> list[dict]:
    parsed = mwp.parse(wikitext)
    entries: list[dict] = []
    for tpl in parsed.filter_templates():
        name = str(tpl.name).strip()
        if name != TEMPLATE_NAME:
            continue

        def get(key: str) -> str | None:
            try:
                return str(tpl.get(key).value).strip() or None
            except ValueError:
                return None

        ns = get("NS")
        ew = get("EW")
        try:
            lat = float(ns) if ns else None
            lng = float(ew) if ew else None
        except ValueError:
            continue
        if lat is None or lng is None:
            continue

        nummer_raw = get("Nummer") or ""
        nummer = strip_wikitext(nummer_raw).replace(" ", "-")
        adresse = strip_wikitext(get("Adresse") or "")
        if not nummer:
            # synthesize from address
            nummer = slugify(adresse)[:40] or f"unk-{len(entries)}"

        bezeichnung = strip_wikitext(get("Bezeichnung") or "")
        ortsteil = strip_wikitext(get("Ortsteil") or "")
        bauzeit = strip_wikitext(get("Bauzeit") or "")
        eintragung = strip_wikitext(get("Eintragung") or "")
        beschreibung = strip_wikitext(get("Beschreibung") or "")
        bild = (get("Bild") or "").strip().replace(" ", "_") or None

        # Display name: Bezeichnung (which is often italicised type like "Wohnhaus")
        # combined with address. Bezeichnung alone is too generic.
        if bezeichnung and adresse:
            display = f"{bezeichnung} — {adresse}"
        else:
            display = bezeichnung or adresse or nummer

        entries.append({
            "id": f"d-{slugify(nummer)}",
            "nummer": nummer,
            "name": display,
            "bezeichnung": bezeichnung,
            "ortsteil": ortsteil,
            "address": adresse,
            "lat": lat,
            "lng": lng,
            "build_date": bauzeit,
            "registration_date": eintragung,
            "description": beschreibung,
            "image": bild,
            "source_url": f"https://de.wikipedia.org/wiki/{title.replace(' ', '_')}",
        })

    return entries


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    all_entries: list[dict] = []
    seen_ids: set[str] = set()
    for title in PAGES:
        print(f"fetching: {title}", file=sys.stderr)
        wikitext = fetch_wikitext(title)
        entries = parse_page(title, wikitext)
        # de-dupe (some pages overlap when entries are renumbered)
        unique = []
        for e in entries:
            if e["id"] in seen_ids:
                e["id"] = f"{e['id']}-{len(seen_ids)}"
            seen_ids.add(e["id"])
            unique.append(e)
        print(f"  parsed {len(unique)} entries", file=sys.stderr)
        all_entries.extend(unique)
        time.sleep(0.5)
    OUT.write_text(json.dumps(all_entries, ensure_ascii=False, indent=2))
    print(f"wrote {len(all_entries)} total → {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
