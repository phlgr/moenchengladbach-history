# Mönchengladbach History

Interactive map of Mönchengladbach 1933–1945 — Stolpersteine, NS-era sites, perpetrator biographies, renamed streets, and the deportation network of the city's Jewish population. Open data only (Wikipedia CC BY-SA, OSM ODbL, Wikidata CC0).

See [PLAN.md](./PLAN.md) for the full design and roadmap.

## Stack

- **Data**: Python (`uv`, `httpx`, `mwparserfromhell`) — fetches Wikipedia, OSM (Overpass), and Wikidata via official APIs.
- **App**: TanStack Start on Bun, MapLibre GL, Tailwind v4. Static prerender → GitHub Pages.
- **Quality gates**: biome (lint+format), tsc, knip — wired through lefthook pre-commit.

## Layers

| Group | Layer | Source |
|-------|-------|--------|
| Stolpersteine | Stolpersteine | de-WP list pages + OSM cross-validation |
| NS-Orte | Synagogen, Jüdische Friedhöfe, Bunker, Stolperschwellen, Zwangsarbeit & Lager, Tätergeschichte, NS-Straßennamen, Gedenkorte | OSM `historic=*` + WP narrative articles + curated overrides |

Plus a **deportation mode** that animates lines from MG to ghettos and camps (Riga, Izbica, Auschwitz, Theresienstadt, …) and a **timeline (1933–1945)** that filters POIs by their earliest documented persecution date.

## Setup

Uses [mise](https://mise.jdx.dev/) for tool versions (`bun`, `node`, `python`, `uv`):

```bash
mise install
uv sync                  # python deps
cd app && bun install
```

## Run

```bash
cd app && bun run dev    # http://localhost:5173
```

`bun run dev` runs the data build (`scripts/build_geojson.py` + `scripts/build_deportations.py`) before starting Vite, so the map always has fresh data.

## Refresh data from Wikipedia / OSM / Wikidata

One-shot: re-run every fetcher, then rebuild the GeoJSON.

```bash
cd app && bun run fetch:all
cd app && bun run build:data
```

Individual fetchers (idempotent, all live under `fetchers/`):

```bash
uv run python3 fetchers/wp_stolpersteine.py        # Wikipedia Stolperstein lists
uv run python3 fetchers/wp_baudenkmaeler.py        # Wikipedia Baudenkmäler lists
uv run python3 fetchers/wp_narrative_ns.py         # NS narrative articles
uv run python3 fetchers/wp_auto_curated.py         # WP cross-references for curated entries
uv run python3 fetchers/osm_ns.py                  # OSM historic=* in MG
uv run python3 fetchers/osm_wikipedia.py           # OSM features tagged with wikipedia=*
uv run python3 fetchers/wikidata_ns_persons.py     # Wikidata bios for perpetrators / namesakes
```

Outputs land in `data/raw/` (gitignored). The build scripts read from `data/raw/` + `overrides/` and write to `app/public/data/`.

## Layout

```
fetchers/      # one script per data source (WP, OSM, Wikidata) + _common.py
data/raw/      # fetcher output (gitignored)
overrides/     # hand-curated entries — committed
  ns_orte/curated.json
  renamed_streets/curated.json
scripts/       # data build pipeline (build_geojson.py, build_deportations.py)
app/           # TanStack Start web app
  src/components/   MapView, Sidebar, LayerToggle, DeportationToggle, Timeline
  src/lib/          themes, layerState, mapStyle, useReducedMotion
  public/data/      built GeoJSON (gitignored) + per-POI content JSON
  public/map-assets/  basemap.pmtiles, sprites, fonts (committed)
```

## Quality checks

Run on every commit via `lefthook.yml`:

```bash
cd app && bun run lint       # biome
cd app && bun run format     # biome --write
cd app && bun run typecheck  # tsc --noEmit
cd app && bun run knip       # unused exports / files
```

## Map assets (basemap.pmtiles, sprites, fonts)

Committed to the repo so the app works without extra downloads. To rebuild:

**Basemap pmtiles** — extracts a tight Mönchengladbach city layer (z=8–14) and a European overview for the deportation cinematic (z=0–7), then merges them into a single ~38 MB archive:

```bash
# Install pmtiles CLI (Linux x86_64):
curl -sL https://github.com/protomaps/go-pmtiles/releases/latest/download/go-pmtiles_*_Linux_x86_64.tar.gz | tar -xz -C ~/.local/bin
export PATH="$HOME/.local/bin:$PATH"

SRC_URL=https://demo-bucket.protomaps.com/v4.pmtiles
TMP=$(mktemp -d) && \
pmtiles extract "$SRC_URL" "$TMP/mg.pmtiles" --bbox="6.30,51.05,6.65,51.32" --minzoom=8 --maxzoom=14 && \
pmtiles extract "$SRC_URL" "$TMP/eu.pmtiles" --bbox="-2,44,32,60" --minzoom=0 --maxzoom=7 && \
pmtiles merge "$TMP/eu.pmtiles" "$TMP/mg.pmtiles" app/public/map-assets/basemap.pmtiles && \
rm -rf "$TMP"
```

**Sprites & fonts** — downloads Protomaps basemaps assets (light sprites + Noto Sans glyph PBFs):

```bash
curl -sL https://codeload.github.com/protomaps/basemaps-assets/tar.gz/refs/heads/main \
  | tar -xzf - -C /tmp && \
  SRC=/tmp/basemaps-assets-main DEST=app/public/map-assets && \
  mkdir -p "$DEST/sprites/v4" "$DEST/fonts" && \
  cp "$SRC/sprites/v4/light"{.json,.png,@2x.json,@2x.png} "$DEST/sprites/v4/" && \
  cp -r "$SRC/fonts/Noto Sans "{Regular,Italic,Medium} "$DEST/fonts/"
```
