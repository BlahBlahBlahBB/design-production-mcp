#!/bin/bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "当前安装器仅支持 macOS。" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")" && pwd -P)"
NODE_BIN="$(command -v node || true)"
NPM_BIN="$(command -v npm || true)"

print_node_help() {
  echo "" >&2
  echo "Illustrator MCP 需要 Node.js 20 或更高版本。" >&2
  echo "请从 Node.js 官网安装 Node.js 20+：" >&2
  echo "https://nodejs.org/" >&2
  echo "" >&2
  echo "安装或切换版本后，重新打开终端并确认：" >&2
  echo "  node -v" >&2
  echo "  npm -v" >&2
  echo "" >&2
  echo "当 node -v 显示 v20.x.x 或更高版本后，再次运行 ./install.command。" >&2
  echo "如果你已经安装了较新的 Node，但这里仍检测到旧版本，请检查当前终端的 PATH 或 Node 版本管理器。" >&2
}

if [[ -z "$NODE_BIN" ]]; then
  echo "未检测到 Node.js。" >&2
  print_node_help
  exit 1
fi

NODE_BIN="$($NODE_BIN -p 'process.execPath')"
NODE_VERSION="$($NODE_BIN --version)"
NODE_MAJOR="$($NODE_BIN -p 'Number(process.versions.node.split(".")[0])')"

if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "检测到不受支持的 Node.js 版本：$NODE_VERSION" >&2
  echo "当前 Node 路径：$NODE_BIN" >&2
  print_node_help
  exit 1
fi

if [[ -z "$NPM_BIN" ]]; then
  echo "检测到 Node.js $NODE_VERSION，但未检测到 npm。" >&2
  echo "当前 Node 路径：$NODE_BIN" >&2
  echo "请安装包含 npm 的完整 Node.js 20+ 发行版，然后重新运行安装器。" >&2
  echo "Node.js 官网：https://nodejs.org/" >&2
  exit 1
fi

NPM_VERSION="$($NPM_BIN --version)"
echo "检测到 Node.js $NODE_VERSION：$NODE_BIN"
echo "检测到 npm $NPM_VERSION：$NPM_BIN"

cd "$ROOT"
echo "正在安装依赖…"
"$NPM_BIN" ci --include=dev
echo "正在构建 Illustrator MCP…"
"$NPM_BIN" run build

ENTRYPOINT="$ROOT/dist/src/mcp/stdio.js"
if [[ ! -f "$ENTRYPOINT" ]]; then
  echo "构建完成后未找到 MCP 入口：$ENTRYPOINT" >&2
  exit 1
fi

"$NODE_BIN" "$ROOT/scripts/configure-codex.mjs" install "$NODE_BIN" "$ENTRYPOINT"
echo "安装完成。请完全退出并重新打开 Codex，然后检查 Illustrator MCP 工具。"
