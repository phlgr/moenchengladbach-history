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
