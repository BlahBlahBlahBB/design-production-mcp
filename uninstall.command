#!/bin/bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This uninstaller supports macOS only." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")" && pwd -P)"
NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "Node.js is required to update Codex configuration." >&2
  exit 1
fi

NODE_BIN="$($NODE_BIN -p 'process.execPath')"
"$NODE_BIN" "$ROOT/scripts/configure-codex.mjs" uninstall
echo "Uninstall complete. Restart Codex to unload the Illustrator MCP."
