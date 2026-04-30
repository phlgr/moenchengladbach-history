#!/usr/bin/env python3
"""Find NS-era persons with a German Wikipedia article who were born or
died in Mönchengladbach (Q2758) and have a verifiable NS-affiliation.

Three categories:
  - NSDAP        : Wikidata P102 = Q7320 (member of NSDAP)
  - Widerstand    : Wikidata P106 = Q1209498 (resistance fighter)
  - Holocaust    : Wikidata P509 = Q485016 (cause of death = Holocaust)

For each person, fetch the German Wikipedia article intro to extract
a Stadtteil reference ("Rheydt", "Odenkirchen", …) so we can geocode
the marker to the right district instead of dumping all 10 on the city
centre. If no Stadtteil is found, we deterministically jitter around
the MG city centre so the markers don't perfectly overlap.

Output: data/raw/ns_personen.json
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import sys
import time
from pathlib import Path

import httpx

from _common import UA

OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "ns_personen.json"

MG_QID = "Q2758"
MG_CENTER = (51.196, 6.444)

# Approximate centroids of MG districts where notable NS-era figures
# might have been born/died. From earlier Nominatim runs.
DISTRICT_COORDS: dict[str, tuple[float, float]] = {
    "rheydt":         (51.1660, 6.4445),
    "odenkirchen":    (51.1336, 6.4484),
    "wickrath":       (51.1450, 6.4205),
    "wickrathberg":   (51.1582, 6.3968),
    "wanlo":          (51.0950, 6.4165),
    "rheindahlen":    (51.1497, 6.3631),
    "hardt":          (51.1981, 6.3830),
    "hehn":           (51.1956, 6.3796),
    "venn":           (51.1773, 6.3895),
    "westend":        (51.1880, 6.4234),
    "neuwerk":        (51.2189, 6.4593),
    "giesenkirchen":  (51.1786, 6.4928),
    "schelsen":       (51.1881, 6.5141),
    "lürrip":         (51.1996, 6.4692),
    "luerrip":        (51.1996, 6.4692),
    "eicken":         (51.2049, 6.4459),
    "windberg":       (51.2071, 6.4185),
    "waldhausen":     (51.1959, 6.4116),
    "broich":         (51.2110, 6.4670),
}


SPARQL = """
SELECT DISTINCT ?p ?pLabel ?birth ?death ?article (GROUP_CONCAT(DISTINCT ?role; separator="|") AS ?roles) WHERE {
  { ?p wdt:P19 wd:Q2758 } UNION { ?p wdt:P20 wd:Q2758 }
  ?p wdt:P31 wd:Q5 .
  ?p rdfs:label ?pLabel . FILTER(LANG(?pLabel) = "de")
  OPTIONAL { ?p wdt:P569 ?birth }
  OPTIONAL { ?p wdt:P570 ?death }
  OPTIONAL { ?article schema:about ?p ; schema:isPartOf <https://de.wikipedia.org/> }
  {
    ?p wdt:P102 wd:Q7320 . BIND("NSDAP" AS ?role)
  } UNION {
    ?p wdt:P509 wd:Q485016 . BIND("Holocaust-Opfer" AS ?role)
  } UNION {
    ?p wdt:P106 wd:Q1209498 . BIND("Widerstand" AS ?role)
  }
  FILTER(?death <= "1960-12-31"^^xsd:dateTime || !BOUND(?death))
} GROUP BY ?p ?pLabel ?birth ?death ?article LIMIT 80
"""


def fetch_persons() -> list[dict]:
    r = httpx.get(
        "https://query.wikidata.org/sparql",
        params={"query": SPARQL},
        headers={"Accept": "application/sparql-results+json", "User-Agent": UA},
        timeout=120,
    )
    r.raise_for_status()
    out: list[dict] = []
    for b in r.json()["results"]["bindings"]:
        qid = b["p"]["value"].rsplit("/", 1)[-1]
        article = b.get("article", {}).get("value")
        if not article:
            continue  # require a German Wikipedia article
        title = article.rsplit("/", 1)[-1].replace("_", " ")
        from urllib.parse import unquote
        title = unquote(title)
        roles = b.get("roles", {}).get("value", "").split("|")
        roles = sorted({r for r in roles if r})
        out.append({
            "qid": qid,
            "label": b["pLabel"]["value"],
            "title": title,
            "article": article,
            "birth": b.get("birth", {}).get("value", "")[:10] or None,
            "death": b.get("death", {}).get("value", "")[:10] or None,
            "roles": roles,
        })
    return out


def fetch_intro(title: str) -> tuple[str, str | None]:
    """Return (intro_html_clean, image_filename)."""
    try:
        r = httpx.get(
            "https://de.wikipedia.org/api/rest_v1/page/summary/" + title,
            headers={"User-Agent": UA},
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        extract = data.get("extract", "")
        thumb = data.get("originalimage", {}).get("source", "") or data.get(
            "thumbnail", {}
        ).get("source", "")
        # Convert thumb URL → bare Commons filename if possible
        image: str | None = None
        if thumb:
            # …/wikipedia/commons/[thumb/]X/YY/Filename.jpg/[width-Filename.jpg]
            m = re.search(r"/commons/(?:thumb/)?[a-f0-9]/[a-f0-9]{2}/([^/]+)", thumb)
            if m:
                image = m.group(1)
        return extract, image
    except httpx.HTTPError:
        return "", None


def find_district(text: str) -> str | None:
    low = text.lower()
    for name in DISTRICT_COORDS:
        if re.search(rf"\b{re.escape(name)}\b", low):
            return name
    return None


def jitter_for(qid: str) -> tuple[float, float]:
    """Deterministic small jitter around MG centre based on the Q-id, so
    persons without a Stadtteil reference don't perfectly stack."""
    h = hashlib.md5(qid.encode()).hexdigest()
    angle = (int(h[:4], 16) / 0xFFFF) * math.tau
    radius = 0.005 + (int(h[4:8], 16) / 0xFFFF) * 0.012  # 0.5–1.7 km roughly
    lat, lng = MG_CENTER
    return (
        lat + math.sin(angle) * radius,
        lng + math.cos(angle) * radius * 1.4,  # stretch east-west to match coords scale
    )


def categorise(roles: list[str]) -> str:
    if "Holocaust-Opfer" in roles:
        return "ns_victim_memorial"
    if "Widerstand" in roles:
        return "resistance_memorial"
    if "NSDAP" in roles:
        return "perpetrator_site"
    return "ns_memorial"


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    print("fetching persons from Wikidata…", file=sys.stderr)
    persons = fetch_persons()
    print(f"  {len(persons)} persons returned", file=sys.stderr)
    out: list[dict] = []
    for i, p in enumerate(persons):
        intro, image = fetch_intro(p["title"])
        time.sleep(0.4)
        district = find_district(p["title"]) or find_district(intro)
        if district and district in DISTRICT_COORDS:
            lat, lng = DISTRICT_COORDS[district]
        else:
            lat, lng = jitter_for(p["qid"])
            district = None
        category = categorise(p["roles"])
        years = []
        if p.get("birth"):
            years.append(p["birth"][:4])
        if p.get("death"):
            years.append(p["death"][:4])
        out.append({
            "id": f"person-{p['qid'].lower()}",
            "name": p["label"],
            "category": category,
            "lat": lat,
            "lng": lng,
            "address": district.title() if district else "",
            "description": intro,
            "image": image,
            "wikidata": p["qid"],
            "source": "wikidata",
            "source_url": p["article"],
            "roles": p["roles"],
            "lifespan": " – ".join(years) if years else None,
        })
        if (i + 1) % 5 == 0:
            print(
                f"  enriched {i + 1}/{len(persons)}",
                file=sys.stderr,
            )
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f"wrote {len(out)} persons → {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
