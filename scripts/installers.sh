#!/bin/bash
# Run the plugin's install.sh and uninstall.sh for real, as root, in a
# throwaway Debian bookworm container laid out like a player: a fresh
# install on the kernel the plugin is for and on another, an update of a
# plugin in use, and an uninstall. What the scripts ask of systemd is
# recorded rather than done; what they write is looked at. The cases are in
# test/sandbox.sh.
set -euo pipefail
ROOT=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)

if ! command -v docker >/dev/null 2>&1; then
  echo "installers: docker not found; the installers have not been run" >&2
  exit 0
fi
docker run --rm -v "$ROOT:/repo:ro" debian:bookworm-slim sh /repo/test/sandbox.sh
