#!/usr/bin/env bash
# 从同级目录的 Robo-GNSS 仓库重新打包 robo-gnss-wasm，刷新 vendor/ tarball。
# 使用场景：Robo-GNSS/wasm 重新构建（node build.mjs）后，在 Nav-Tools 根目录执行：
#   bash scripts/sync-robo-gnss-wasm.sh && pnpm install
# CI 不需要本脚本——vendor/ 中的 tarball 已随仓库提交，保证自包含安装。
set -euo pipefail

WASM_DIR="${1:-../../05-GNSS/Robo-GNSS/wasm}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -f "$WASM_DIR/package.json" ]; then
  echo "未找到 Robo-GNSS wasm 目录：$WASM_DIR" >&2
  echo "用法：bash scripts/sync-robo-gnss-wasm.sh [Robo-GNSS/wasm 路径]" >&2
  exit 1
fi

VERSION=$(node -p "require('$WASM_DIR/package.json').version")
TGZ="robo-gnss-wasm-$VERSION.tgz"

(cd "$WASM_DIR" && pnpm pack --pack-destination "$ROOT/vendor" >/dev/null)
echo "已更新 vendor/$TGZ，请执行 pnpm install 使 lockfile 同步。"
