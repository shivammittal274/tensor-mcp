#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Defaults to host; pass `--target=<plat>-<arch>` to cross-compile.
# Pass `--all` to build every supported target.
TARGET_ARG="${1:-}"

build_one() {
  local TARGET="$1"

  local LIBS=packages/core/src/embeddings/libs
  local ACTIVE=$LIBS/active
  local RUNTIME_SRC
  case "$TARGET" in
    darwin-arm64) RUNTIME_SRC="$LIBS/darwin-arm64/libonnxruntime.1.21.0.dylib" ;;
    darwin-x64)   RUNTIME_SRC="$LIBS/darwin-x64/libonnxruntime.1.21.0.dylib" ;;
    linux-x64)    RUNTIME_SRC="$LIBS/linux-x64/libonnxruntime.so.1.21.0" ;;
    linux-arm64)  RUNTIME_SRC="$LIBS/linux-arm64/libonnxruntime.so.1.21.0" ;;
    *) echo "Unsupported target: $TARGET" >&2; exit 1 ;;
  esac

  if [ ! -f "$RUNTIME_SRC" ]; then
    echo "Missing $RUNTIME_SRC — was the libs/ tree set up?" >&2
    exit 1
  fi
  mkdir -p "$ACTIVE"
  cp "$RUNTIME_SRC" "$ACTIVE/runtime"

  local OUTFILE="dist/tensor-mcp-$TARGET"
  mkdir -p dist
  echo "Building tensor-mcp for $TARGET (runtime: $(basename "$RUNTIME_SRC"))..."

  bun build packages/cli/src/index.ts \
    --compile \
    --target="bun-$TARGET" \
    --outfile "$OUTFILE"

  echo "  → $OUTFILE ($(du -h "$OUTFILE" | cut -f1))"
}

resolve_host_target() {
  local PLATFORM ARCH
  PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
  ARCH=$(uname -m)
  case "$PLATFORM-$ARCH" in
    darwin-arm64)  echo "darwin-arm64" ;;
    darwin-x86_64) echo "darwin-x64" ;;
    linux-x86_64)  echo "linux-x64" ;;
    linux-aarch64) echo "linux-arm64" ;;
    *) echo "" ;;
  esac
}

if [ "$TARGET_ARG" = "--all" ]; then
  TARGETS=(darwin-arm64 darwin-x64 linux-x64 linux-arm64)
elif [ -n "$TARGET_ARG" ] && [[ "$TARGET_ARG" == --target=* ]]; then
  TARGETS=("${TARGET_ARG#--target=}")
else
  HOST=$(resolve_host_target)
  if [ -z "$HOST" ]; then
    echo "Unsupported host. Pass --target=<plat>-<arch> or --all." >&2
    exit 1
  fi
  TARGETS=("$HOST")
fi

for t in "${TARGETS[@]}"; do
  build_one "$t"
done

# Convenience: keep `dist/tensor-mcp` pointing at the host-target binary.
HOST=$(resolve_host_target)
if [ -n "$HOST" ] && [ -f "dist/tensor-mcp-$HOST" ]; then
  rm -f dist/tensor-mcp
  ln -s "tensor-mcp-$HOST" dist/tensor-mcp
  echo "Smoke (host):"
  ./dist/tensor-mcp --help | head -2
fi
