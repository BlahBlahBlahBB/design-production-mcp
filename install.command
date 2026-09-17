#!/bin/bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer supports macOS only." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")" && pwd -P)"
NODE_BIN="$(command -v node || true)"
NPM_BIN="$(command -v npm || true)"

if [[ -z "$NODE_BIN" ]]; then
  echo "Node.js 20 or later is required. Install Node, then rerun this installer." >&2
  exit 1
fi
if [[ -z "$NPM_BIN" ]]; then
  echo "npm is required. Install a complete Node.js 20+ distribution, then rerun this installer." >&2
  exit 1
fi

NODE_BIN="$($NODE_BIN -p 'process.execPath')"
NODE_MAJOR="$($NODE_BIN -p 'Number(process.versions.node.split(".")[0])')"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "Node $($NODE_BIN --version) is unsupported. Node 20 or later is required." >&2
  exit 1
fi

cd "$ROOT"
echo "Installing dependencies…"
"$NPM_BIN" ci --include=dev
echo "Building Illustrator MCP…"
"$NPM_BIN" run build

ENTRYPOINT="$ROOT/dist/src/mcp/stdio.js"
if [[ ! -f "$ENTRYPOINT" ]]; then
  echo "Build did not produce the MCP entrypoint: $ENTRYPOINT" >&2
  exit 1
fi

"$NODE_BIN" "$ROOT/scripts/configure-codex.mjs" install "$NODE_BIN" "$ENTRYPOINT"
echo "Installation complete. Restart Codex, then look for the Illustrator MCP tools."
