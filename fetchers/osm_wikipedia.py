#!/usr/bin/env python3
"""Harvest NS-related POIs from OSM nodes/ways/relations in MG that link to
a German Wikipedia article whose intro paragraph contains NS-era keywords.

Strategy:
1. Overpass: features in MG with a `wikipedia` tag.
2. Pre-filter: keep only those tagged `historic=*`, `tourism=museum`,
   `memorial=*`, or `building` types likely to have a story. Skip plain
   place/village/suburb/road nodes — those are administrative POIs that
   pollute results and inflate API calls.
3. For each surviving candidate, fetch the linked Wikipedia article's
   first 1500 chars via the MediaWiki action=raw API (no JSON parsing),
   strip wikitext, scan for NS-strict keywords + WW2 dates.
4. Emit data/raw/ns_orte_wp.json — entries with id, name, lat, lng,
   address, description (the matching sentence + a short summary),
   image (Wikipedia first image if any), source_url.

Rate-limit-friendly: Wikipedia API is hit at ~2 req/s with a descriptive
User-Agent. ~50 candidates expected after the pre-filter, so under a minute.
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

import httpx

from _common import UA, slugify, strip_wikitext

OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "ns_orte_wp.json"

NS_KEYWORDS_STRICT = re.compile(
    r"(bunker|luftschutz|hochbunk|synagog|reichspogrom|stolperschw|"
    r"zwangsarbeit|jüdisch|judisch|deportier|nationalsoz|widerstand|"
    r"konzentrationsl|ns-zeit|ns-regime|ns-staat|drittes reich|"
    r"opfer\s+des|kriegsgefangen|holocaust|shoah|reichskristall|"
    r"pogrom|gestapo|sa-mann|ss-mann)",
    re.I,
)
WW2_DATES = re.compile(
    r"(193[3-9]|194[0-5]|2\.\s*Weltkrieg|II\.\s*Weltkrieg|Drittes\s*Reich)"
)

OVERPASS_QUERY = """
[out:json][timeout:90];
area["name"="Mönchengladbach"]["boundary"="administrative"]->.a;
(
  nwr["wikipedia"]["historic"](area.a);
  nwr["wikipedia"]["memorial"](area.a);
  nwr["wikipedia"]["tourism"~"museum|attraction|memorial|gallery"](area.a);
  nwr["wikipedia"]["amenity"="place_of_worship"](area.a);
  nwr["wikipedia"]["building"]["building"!="yes"](area.a);
);
out tags center;
"""


def overpass() -> list[dict]:
    r = httpx.post(
        "https://overpass-api.de/api/interpreter",
        data={"data": OVERPASS_QUERY},
        headers={"User-Agent": UA},
        timeout=120,
    )
    r.raise_for_status()
    return r.json().get("elements", [])


def parse_wikipedia_tag(value: str) -> tuple[str, str] | None:
    """OSM stores wikipedia=lang:Title. Returns (lang, title) or None."""
    if not value or ":" not in value:
        return None
    lang, _, title = value.partition(":")
    lang = lang.strip().lower()
    if lang not in {"de", "en"}:
        return None
    return lang, title.strip()


def fetch_wikipedia_intro(lang: str, title: str) -> str | None:
    try:
        r = httpx.get(
            f"https://{lang}.wikipedia.org/w/index.php",
            params={"title": title, "action": "raw"},
            headers={"User-Agent": UA},
            follow_redirects=True,
            timeout=20,
        )
        if r.status_code == 404:
            return None
        r.raise_for_status()
    except httpx.HTTPError as e:
        print(f"  ! fetch failed for {title}: {e}", file=sys.stderr)
        return None
    return r.text


def first_paragraph(wikitext: str) -> str:
    """Skip frontmatter templates, infobox, and pull the first body paragraph."""
    # Remove infobox-style top-level templates greedily by counting braces.
    cleaned: list[str] = []
    depth = 0
    for ch in wikitext:
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth = max(0, depth - 1)
        elif depth == 0:
            cleaned.append(ch)
    body = "".join(cleaned)
    # Find first non-empty paragraph after possible blank lines
    for chunk in body.split("\n\n"):
        text = strip_wikitext(chunk)
        if len(text) > 80:
            return text
    return strip_wikitext(body[:1500])


def first_image(wikitext: str) -> str | None:
    m = re.search(r"\[\[(?:Datei|File|Bild):([^|\]]+)", wikitext, re.IGNORECASE)
    if not m:
        return None
    return m.group(1).strip().replace(" ", "_")


def categorise(intro: str) -> str:
    low = intro.lower()
    if "synagog" in low and ("zerstört" in low or "1938" in low or "pogrom" in low):
        return "destroyed_synagogue"
    if "synagog" in low:
        return "synagogue_memorial"
    if "jüdischer friedhof" in low or "jewish cemetery" in low:
        return "jewish_cemetery"
    if "bunker" in low or "luftschutz" in low or "hochbunker" in low:
        return "bunker"
    if "konzentrationsl" in low or "kz " in low:
        return "concentration_camp"
    if "zwangsarbeit" in low:
        return "forced_labor"
    if "kriegsgefangen" in low:
        return "pow_camp_memorial"
    if "stolperschw" in low:
        return "stolperschwelle"
    if "widerstand" in low:
        return "resistance_memorial"
    if "deportier" in low or "shoah" in low or "holocaust" in low:
        return "ns_victim_memorial"
    return "ns_memorial"


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    print("fetching OSM candidates …", file=sys.stderr)
    elements = overpass()
    candidates: list[tuple[dict, str, str]] = []
    seen_titles: set[str] = set()
    for e in elements:
        tags = e.get("tags") or {}
        wp = parse_wikipedia_tag(tags.get("wikipedia", ""))
        if not wp:
            continue
        lang, title = wp
        if title in seen_titles:
            continue
        seen_titles.add(title)
        if e["type"] == "node":
            lat, lng = e.get("lat"), e.get("lon")
        else:
            c = e.get("center") or {}
            lat, lng = c.get("lat"), c.get("lon")
        if lat is None or lng is None:
            continue
        candidates.append((e, lang, title))
    print(f"  {len(candidates)} candidates after pre-filter", file=sys.stderr)

    entries: list[dict] = []
    for i, (e, lang, title) in enumerate(candidates):
        if i and i % 10 == 0:
            print(f"  checked {i}/{len(candidates)}", file=sys.stderr)
        # Skip Stolperstein/Stolperschwelle list articles — those are
        # already covered by our Stolpersteine layer and re-importing
        # individual rows here would duplicate or fragment them.
        if title.lower().startswith("liste der stolperstein"):
            continue

        wikitext = fetch_wikipedia_intro(lang, title)
        time.sleep(0.5)
        if not wikitext:
            continue
        head = wikitext[:4000]
        if not NS_KEYWORDS_STRICT.search(head):
            continue
        intro = first_paragraph(head)
        if not intro or len(intro) < 60:
            continue
        # The article must actually be ABOUT something NS-related, not just
        # mention it in passing. Require the strict keyword to appear in
        # the first paragraph (the lead), not just somewhere in the head.
        if not NS_KEYWORDS_STRICT.search(intro):
            continue

        tags = e.get("tags") or {}
        if e["type"] == "node":
            lat, lng = e["lat"], e["lon"]
        else:
            c = e.get("center") or {}
            lat, lng = c["lat"], c["lon"]

        name = tags.get("name") or title
        cat = categorise(intro)
        image = first_image(head)

        eid = f"wp-{slugify(title)[:60]}"
        entries.append({
            "id": eid,
            "name": name,
            "category": cat,
            "lat": lat,
            "lng": lng,
            "address": tags.get("addr:street") or "",
            "description": intro[:1500],
            "image": image,
            "source": "osm-wikipedia",
            "source_url": f"https://{lang}.wikipedia.org/wiki/{title.replace(' ', '_')}",
            "wikipedia": f"{lang}:{title}",
        })

    OUT.write_text(json.dumps(entries, ensure_ascii=False, indent=2))
    print(f"wrote {len(entries)} NS-related WP-linked entries → {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
