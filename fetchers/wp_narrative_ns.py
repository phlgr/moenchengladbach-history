#!/usr/bin/env python3
"""Find NS-narrative locations in Mönchengladbach by scanning every
Wikipedia article that has a coordinate inside MG (per Wikidata).

Schloss Rheydt is the canonical example: not tagged 'NS' in OSM, but
its Wikipedia article narrates that Goebbels ordered renovations there
in 1940. This fetcher discovers analogous places.

Pipeline:
1. Wikidata SPARQL: items with P131* = Q2758 (MG), coords, dewiki
   article. Excludes humans (Q5) and streets (Q79007).
2. Batch-fetch wikitext (50 articles per request) via MediaWiki API.
3. Filter to articles whose text matches a strict NS-narrative regex
   (named perpetrators, Reichspogrom, arisiert, deportiert, KZ, etc.)
4. Extract the matching sentence + surrounding context as `description`.
5. Output data/raw/ns_orte_narrative.json.
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

import httpx

UA = (
    "moenchengladbach-history/0.1 "
    "(https://github.com/pgrigorov/moenchengladbach-history; pg@bgdlabs.com) httpx"
)

OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "ns_orte_narrative.json"

MG_QID = "Q2758"

# Strict narrative markers — must be substantive NS content, not just a
# date mention. "Goebbels", "Adolf Hitler", "NSDAP", etc. are all
# explicit enough. "1933" alone is not (could be any historical year),
# but "Machtergreifung 1933" is.
NS_NARRATIVE = re.compile(
    r"\b("
    r"Goebbels|Adolf\s+Hitler|NSDAP|Nationalsozialist|Nationalsozialismus|"
    r"Drittes\s+Reich|Hitlerjugend|HJ-Heim|"
    r"Reichspogrom|Reichskristall|Pogromnacht|"
    r"arisiert|Arisierung|enteignet|"
    r"deportiert|Deportation|"
    r"Konzentrationslager|KZ\s+|"
    r"Holocaust|Shoah|"
    r"Stolperstein|Stolperschwelle|"
    r"Gestapo|SA-Sturm|SS-Standort|"
    r"Hochbunker|Luftschutzbunker|"
    r"Synagoge.*?(zerstört|niedergebrannt|abgerissen)|"
    r"Zwangsarbeit|"
    r"Reichsbahn.*?Deportation|"
    r"Ehrenmal\s+der\s+SA"
    r")\b",
    re.I,
)

# Keep articles whose title or first 200 chars hint at being about a
# place (not a person, event, or organisation). Helps reduce noise.
PLACE_HINT = re.compile(
    r"\b(haus|gebäude|kirche|kapelle|schloss|burg|mühle|park|"
    r"friedhof|platz|straße|brücke|hof|villa|fabrik|bahnhof|"
    r"theater|museum|denkmal|kloster|abtei|rathaus|"
    r"stadion|hochhaus|turm|brunnen)",
    re.I,
)


def sparql_candidates() -> list[tuple[str, str, float, float]]:
    """Return (qid, dewiki title, lat, lng) for every WD item in MG with
    a coord and a German Wikipedia article, excluding humans and streets."""
    q = f"""
    SELECT ?item ?title ?lat ?lng WHERE {{
      ?item wdt:P131* wd:{MG_QID} ;
            wdt:P625 ?coord .
      ?article schema:about ?item ;
               schema:isPartOf <https://de.wikipedia.org/> ;
               schema:name ?title .
      FILTER NOT EXISTS {{ ?item wdt:P31 wd:Q5 }}
      FILTER NOT EXISTS {{ ?item wdt:P31 wd:Q79007 }}
      BIND(geof:longitude(?coord) AS ?lng)
      BIND(geof:latitude(?coord) AS ?lat)
    }}
    """
    r = httpx.get(
        "https://query.wikidata.org/sparql",
        params={"query": q},
        headers={"Accept": "application/sparql-results+json", "User-Agent": UA},
        timeout=120,
    )
    r.raise_for_status()
    out: list[tuple[str, str, float, float]] = []
    for b in r.json()["results"]["bindings"]:
        qid = b["item"]["value"].rsplit("/", 1)[-1]
        title = b["title"]["value"]
        lat = float(b["lat"]["value"])
        lng = float(b["lng"]["value"])
        out.append((qid, title, lat, lng))
    return out


def fetch_batch(titles: list[str]) -> dict[str, str]:
    """Fetch wikitext for up to 50 articles. Returns {title: wikitext}."""
    r = httpx.get(
        "https://de.wikipedia.org/w/api.php",
        params={
            "action": "query",
            "prop": "revisions",
            "rvprop": "content",
            "rvslots": "main",
            "titles": "|".join(titles),
            "format": "json",
            "formatversion": "2",
            "redirects": 1,
            "maxlag": 5,
        },
        headers={"User-Agent": UA},
        timeout=60,
    )
    r.raise_for_status()
    data = r.json()
    out: dict[str, str] = {}
    for page in data.get("query", {}).get("pages", []):
        if page.get("missing"):
            continue
        revs = page.get("revisions") or []
        if not revs:
            continue
        slot = revs[0].get("slots", {}).get("main", {})
        text = slot.get("content") or revs[0].get("*") or ""
        out[page["title"]] = text
    return out


def strip_wikitext(s: str) -> str:
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.DOTALL)
    s = re.sub(r"<ref[^/]*/\s*>", "", s)
    s = re.sub(r"&nbsp;", " ", s)
    s = re.sub(r"<br\s*/?>", " ", s)
    s = re.sub(r"'''([^']+)'''", r"\1", s)
    s = re.sub(r"''([^']+)''", r"\1", s)
    s = re.sub(r"\[\[([^|\]]+)\|([^\]]+)\]\]", r"\2", s)
    s = re.sub(r"\[\[([^\]]+)\]\]", r"\1", s)
    s = re.sub(r"\[https?://[^\s\]]+\s+([^\]]+)\]", r"\1", s)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    return re.sub(r"\s+", " ", s).strip()


def extract_excerpt(wikitext: str) -> str | None:
    """Pull the sentence(s) around the first NS-narrative match."""
    plain = strip_wikitext(wikitext)
    m = NS_NARRATIVE.search(plain)
    if not m:
        return None
    # Find sentence boundaries around the match
    start = max(0, plain.rfind(".", 0, m.start()) + 1)
    end = plain.find(".", m.end())
    if end < 0:
        end = min(len(plain), m.end() + 200)
    excerpt = plain[start:end + 1].strip()
    if len(excerpt) < 40:
        # widen
        end2 = plain.find(".", end + 1)
        if end2 > 0:
            excerpt = plain[start:end2 + 1].strip()
    return excerpt[:1000] if excerpt else None


def first_image(wikitext: str) -> str | None:
    m = re.search(r"\[\[(?:Datei|File|Bild):([^|\]]+)", wikitext, re.IGNORECASE)
    if not m:
        return None
    return m.group(1).strip().replace(" ", "_")


def categorise(excerpt: str) -> str:
    low = excerpt.lower()
    if "goebbels" in low or "hitler" in low:
        return "perpetrator_site"
    if "synagog" in low and ("zerstört" in low or "1938" in low or "pogrom" in low):
        return "destroyed_synagogue"
    if "synagog" in low:
        return "synagogue_memorial"
    if "jüdischer friedhof" in low:
        return "jewish_cemetery"
    if "bunker" in low or "luftschutz" in low or "hochbunker" in low:
        return "bunker"
    if "konzentrationsl" in low or "kz" in low:
        return "concentration_camp"
    if "zwangsarbeit" in low:
        return "forced_labor"
    if "deportier" in low or "deportation" in low:
        return "ns_victim_memorial"
    if "arisiert" in low or "arisierung" in low or "enteignet" in low:
        return "aryanization"
    if "stolperschw" in low or "stolperstein" in low:
        return "stolperschwelle"
    return "ns_memorial"


def slugify(s: str) -> str:
    s = (s or "").lower()
    table = {"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"}
    s = "".join(table.get(c, c) for c in s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-") or "x"


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    print("fetching candidates from Wikidata …", file=sys.stderr)
    cands = sparql_candidates()
    print(f"  {len(cands)} geocoded WP articles in MG", file=sys.stderr)

    by_title = {t: (q, lat, lng) for q, t, lat, lng in cands}
    titles = list(by_title.keys())

    entries: list[dict] = []
    BATCH = 30
    for i in range(0, len(titles), BATCH):
        batch = titles[i : i + BATCH]
        try:
            pages = fetch_batch(batch)
        except httpx.HTTPError as e:
            print(f"  batch {i // BATCH} failed: {e}", file=sys.stderr)
            time.sleep(2)
            continue
        for title, wikitext in pages.items():
            if not NS_NARRATIVE.search(wikitext):
                continue
            excerpt = extract_excerpt(wikitext)
            if not excerpt:
                continue

            q_lat_lng = by_title.get(title)
            if not q_lat_lng:
                continue
            qid, lat, lng = q_lat_lng

            cat = categorise(excerpt)
            image = first_image(wikitext)
            entries.append({
                "id": f"wd-{slugify(title)[:60]}",
                "name": title,
                "category": cat,
                "lat": lat,
                "lng": lng,
                "address": "",
                "description": excerpt,
                "image": image,
                "source": "wikipedia-narrative",
                "source_url": f"https://de.wikipedia.org/wiki/{title.replace(' ', '_')}",
                "wikidata": qid,
            })
        if (i // BATCH) % 5 == 0:
            print(
                f"  scanned {min(i + BATCH, len(titles))}/{len(titles)} — kept {len(entries)}",
                file=sys.stderr,
            )
        time.sleep(0.3)

    OUT.write_text(json.dumps(entries, ensure_ascii=False, indent=2))
    print(f"wrote {len(entries)} narrative-NS entries → {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
