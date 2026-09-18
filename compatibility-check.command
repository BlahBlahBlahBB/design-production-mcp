#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")"
npm run compatibility:check -- "$@"
