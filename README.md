# Mönchengladbach History

Interactive map of Mönchengladbach's history — Stolpersteine first, more layers to follow. Open data only (Wikipedia CC BY-SA, OSM ODbL).

See [PLAN.md](./PLAN.md) for the design and roadmap.

## Stack

- **Data**: Python (`uv`, `httpx`, `mwparserfromhell`) — fetches Wikipedia + OSM via official APIs.
- **App**: TanStack Start on Bun, MapLibre GL, Tailwind v4. Static prerender → GitHub Pages.

## Setup

Uses [mise](https://mise.jdx.dev/) for tool versions:

```bash
mise install        # bun, node, python, uv
uv sync             # python deps
cd app && bun install
```

## Run

```bash
cd app && bun run dev    # http://localhost:5173
```

`bun run dev` runs the data build (`scripts/build_geojson.py`) before starting Vite, so the map always has fresh data.

## Refresh data from Wikipedia / OSM

```bash
uv run python3 fetchers/wp_stolpersteine.py     # → data/raw/stolpersteine_wp.json
uv run python3 scripts/build_geojson.py         # → app/public/data/
```

## Layout

```
fetchers/      # one script per data source (Wikipedia, OSM, Wikidata)
data/raw/      # fetcher output (gitignored)
overrides/     # hand-curated entries (committed)
scripts/       # data build pipeline
app/           # TanStack Start web app
```

## Map assets (basemap.pmtiles, sprites, fonts)

These files are committed to the repo so the app works without extra downloads. To rebuild them:

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
