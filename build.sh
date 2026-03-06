#!/usr/bin/env bash
set -euo pipefail

PLUGIN_NAME="zotero-google-this"
VERSION="$(sed -nE 's/.*"version":[[:space:]]*"([^"]+)".*/\1/p' manifest.json | head -n1)"
OUTPUT="${PLUGIN_NAME}-${VERSION}.xpi"
PACKAGE_CONTENTS=(
  manifest.json
  bootstrap.js
  icons
  _locales
  LICENSE
)

rm -f "$OUTPUT"
zip -r "$OUTPUT" "${PACKAGE_CONTENTS[@]}"
echo "Built $OUTPUT"
