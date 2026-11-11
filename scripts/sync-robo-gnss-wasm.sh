#!/usr/bin/env bash
# 兼容旧调用入口；新的同步入口为 sync-open-gnss-wasm.sh。
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
exec bash "$SCRIPT_DIR/sync-open-gnss-wasm.sh" "$@"
