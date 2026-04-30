#!/usr/bin/env bash
# Build app/public/map-assets/basemap.pmtiles — a single archive that
# stitches together two disjoint extracts so the map has no third-party
# runtime dependency:
#
#   • Mönchengladbach city detail    z = 8..14, bbox tight to MG
#   • European overview (deportations) z = 0..7,  bbox wide
#
# The zoom ranges don't overlap so `pmtiles merge` can stitch them into
# a single archive (~38 MB) which fits comfortably under GitHub's 100 MB
# per-file cap and committed straight into the repo.
#
# Requires the `pmtiles` CLI:
#   curl -sL https://github.com/protomaps/go-pmtiles/releases/latest/download/go-pmtiles_*_Linux_x86_64.tar.gz | tar -xz -C ~/.local/bin pmtiles
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST_DIR="$REPO_ROOT/app/public/map-assets"
OUT="$DEST_DIR/basemap.pmtiles"
SRC_URL="https://demo-bucket.protomaps.com/v4.pmtiles"

CITY_BBOX="6.30,51.05,6.65,51.32"
CITY_MINZOOM=8
CITY_MAXZOOM=14

OVERVIEW_BBOX="-2,44,32,60"
OVERVIEW_MINZOOM=0
OVERVIEW_MAXZOOM=7

if ! command -v pmtiles >/dev/null 2>&1; then
  echo "error: pmtiles CLI not found in PATH" >&2
  echo "install from https://github.com/protomaps/go-pmtiles/releases" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "→ extracting city detail (bbox=$CITY_BBOX z=$CITY_MINZOOM..$CITY_MAXZOOM)"
pmtiles extract "$SRC_URL" "$TMP/mg.pmtiles" \
  --bbox="$CITY_BBOX" \
  --minzoom="$CITY_MINZOOM" \
  --maxzoom="$CITY_MAXZOOM"

echo "→ extracting overview (bbox=$OVERVIEW_BBOX z=$OVERVIEW_MINZOOM..$OVERVIEW_MAXZOOM)"
pmtiles extract "$SRC_URL" "$TMP/eu.pmtiles" \
  --bbox="$OVERVIEW_BBOX" \
  --minzoom="$OVERVIEW_MINZOOM" \
  --maxzoom="$OVERVIEW_MAXZOOM"

echo "→ merging into $OUT"
pmtiles merge "$TMP/eu.pmtiles" "$TMP/mg.pmtiles" "$OUT"

ls -lh "$OUT"
