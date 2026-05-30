#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$(pwd)

PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$PLATFORM-$ARCH" in
  darwin-arm64)  TARGET="bun-darwin-arm64" ;;
  darwin-x86_64) TARGET="bun-darwin-x64" ;;
  linux-x86_64)  TARGET="bun-linux-x64" ;;
  linux-aarch64) TARGET="bun-linux-arm64" ;;
  *) echo "Unsupported platform: $PLATFORM-$ARCH"; exit 1 ;;
esac

echo "Building tensor-mcp for $TARGET..."
mkdir -p dist

bun build packages/cli/src/index.ts \
  --compile \
  --target="$TARGET" \
  --outfile dist/tensor-mcp

echo "Built dist/tensor-mcp ($(du -h dist/tensor-mcp | cut -f1))"
echo "Smoke test:"
./dist/tensor-mcp --help | head -2
