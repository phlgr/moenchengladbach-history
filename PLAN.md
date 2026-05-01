# Mönchengladbach History — Plan

A static, open-data-driven web map for exploring the history of Mönchengladbach. Inspired by [history.jonas-strassel.de](https://history.jonas-strassel.de) ([source](https://github.com/boredland/frankfurt-history)), but with one structural difference: Frankfurt is built on a single curated dataset (the *Frankfurt History* app from Historisches Museum Frankfurt). **No equivalent dataset exists for Mönchengladbach**, so this project aggregates multiple open sources into thematic layers.

## Goal

A static, deep-linkable, bilingual (DE/EN) map of Mönchengladbach with toggleable thematic layers. Same UX targets as the Frankfurt project: clustered POIs, slide-over article panel, walking navigation, image galleries, TTS, archival visual style.

---

## Data Sources

All counts below are **measured live** (Overpass + Wikipedia, 2026-04-30) unless marked as estimate.

Sources are split into two tiers based on access path. Tier 1 fetches via official APIs under explicit open licenses — that's the launch corpus. Tier 2 needs a contact, a license clarification, or print-source transcription — pursued in later phases.

### Tier 1 — Safe to fetch now (public APIs, open licenses)

| # | Theme | Source | Access | License | Count |
|---|-------|--------|--------|---------|-------|
| 1 | **Stolpersteine (geo)** | OSM `memorial:type=stolperstein` | Overpass API | ODbL | **156 nodes** in MG admin area |
| 2 | **Stolpersteine (biographies)** | de-WP `Liste der Stolpersteine in Mönchengladbach` — 4 sub-pages. Per row: image, name, address, GPS, inscription, install date, biography | MediaWiki API → wikitext → `mwparserfromhell` | CC BY-SA 4.0 | **~209**: Nord 79 · Süd ~70 · West 47 · Ost 13 |
| 3 | **Stolperstein photos** | Wikimedia Commons, `Category:Stolpersteine in Mönchengladbach` | Commons MediaWiki API + `upload.wikimedia.org` | per-image, mostly CC BY-SA | ≈1 image per WP entry |
| 4 | **Baudenkmäler** | de-WP `Liste der Baudenkmäler in Mönchengladbach` — 7 alphabetical sub-pages; image, address, monument-list ID, description, GPS | MediaWiki API + `mwparserfromhell` | CC BY-SA 4.0 | **~1000** (as of 2021) |
| 5 | **OSM `historic=*`** in MG (memorials, monuments, ruins, plaques, …) | Overpass API | OSM JSON | ODbL | **350 features** (280 nodes / 53 ways / 17 relations); 236 are memorials/bunkers/monuments |
| 6 | **Destroyed synagogues** (1938) | de-WP `Liste der … zerstörten Synagogen` | MediaWiki API | CC BY-SA 4.0 | **4** — Alt-Mönchengladbach, Rheydt, Odenkirchen, Wickrathberg |
| 7 | **Hochbunker / Luftschutzbunker** (NS-era) | de-WP standalone articles (Lürrip, Broich) + Baudenkmäler list cross-ref | MediaWiki API | CC BY-SA 4.0 | **2** with full WP articles; more entries via Baudenkmäler list |
| 8 | **Streets (geometry + names)** | OSM `highway=*` ways within `relation/62410` | Overpass API | ODbL | **~1820** streets |
| 9 | **Streets named after persons** | Wikidata: `?s wdt:P31 wd:Q79007 ; wdt:P131* wd:Q3290 ; wdt:P138 ?person` | SPARQL endpoint | CC0 | **sparse** — only 11 MG street articles in de-WP. Treat as seed, not source of truth |
| 10 | **Street etymology (gap-fill)** | OSM `name:etymology:wikidata` tag | Overpass API | ODbL | sparse; enrichable via `overrides/` |
| 11 | **NRW geo basemaps** | [GEOportal.NRW](https://www.geoportal.nrw/) — orthophotos, ALKIS addresses, district boundaries | WMS/WFS | Open NRW | stable |
| 12 | **MG / NRW open data** | [moenchengladbach.de/.../open-data](https://www.moenchengladbach.de/de/aktuell-aktiv/open-data/open-data-geodaten) · [open.nrw](https://open.nrw/suche) · [govdata.de](https://www.govdata.de/) | direct download | DL-DE / CC-BY | early-stage portal — recheck for Denkmalliste, historic photos, district boundaries |
| 13 | **PMTiles basemap** | Protomaps daily build, `pmtiles extract` for MG bbox | binary download | ODbL (OSM) | single 30–50 MB file |

### Tier 2 — Pursue later (license unclear, no API, or print-only)

| # | Theme | Source | Blocker | Action |
|---|-------|--------|---------|--------|
| A | **Jewish Places** — synagogues, businesses, residences, individuals; nationally ~8500 entries (incl. MG) | [jewish-places.de](https://www.jewish-places.de/) (Stiftung Jüdisches Museum Berlin) | Anubis-protected, no public API/CSV | **Email** `info@jewish-places.de` requesting an MG data export for educational reuse |
| B | **Geraubte Orte** (Aryanization sites — Jewish businesses, homes, institutions) | Stadtarchiv MG 1989 exhibition catalog *"Sie waren und sind unsere Nachbarn — Spuren jüdischen Lebens in Mönchengladbach"* | Print only | Acquire via interlibrary loan or the *Stadtarchiv*; transcribe ~40–80 addresses into `overrides/` |
| C | **KuLaDig** — LVR cultural-landscape entries with coordinates | [kuladig.de](https://www.kuladig.de/) | Bulk export unclear; images CC-BY-NC-SA 3.0 | Email LVR; meanwhile link out per-POI |
| D | **juedischer-niederrhein.de** — niche regional site with concrete MG addresses (Abteiberg 4, Albertusstr. 54, Blücherstr., Hügelstr., Laurenziusstr., Adenauerplatz) | No license stated | Use as research lead only; **link out**, do not redistribute text |
| E | **NS-Zwangsarbeit Lagerdatenbank** (forced-labor camps) | [ns-zwangsarbeit.de](https://www.ns-zwangsarbeit.de/recherche/lagerdatenbank) (Berlin) | UI-only, no API/CSV; 207 result pages nationwide | Link out from a single overview POI; revisit if a contact opens |
| F | **Bundesarchiv** — Reichswirtschafts-/Reichsfinanzministerium Arisierungsakten | [bundesarchiv.de](https://www.bundesarchiv.de/) | Physical archive, by request | Out of scope for v1 |
| G | **Stadtarchiv historic photos** — for the "before/after" slider | Stadtarchiv Mönchengladbach | Partnership required | Phase 5 stretch goal |
| H | **bunker-nrw.de forum threads** — additional bunker entries beyond WP | UGC forum | Don't scrape | Manually copy any verifiable entries into `overrides/ns-orte/` with attribution |

### Realistic launch corpus (Tier 1 only)
- **~209 Stolpersteine** — biography + photo + GPS, anchor layer
- **+ 4 destroyed synagogues** — manual overrides seeded from WP
- **+ 2 bunkers** with full WP articles, more from Baudenkmäler
- **+ Joseph Goebbels' birthplace, Rheydt** — well-documented POI
- **+ ~1000 Baudenkmäler** — auto-imported in Phase 2
- **= ~225 NS-era POIs and ~1000 Baudenkmäler at launch**, all under CC BY-SA / ODbL

### Reconciliation gap
**156 OSM nodes** vs **~209 Wikipedia rows** for Stolpersteine ⇒ ~50 stones documented on WP but not yet mapped in OSM. Mappable opportunity, not a blocker — Phase 1 launches with WP as source of truth (it has GPS), OSM is used to cross-validate coordinates where both exist.

### Sources we deliberately skip

- Commercial street directories (meinestadt.de, strassen-in-deutschland.de) — scraping ToS unclear.
- Frankfurt-history's API source (Frankfurt-only).
- bunker-nrw.de forum bulk-scraping (UGC, no license).

---

## Layers (thematic categories)

| Layer | At-launch count | Auto / curated | Tier |
|-------|----------------:|----------------|------|
| **Stolpersteine** — merge OSM coords with Wikipedia biographies | ~209 | auto | 1 |
| **Baudenkmäler** — listed buildings with NRW Denkmalliste ID | ~1000 | auto (parse-once) | 1 |
| **NS-Orte** — synagogues, bunkers, forced-labor markers, Goebbels' Rheydt; victims/perpetrators that aren't Stolpersteine | ~15–25 | curated, seeded from WP | 1 |
| **Geraubte Orte** — Aryanization sites (Jewish businesses, residences, institutions taken over 1933–1939) | 0 at launch → ~40–80 | curated, depends on Tier 2 sources | **2** |
| **Straßennamen** — streets named after a person, biography from Wikidata + curation | ~10 from Wikidata, growing | mostly curated | 1 |
| **Industrial heritage** — textile mills, Schloss Rheydt, etc. (MG was a textile city) | ~30–50 (subset of Baudenkmäler) | semi-auto | 1 |
| **Vor/Nach** *(stretch)* — georeferenced historical photos for before/after slider | 0 at launch | curated, depends on Stadtarchiv | **2** |

**NS-Orte** and **Geraubte Orte** are deliberately split. Same era, different evidence base: NS-Orte are physical structures (synagogues, bunkers) covered by Wikipedia and OSM under open licenses today. Geraubte Orte are the addresses of Aryanization — there is no open dataset; the corpus has to be built by hand from print sources and contacts in Phase 3+.

---

## Architecture

Mirrors the Frankfurt project's pipeline (data + overrides → merged content → GeoJSON + per-POI markdown), but **the `archive.py` step is replaced by per-source fetchers** because there is no single API.

```
fetchers/                          ← one script per source, all idempotent
├── osm_stolpersteine.py           ← Overpass query, area=Mönchengladbach, memorial:type=stolperstein
├── osm_streets.py                 ← Overpass: highway ways + name:etymology:wikidata
├── wp_stolpersteine.py            ← parse the 4 Wikipedia list tables (mwparserfromhell)
├── wp_baudenkmaeler.py            ← parse the 7 alphabetical list tables
├── wikidata_streets.py            ← SPARQL: streets in MG with P138 (named after)
├── wikidata_persons.py            ← for each P138 target, fetch person bio (DOB, occupation, sitelinks)
└── commons_images.py              ← per Stolperstein/Denkmal, fetch image URL + license

data/                              ← raw output from fetchers (gitignored — re-fetchable)
├── stolpersteine/{osm,wp}.json
├── baudenkmaeler/wp.json
├── streets/{osm,wikidata}.json
└── images_raw/                    ← originals downloaded from Commons (gitignored)

overrides/                         ← hand-curated, committed to git, NEVER touched by fetchers
├── stolpersteine/<id>.md          ← partial overrides per entry
├── strassen/<slug>.md             ← bios for streets not in Wikidata
├── ns-orte/<slug>.md              ← synagogues, bunkers, Goebbels' Rheydt — Tier 1 seeded
└── geraubte-orte/<slug>.md        ← Aryanization sites — Tier 2, manual research only

content/                           ← built by merge.py: per-locale, per-theme markdown
├── de/
│   ├── stolpersteine/<id>.md      ← frontmatter (lat, lng, address, dob, dod, image, refs) + body
│   ├── baudenkmaeler/<id>.md
│   └── strassen/<slug>.md
└── en/                            ← English translations (fewer; fall back to DE)

public/
├── data/
│   ├── stolpersteine.geojson      ← built by geojson.py
│   ├── baudenkmaeler.geojson
│   ├── strassen.geojson           ← LineString features, not points
│   └── routes/                    ← optional ORS pre-cache
├── images/                        ← committed: 600px webp thumbs, ~80 KB each
└── moenchengladbach.pmtiles       ← committed: ~30–50 MB self-hosted basemap

scripts/
├── merge.py                       ← deep-merge data/ + overrides/ → content/
├── geojson.py                     ← content → GeoJSON (one per theme); points + lines
├── reconcile.py                   ← match OSM Stolperstein nodes to WP biography rows by address+name
├── images.py                      ← download from Commons, resize to 600px webp, write to public/images/
├── precache_routes.py             ← optional ORS walking routes
└── translate.py                   ← optional: DeepL/LibreTranslate for missing en/ files
```

### Tech stack (adjusted from Frankfurt)

Same framework as upstream — only hosting and image storage change.

| Concern | Choice | Note vs Frankfurt |
|---------|--------|-------------------|
| Framework | **TanStack Start** on **Bun** | unchanged — configure Nitro `preset: 'static'` so the build emits plain HTML/JS/CSS for GitHub Pages |
| Map | **MapLibre GL JS** via `react-map-gl` | unchanged |
| Tiles | **Self-hosted PMTiles**, committed to `public/` | unchanged — the file ships in the repo |
| Routing (walking) | **OpenRouteService**, pre-cached at build | unchanged |
| TTS | **Web Speech API** | unchanged |
| Styling | **Tailwind v4** | unchanged |
| **Hosting** | **GitHub Pages** | swapped from Cloudflare Pages |
| **Images** | **committed to repo** (resized webp) | swapped from R2 — see Image strategy below |
| Build | **GitHub Actions** — weekly cron rebuilds the data, on-push deploys the site | unchanged in spirit |

### Image strategy (downloaded, not hotlinked)

Commons asks projects not to hotlink at scale, GitHub Pages has no signed-URL story, and we want the site to render even if Commons is rate-limiting. So:

1. `scripts/images.py` reads each merged content entry, downloads the Commons original to `data/images_raw/` (gitignored, cached by hash).
2. Resizes to **600 px webp at q≈80** (~50–100 KB) into `public/images/<theme>/<id>.webp` — **committed to git**.
3. Writes per-image attribution (author, license, source URL) into the entry's frontmatter so the UI can display credits.
4. **Lightbox** loads the **original from Commons** lazily (`upload.wikimedia.org/...`) only when the user opens it — that's a single request per click, well within fair use, and keeps the repo small.

Storage budget for GitHub Pages (1 GB soft cap on repo and on Pages site):

| Asset | Count | Size each | Total |
|-------|------:|----------:|------:|
| Stolperstein thumbs | ~209 | ~80 KB | ~17 MB |
| Baudenkmal thumbs | ~700 (those with images) | ~80 KB | ~55 MB |
| NS-Geschichte / streets / misc | ~50 | ~80 KB | ~4 MB |
| PMTiles basemap (MG bbox) | 1 | 30–50 MB | ~40 MB |
| GeoJSON + content JSON | — | — | ~5 MB |
| **Total static payload** | | | **~120 MB** |

Comfortably under the 1 GB soft limit, and well under 100 GB/mo bandwidth even with thousands of visitors. If we ever exceed it, the escape hatch is moving images to a sibling `mg-history-images` repo as a release asset (10 GB / file) or to a Cloudflare R2 bucket as a drop-in.

### Reconciliation (the new hard problem)

OSM nodes and Wikipedia rows describe the same Stolpersteine but live in two trees. `reconcile.py` matches them on `(address, name)` with fuzzy name comparison (Levenshtein on family + given) and falls back to nearest-neighbor in geo if address normalization fails. Output: a single merged record per stone with OSM-derived coords (more reliable) and WP-derived biography. Unmatched entries go to a review file.

The same approach extends to streets: Wikidata items vs OSM ways matched on canonical name.

---

## Visual & UX

Inherit the "archival cartography" direction from Frankfurt: warm paper background, sepia accents, Libre Baskerville headings, custom PMTiles theme. **One adjustment:** Mönchengladbach's bounding box and center.

| Setting | Value |
|---------|-------|
| Center | 51.196, 6.444 |
| Bounds | 6.30, 51.10 → 6.60, 51.30 (approx) |
| PMTiles extract | `--bbox=6.3,51.1,6.6,51.3 --maxzoom=15` (~30–50 MB) |
| OSM relation ID | 62410 |

Streets-as-lines is new vs Frankfurt (which is points-only): the named-streets layer uses MapLibre line styling with hover-highlight and a click target along the line.

---

## Build & deploy

**GitHub Pages, fully static.** Two GitHub Actions workflows:

1. **`data.yml`** — weekly cron + manual dispatch.
   - Runs all `fetchers/`, then `merge.py` → `geojson.py` → `images.py`.
   - Opens a PR with the regenerated `content/`, `public/data/`, and `public/images/` (so humans review changes — Wikipedia tables drift).
   - Read-only against public APIs, respects rate limits (Overpass: chunk by category; Wikipedia: `maxlag`; Wikidata: 5 r/s; Commons: 1 r/s with `User-Agent`).

2. **`deploy.yml`** — on push to `main`.
    - `bun install && bun run build`.
    - Publishes `dist/` to the `gh-pages` branch via `actions/deploy-pages`.

DNS: a custom domain (`mg-history.de` or similar) via `CNAME` in `public/`. HTTPS auto-provisioned by Pages.

---

## Phasing

**Phase 1–2 use Tier 1 sources only — no contacts needed, fully automatable.** Phase 3 onwards depends on Tier 2 access.

1. **Phase 1 — Stolpersteine only** (~1–2 weeks). MediaWiki API on the 4 WP list pages → ~209 entries with bios, GPS, photos. Reconcile against 156 OSM nodes. Single-layer MapLibre map on GitHub Pages with article panel, lightbox, share. **End state: usable, deployable site.**
2. **Phase 2 — Baudenkmäler + NS-Orte** (~1–2 weeks). Parse the 7 alphabetical Baudenkmäler pages → ~1000 entries. Add the curated NS-Orte layer (4 synagogues + bunkers + Goebbes-Rheydt). Pipeline validated at 5× volume.
3. **Phase 3 — Streets named after persons** (ongoing). Wikidata seed + heavy `overrides/` curation. Streets rendered as lines on the map.
4. **Phase 4 — Geraubte Orte** (Tier 2, opens when prerequisites land). Two parallel tracks:
   - **4a — Jewish Places dump**: depends on response from `info@jewish-places.de`. If granted, builds a fetcher `fetchers/jewish_places.py`.
   - **4b — Stadtarchiv catalog transcription**: depends on acquiring *"Sie waren und sind unsere Nachbarn"* (1989). Manual transcription into `overrides/geraubte-orte/`. Realistic corpus 40–80 entries.
5. **Phase 5 — Before/after photos** (stretch). Depends on Stadtarchiv photo cooperation.

---

## Concrete to-dos (Tier 2 unblockers)

These don't block Phase 1–2. File them now so they unblock Phase 4 in parallel with engineering work.

- [ ] **Email Jewish Places** — `info@jewish-places.de`, Stiftung Jüdisches Museum Berlin. Request: data export of MG-area entries for educational reuse, or confirmation that the underlying Wikidata items are SPARQL-queryable for the same set.
- [ ] **Acquire Stadtarchiv catalog** — *"Sie waren und sind unsere Nachbarn — Spuren jüdischen Lebens in Mönchengladbach"* (Stadtarchiv Mönchengladbach, 1989). Interlibrary loan or direct request to Stadtarchiv.
- [ ] **Email LVR / KuLaDig** — ask whether KuLaDig data for MG is available as CSV/RDF for educational projects, with attribution.
- [ ] **Email Stadtarchiv MG** — historic-photos partnership for Phase 5 (before/after slider). Even a curated set of 20–30 georeferenced photos would be enough to launch the layer.

## Open questions

- **Translation budget**: DeepL has a free tier (500 k chars/mo) — sufficient for the initial corpus? Or accept DE-only at launch.
- **NS-Zwangsarbeit Lagerdatenbank**: link-out only, or invest in a fragile HTML scrape? Default: link-out from a single overview POI.
- **Naming & domain**: keep the project name `mönchengladbach-history` or pick a shorter brand (e.g. `mg-historie`, `mg-history.de`)?

---

## Source links

- Reference site: [history.jonas-strassel.de](https://history.jonas-strassel.de) · [boredland/frankfurt-history](https://github.com/boredland/frankfurt-history)
- [Liste der Stolpersteine in Mönchengladbach (Wikipedia)](https://de.wikipedia.org/wiki/Liste_der_Stolpersteine_in_M%C3%B6nchengladbach)
- [Liste der Baudenkmäler in Mönchengladbach (Wikipedia)](https://de.wikipedia.org/wiki/Liste_der_Baudenkm%C3%A4ler_in_M%C3%B6nchengladbach)
- [OSM Mönchengladbach relation 62410](https://www.openstreetmap.org/relation/62410)
- [DE:Stolpersteine — OSM wiki](https://wiki.openstreetmap.org/wiki/DE:Stolpersteine) · [Alle Stolpersteine in OSM (regio-osm.de)](https://regio-osm.de/stolpersteine/stolpersteinosm.html)
- [Mönchengladbach Open-Data Geodaten](https://www.moenchengladbach.de/de/aktuell-aktiv/open-data/open-data-geodaten) · [open.nrw](https://open.nrw/suche) · [GEOportal.NRW](https://www.geoportal.nrw/)
- [Wikidata: Stolpersteine in Mönchengladbach (Q49759848)](https://www.wikidata.org/wiki/Q49759848) · [Wikidata Query Service](https://query.wikidata.org/)
- [Linking OSM streets to Wikidata persons (Gurtovoy 2023)](https://arxiv.org/pdf/2302.12907) — relevant prior art for Phase 3
- [Jewish Places (Stiftung Jüdisches Museum Berlin)](https://www.jewish-places.de/) · [KuLaDig (LVR)](https://www.kuladig.de/) · [Jüdisches Leben am Niederrhein](https://juedischer-niederrhein.de/) · [NS-Zwangsarbeit Lagerdatenbank](https://www.ns-zwangsarbeit.de/recherche/lagerdatenbank) · [Bundesarchiv: Arisierung](https://www.bundesarchiv.de/im-archiv-recherchieren/archivgut-recherchieren/nach-themen/arisierung-und-sonstige-formen-des-entzugs-juedischen-vermoegens-im-nationalsozialismus/)
