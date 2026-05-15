#!/usr/bin/env bash
# scripts/build_and_install_dev.sh
# Builds Wigolo and refreshes the dev install path so Claude Code's wigolo-dev
# MCP server picks up the latest code.
#
# Adjust the BUILD_CMD line if you use pnpm/yarn instead of npm, or if your
# build script has a different name.

set -euo pipefail
cd "$(dirname "$0")/.."

BUILD_CMD="${WIGOLO_BUILD_CMD:-npm run build}"

echo "[build] running: $BUILD_CMD"
$BUILD_CMD

# tsc does not copy non-TS assets. Mirror src/scripts/*.py into dist/scripts/
# so embedding_server.py is discoverable at runtime.
mkdir -p dist/scripts
cp -f src/scripts/*.py dist/scripts/ 2>/dev/null || true

# If your dev install path is just the project directory (Claude Code points at
# /Users/towhidkhan/Desktop/personal/wigolo/dist/mcp-server.js directly), the
# build above is all you need.
#
# If you instead copy artifacts elsewhere (e.g., ~/.local/share/wigolo-dev/),
# do that copy here. Example:
#
#   DEV_INSTALL="${WIGOLO_DEV_INSTALL_DIR:-$HOME/.local/share/wigolo-dev}"
#   mkdir -p "$DEV_INSTALL"
#   rsync -a --delete dist/ "$DEV_INSTALL/dist/"
#   cp package.json "$DEV_INSTALL/"
#   (cd "$DEV_INSTALL" && npm ci --production --silent)

echo "[build] done"
