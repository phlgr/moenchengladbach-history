"""Shared helpers for the fetcher scripts.

Each fetcher previously redefined `UA`, `slugify`, and `strip_wikitext`;
this module is the single source of truth. Imported as `_common` (the
leading underscore signals it isn't itself an entry-point script).

When a fetcher is run via `python3 fetchers/<name>.py`, Python prepends
the script's directory to `sys.path`, so `from _common import ...` just
works without any path manipulation.
"""
from __future__ import annotations

import re

UA = (
    "moenchengladbach-history/0.1 "
    "(https://github.com/pgrigorov/moenchengladbach-history; pg@bgdlabs.com) httpx"
)


def slugify(s: str) -> str:
    s = (s or "").lower()
    table = {"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"}
    s = "".join(table.get(c, c) for c in s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-") or "x"


def strip_wikitext(s: str, *, preserve_breaks: bool = False) -> str:
    """Strip wikitext markup to readable plain text.

    With `preserve_breaks=True`, `<br>` becomes a newline and the output
    keeps line structure (used for biographies that render as paragraphs).
    Otherwise all whitespace collapses to single spaces.
    """
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.DOTALL)
    s = re.sub(r"<ref[^>]*/\s*>", "", s)
    s = re.sub(r"&nbsp;", " ", s)
    s = re.sub(r"<br\s*/?>", "\n" if preserve_breaks else " ", s)
    s = re.sub(r"'''([^']+)'''", r"\1", s)
    s = re.sub(r"''([^']+)''", r"\1", s)
    s = re.sub(r"\[\[([^|\]]+)\|([^\]]+)\]\]", r"\2", s)
    s = re.sub(r"\[\[([^\]]+)\]\]", r"\1", s)
    s = re.sub(r"\[https?://[^\s\]]+\s+([^\]]+)\]", r"\1", s)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    # Remove HTML comments (leak from Wikipedia table formatting)
    s = re.sub(r"<!--.*?-->", "", s, flags=re.DOTALL)
    if preserve_breaks:
        return s.strip()
    return re.sub(r"\s+", " ", s).strip()
