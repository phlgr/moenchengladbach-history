#!/usr/bin/env python3
"""Fetch Stolperstein biographies from the 4 Wikipedia district list pages.

Output: data/raw/stolpersteine_wp.json — flat list of entries with:
  id, name, address, lat, lng, install_date, inscription, image, bio_html, district, source_url

Wikitext model:
- Each row group starts with `|- id="<key>"`.
- The first row of an address has a rowspan address cell containing a
  {{Coordinate}} template (lat/lng).
- Following rows in the same address group inherit the address+coords.
- Each row also contributes: inscription (centered text cell), image (Datei:),
  and bio (last cell).

The parser is regex-based on the raw wikitext rather than mwparserfromhell
because the table is hand-formatted and cell boundaries don't always
line up with template boundaries.
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

import httpx

from _common import UA, strip_wikitext as _strip_wikitext

PAGES = [
    ("nord", "Liste der Stolpersteine in Mönchengladbach – Stadtbezirk Nord"),
    ("ost",  "Liste der Stolpersteine in Mönchengladbach – Stadtbezirk Ost"),
    ("sued", "Liste der Stolpersteine in Mönchengladbach – Stadtbezirk Süd"),
    ("west", "Liste der Stolpersteine in Mönchengladbach – Stadtbezirk West"),
]

OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "stolpersteine_wp.json"


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


COORD_RE = re.compile(
    r"\{\{Coordinate\s*\|[^}]*?NS\s*=\s*([0-9.\-]+)[^}]*?EW\s*=\s*([0-9.\-]+)",
    re.IGNORECASE | re.DOTALL,
)
DATE_RE = re.compile(r"\{\{DatumZelle\|(\d{4}-\d{2}-\d{2})")
IMAGE_RE = re.compile(r"\[\[Datei:([^|\]]+)", re.IGNORECASE)
ROW_START_RE = re.compile(r'^\|-\s*(?:id="([^"]*)")?', re.MULTILINE)


def strip_wikitext(s: str) -> str:
    return _strip_wikitext(s, preserve_breaks=True)


def split_rows(table_block: str) -> list[tuple[str | None, str]]:
    """Yield (row_id, row_body) tuples from a wikitable block.

    A row_body is everything from the `|-` line until the next `|-` (or end).
    """
    rows: list[tuple[str | None, str]] = []
    matches = list(ROW_START_RE.finditer(table_block))
    for i, m in enumerate(matches):
        row_id = m.group(1)
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(table_block)
        rows.append((row_id, table_block[start:end]))
    return rows


def split_cells(row_body: str) -> list[str]:
    """Split a wikitable row body into cell contents.

    Cells are introduced by `|` at the start of a line; we ignore `!` headers.
    Coordinate templates contain `|` so we balance braces while scanning.
    """
    text = row_body.strip()
    cells: list[str] = []
    current: list[str] = []
    in_cell = False
    depth = 0  # nesting depth of {{ }} and [[ ]] and { | }
    i = 0
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        # detect template/link nesting
        if ch == "{" and nxt == "{":
            depth += 1
            current.append("{{")
            i += 2
            continue
        if ch == "}" and nxt == "}":
            depth = max(0, depth - 1)
            current.append("}}")
            i += 2
            continue
        if ch == "[" and nxt == "[":
            depth += 1
            current.append("[[")
            i += 2
            continue
        if ch == "]" and nxt == "]":
            depth = max(0, depth - 1)
            current.append("]]")
            i += 2
            continue
        # cell separator only at start of line or after `||`
        if depth == 0 and (ch == "\n" or not in_cell):
            # New line: check for cell start
            line_start = ch == "\n" or i == 0
            if line_start:
                # peek next non-newline character
                j = i
                if ch == "\n":
                    j = i + 1
                if j < len(text) and text[j] == "|":
                    # close current cell
                    if in_cell:
                        cells.append("".join(current).strip())
                        current = []
                    in_cell = True
                    # skip past the leading `|`
                    skip = j + 1
                    # also skip cell attributes like `style="..."| ` or `rowspan="N"|`
                    # if the cell line contains a `|` before any `[[` or `{{` pattern.
                    # We just advance past the first `|` and let attribute prefixes
                    # be cleaned up later.
                    i = skip
                    continue
        current.append(ch)
        i += 1
    if in_cell:
        cells.append("".join(current).strip())
    return cells


CELL_ATTR_RE = re.compile(r'^[^|{\[]*?\|\s*', re.DOTALL)


def clean_cell(cell: str) -> str:
    """Strip leading cell attributes like `style="..."| ` / `rowspan="N"| `."""
    # Only strip if there's an attribute-style `|` near the start (not inside templates)
    m = CELL_ATTR_RE.match(cell)
    if m and "{{" not in m.group(0) and "[[" not in m.group(0):
        return cell[m.end():]
    return cell


def parse_page(district: str, title: str, wikitext: str) -> list[dict]:
    # narrow to the table containing the entries
    # the table starts with `{| class="wikitable sortable"` (or similar) after `== Verlegte Stolpersteine ==`
    sec = re.split(r"==\s*Verlegte Stolpersteine\s*==", wikitext, maxsplit=1)
    if len(sec) < 2:
        sec = re.split(r"==\s*Stolpersteine\s*==", wikitext, maxsplit=1)
    if len(sec) < 2:
        print(f"  ! no Verlegte Stolpersteine section in {title}", file=sys.stderr)
        return []
    body = sec[1]
    # take from first `{|` through matching `|}` (greedy, then trim at next `==`)
    tbl_start = body.find("{|")
    if tbl_start < 0:
        return []
    body = body[tbl_start:]
    tbl_end = body.find("\n|}")
    if tbl_end > 0:
        body = body[: tbl_end + 3]
    # also trim if a new section appears
    next_sec = body.find("\n== ")
    if next_sec > 0:
        body = body[:next_sec]

    entries: list[dict] = []
    cur_address: str | None = None
    cur_lat: float | None = None
    cur_lng: float | None = None
    cur_date: str | None = None

    for row_id, row in split_rows(body):
        if row_id is None:
            continue  # header `|-` without id
        cells = [clean_cell(c) for c in split_cells(row)]
        # Identify which cells are address / date / inscription / image / bio.
        # Strategy: if any cell contains a {{Coordinate}}, that cell is the address.
        # If any cell contains a {{DatumZelle}}, that cell is the install date.
        # Image cell contains [[Datei:...]] (and probably nothing else of value).
        # Inscription cell typically contains "Hier wohnte" or similar bold text.
        # Bio cell is usually the longest free-text cell.
        addr_cell = next((c for c in cells if "{{Coordinate" in c), None)
        date_cell = next((c for c in cells if "{{DatumZelle" in c), None)
        img_cell = next((c for c in cells if "[[Datei:" in c or "[[File:" in c), None)
        inscr_cell = next(
            (c for c in cells if "Hier" in c and "wohnte" in c and c is not addr_cell),
            None,
        )
        # bio: largest remaining cell
        bio_candidates = [
            c for c in cells if c not in {addr_cell, date_cell, img_cell, inscr_cell}
        ]
        bio_cell = max(bio_candidates, key=len, default=None)

        if addr_cell:
            m = COORD_RE.search(addr_cell)
            if m:
                cur_lat = float(m.group(1))
                cur_lng = float(m.group(2))
            # address text = everything before the {{Coordinate}}
            addr_text = re.sub(r"\{\{Coordinate.*?\}\}", "", addr_cell, flags=re.DOTALL)
            cur_address = strip_wikitext(addr_text).strip()
        if date_cell:
            m = DATE_RE.search(date_cell)
            if m:
                cur_date = m.group(1)

        if not inscr_cell:
            continue  # likely a header or malformed row
        if cur_lat is None or cur_lng is None:
            continue  # entry without coords — skip for the prototype

        image = None
        if img_cell:
            m = IMAGE_RE.search(img_cell)
            if m:
                image = m.group(1).strip().replace(" ", "_")

        name = (row_id or "").strip().replace("_", " ")
        inscription = strip_wikitext(inscr_cell)
        bio_text = strip_wikitext(bio_cell) if bio_cell else ""

        entries.append({
            "id": f"{district}-{re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-') or f'row-{len(entries)}'}",
            "name": name,
            "address": cur_address,
            "lat": cur_lat,
            "lng": cur_lng,
            "install_date": cur_date,
            "inscription": inscription,
            "image": image,
            "bio": bio_text,
            "district": district,
            "source_url": f"https://de.wikipedia.org/wiki/{title.replace(' ', '_')}",
        })

    return entries


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    all_entries: list[dict] = []
    for district, title in PAGES:
        print(f"fetching {district}: {title}", file=sys.stderr)
        wikitext = fetch_wikitext(title)
        entries = parse_page(district, title, wikitext)
        print(f"  parsed {len(entries)} entries", file=sys.stderr)
        all_entries.extend(entries)
        time.sleep(0.5)
    OUT.write_text(json.dumps(all_entries, ensure_ascii=False, indent=2))
    print(f"wrote {len(all_entries)} total → {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
