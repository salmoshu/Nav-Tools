#!/usr/bin/env bash
# Open-GNSS/wasm 构建完成后，刷新 Nav-Tools 中的 WASM 包。
# WASM 包名、vendor 文件名和消费方导入名统一为 open-gnss-wasm。
set -euo pipefail

usage() {
  cat <<'EOF'
用法：bash scripts/sync-open-gnss-wasm.sh [Open-GNSS/wasm 路径]

不指定路径时，优先查找同级或 ../../04-GNSS 下的 Open-GNSS 仓库，
同时兼容仍保留 Robo-GNSS 名称的本地目录。显式路径相对于当前工作目录。
请先在上游 wasm 目录执行 node build.mjs，再运行本脚本。
EOF
}

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

if (($# > 1)); then usage >&2; exit 1; fi
case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  -*) usage >&2; exit 1 ;;
esac

NAV_TOOLS_ROOT="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
WASM_SOURCE_DIR="${1:-}"
if [[ -z "$WASM_SOURCE_DIR" ]]; then
  for candidate in \
    "$NAV_TOOLS_ROOT/../../04-GNSS/Open-GNSS/wasm" \
    "$NAV_TOOLS_ROOT/../Open-GNSS/wasm" \
    "$NAV_TOOLS_ROOT/../../04-GNSS/Robo-GNSS/wasm" \
    "$NAV_TOOLS_ROOT/../Robo-GNSS/wasm"; do
    if [[ -f "$candidate/package.json" ]]; then
      WASM_SOURCE_DIR="$candidate"
      break
    fi
  done
fi
if [[ -z "$WASM_SOURCE_DIR" || ! -f "$WASM_SOURCE_DIR/package.json" ]]; then
  usage >&2
  fail "未找到 Open-GNSS wasm 目录：${WASM_SOURCE_DIR:-请显式指定路径}"
fi
WASM_SOURCE_DIR="$(CDPATH= cd -- "$WASM_SOURCE_DIR" && pwd -P)"

for tool in node pnpm; do
  command -v "$tool" >/dev/null 2>&1 || fail "PATH 中未找到 $tool"
done
for artifact in index.js index.d.ts dist/gnss_wasm.js; do
  [[ -f "$WASM_SOURCE_DIR/$artifact" ]] || fail "缺少 $artifact，请先构建 Open-GNSS/wasm"
done

PACKAGE_MANIFEST="$WASM_SOURCE_DIR/package.json"
PACK_DESTINATION="$NAV_TOOLS_ROOT/vendor"
if command -v cygpath >/dev/null 2>&1; then
  # Git Bash/MSYS2 的自动路径转换会跳过含单引号的路径。
  PACKAGE_MANIFEST="$(cygpath -w "$PACKAGE_MANIFEST")"
  PACK_DESTINATION="$(cygpath -w "$PACK_DESTINATION")"
fi

PACKAGE_VERSION=$(node -e '
const fs = require("node:fs");
const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (pkg.name !== "open-gnss-wasm" || typeof pkg.version !== "string" || !pkg.version) {
  console.error("不是当前 Nav-Tools 使用的 open-gnss-wasm 包，或缺少版本号");
  process.exit(1);
}
process.stdout.write(pkg.version);
' "$PACKAGE_MANIFEST")
PACKAGE_FILE="open-gnss-wasm-$PACKAGE_VERSION.tgz"

mkdir -p -- "$NAV_TOOLS_ROOT/vendor"
(cd -- "$WASM_SOURCE_DIR" && pnpm pack --pack-destination "$PACK_DESTINATION" >/dev/null)
printf '已更新 vendor/%s，请执行 pnpm install 使 lockfile 同步。\n' "$PACKAGE_FILE"
