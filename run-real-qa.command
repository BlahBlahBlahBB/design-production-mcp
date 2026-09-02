#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

echo "Design Production MCP — Phase 1 Illustrator Real QA"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed or not on PATH."
  echo "Install Node.js 20+ and run this file again."
  read "?Press Enter to close..."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm is not available."
  read "?Press Enter to close..."
  exit 1
fi

echo "[1/3] Installing dependencies..."
npm install

echo "[2/3] Building..."
npm run build

echo "[3/3] Starting real Illustrator QA..."
set +e
node tools/illustrator-real-qa.mjs
status=$?
set -e

echo ""
if [[ $status -eq 0 ]]; then
  echo "QA finished successfully."
else
  echo "QA failed. Keep the generated report and send it back for diagnosis."
fi
read "?Press Enter to close..."
exit $status
