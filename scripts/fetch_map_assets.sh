#!/usr/bin/env bash
# Re-downloads the protomaps basemaps-assets (sprites + Noto Sans glyph
# PBFs) into app/public/map-assets/. The map style references these via
# absolute paths, so they must live where Vite serves them.
#
# Run once after cloning, or re-run to refresh assets. The committed
# files are kept in sync — this script is the source of truth.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$REPO_ROOT/app/public/map-assets"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "→ downloading protomaps/basemaps-assets tarball"
curl -sL https://codeload.github.com/protomaps/basemaps-assets/tar.gz/refs/heads/main \
  -o "$TMP/assets.tar.gz"
tar -xzf "$TMP/assets.tar.gz" -C "$TMP"
SRC="$TMP/basemaps-assets-main"

echo "→ copying v4 light sprites"
mkdir -p "$DEST/sprites/v4"
cp "$SRC/sprites/v4/light.json" \
   "$SRC/sprites/v4/light.png" \
   "$SRC/sprites/v4/light@2x.json" \
   "$SRC/sprites/v4/light@2x.png" \
   "$DEST/sprites/v4/"

echo "→ copying Noto Sans glyph PBFs (Regular, Italic, Medium)"
mkdir -p "$DEST/fonts"
cp -r "$SRC/fonts/Noto Sans Regular" "$DEST/fonts/"
cp -r "$SRC/fonts/Noto Sans Italic" "$DEST/fonts/"
cp -r "$SRC/fonts/Noto Sans Medium" "$DEST/fonts/"

echo "✔ map assets refreshed at $DEST"
du -sh "$DEST"
