#!/bin/bash
# Assemble the plugin's zip as Volumio's plugin manager takes it: the
# plugin's files at the root, and a note of the build. Output:
# dist/unspike-<version>.zip.
#
# The zip carries no node modules: `volumio plugin install` installs a
# plugin's dependencies on the player, and the plugin store refuses a
# package that brings its own.
set -euo pipefail
ROOT=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
cd "$ROOT"
NAME=unspike
VERSION=$(sed -n 's/^ *"version": "\(.*\)",*$/\1/p' "$NAME/package.json" | head -n1)
[ -n "$VERSION" ] || { echo "package: $NAME/package.json names no version" >&2; exit 1; }

STAGE=dist/stage/$NAME
rm -rf dist/stage
mkdir -p "$STAGE"
cp -r "$NAME/." "$STAGE/"
rm -rf "$STAGE/node_modules" "$STAGE/package-lock.json"

# The build the zip carries: the commit and the time.
printf '{ "commit": "%s", "built": "%s" }\n' \
  "$(git rev-parse --short HEAD 2>/dev/null || echo unknown)" \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STAGE/build.json"

ZIP=dist/$NAME-$VERSION.zip
rm -f "$ZIP"
( cd "$STAGE" && zip -qr "$ROOT/$ZIP" . )
rm -rf dist/stage
if unzip -Z1 "$ZIP" | grep -q -e '^node_modules/' -e '/node_modules/' -e 'package-lock\.json$'; then
  echo "package: $ZIP carries node modules or a lock file; the store refuses it" >&2
  exit 1
fi
echo "package: $ZIP: $(stat -c %s "$ZIP") bytes, sha256 $(sha256sum "$ZIP" | cut -d' ' -f1)"
