#!/usr/bin/env python3
"""Clean up existing stolpersteine_wp.json data.

Fixes:
  - Removes HTML comments (<!-- ... -->) from all text fields
  - Extracts names from inscription text (ground truth for stone names)
  - Cleans up trailing whitespace/newlines left after comment removal
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path


def extract_name_from_inscription(insc: str) -> str:
    """Extract the person's name from the inscription text."""
    if not insc:
        return ""

    lines = insc.split('\n')
    start_idx = None
    for i, line in enumerate(lines):
        if 'Hier wohnte' in line:
            start_idx = i + 1
            break

    if start_idx is None:
        return ""

    name_lines = []
    for line in lines[start_idx:]:
        stripped = line.strip()
        if re.match(r'^(Jg\.|Geb\.|Verh\.|Gesch\.|Eingewiesen|Flucht|Deportiert|Ermordet|tot|Tot|Umzug|Heirat|Schicksal|Polenaktion)', stripped, re.IGNORECASE):
            break
        if not stripped:
            continue
        name_lines.append(stripped)

    if not name_lines:
        return ""

    full_name = ' '.join(name_lines)
    full_name = re.sub(r"'''", '', full_name)
    full_name = re.sub(r"`([^`]*?)´", r'„\1"', full_name)
    full_name = re.sub(r"`([^`]*?)'", r'„\1"', full_name)
    return full_name.strip()


def clean_text(text: str, *, preserve_breaks: bool = True) -> str:
    """Remove HTML comments and collapse excess whitespace."""
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
    if preserve_breaks:
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()
    return re.sub(r"\s+", " ", text).strip()


def main() -> None:
    src = Path(__file__).resolve().parent.parent / "data" / "raw" / "stolpersteine_wp.json"
    if not src.exists():
        print(f"{src} not found", file=sys.stderr)
        sys.exit(1)

    data = json.loads(src.read_text())
    cleaned = 0
    names_fixed = 0

    for entry in data:
        # Clean text fields
        for field in ("bio", "inscription", "address"):
            old = str(entry.get(field, ""))
            new = clean_text(old)
            if new != old:
                entry[field] = new
                cleaned += 1

        # Extract name from inscription (ground truth)
        insc = str(entry.get("inscription", ""))
        new_name = extract_name_from_inscription(insc)
        if new_name and new_name != entry.get("name", ""):
            entry["name"] = new_name
            names_fixed += 1

    src.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"Cleaned {cleaned} text fields, fixed {names_fixed} names → {src}")


if __name__ == "__main__":
    main()
