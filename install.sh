#!/bin/sh
# tensor-mcp installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/shivammittal274/tensor-mcp/main/install.sh | sh
#
# Env:
#   TENSOR_MCP_VERSION   Install a specific tag (e.g. v0.3.0). Default: latest.

set -eu

REPO="shivammittal274/tensor-mcp"
INSTALL_DIR="${HOME}/.tensor-mcp/bin"
BIN_NAME="tensor-mcp"

err() {
  printf 'install.sh: %s\n' "$*" >&2
  exit 1
}

info() {
  printf '%s\n' "$*"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || err "required command not found: $1"
}

need_cmd uname
need_cmd mkdir
need_cmd chmod
need_cmd mv
need_cmd rm

# --- Platform detection -----------------------------------------------------

uname_s="$(uname -s)"
uname_m="$(uname -m)"

case "$uname_s" in
  Darwin)
    plat="darwin"
    ;;
  Linux)
    plat="linux"
    ;;
  MINGW*|MSYS*|CYGWIN*|Windows_NT)
    err "Windows is not supported by this installer. Use WSL, or download the binary directly from https://github.com/${REPO}/releases/latest"
    ;;
  *)
    err "unsupported OS: ${uname_s}"
    ;;
esac

case "$uname_m" in
  x86_64|amd64)
    arch="x64"
    ;;
  aarch64|arm64)
    arch="arm64"
    ;;
  *)
    err "unsupported architecture: ${uname_m}"
    ;;
esac

target="${plat}-${arch}"

case "$target" in
  darwin-arm64|darwin-x64|linux-x64|linux-arm64) ;;
  *) err "no prebuilt binary for ${target}. See https://github.com/${REPO}/releases" ;;
esac

# --- Download tool selection ------------------------------------------------

if command -v curl >/dev/null 2>&1; then
  fetch() { curl -fsSL "$1" -o "$2"; }
  fetch_stdout() { curl -fsSL "$1"; }
elif command -v wget >/dev/null 2>&1; then
  fetch() { wget -q -O "$2" "$1"; }
  fetch_stdout() { wget -q -O - "$1"; }
else
  err "need curl or wget"
fi

# --- Hash tool selection ----------------------------------------------------

if command -v sha256sum >/dev/null 2>&1; then
  sha256_of() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
  sha256_of() { shasum -a 256 "$1" | awk '{print $1}'; }
else
  err "need sha256sum or shasum to verify the download"
fi

# --- Resolve version --------------------------------------------------------

version="${TENSOR_MCP_VERSION:-}"
if [ -n "$version" ]; then
  base_url="https://github.com/${REPO}/releases/download/${version}"
  info "Installing tensor-mcp ${version} for ${target}..."
else
  base_url="https://github.com/${REPO}/releases/latest/download"
  info "Installing tensor-mcp (latest) for ${target}..."
fi

asset="tensor-mcp-${target}"
asset_url="${base_url}/${asset}"
sums_url="${base_url}/SHA256SUMS.txt"

# --- Download to temp -------------------------------------------------------

tmpdir="$(mktemp -d 2>/dev/null || mktemp -d -t tensor-mcp)"
trap 'rm -rf "$tmpdir"' EXIT INT TERM

info "  → downloading ${asset_url}"
if ! fetch "$asset_url" "${tmpdir}/${asset}"; then
  err "failed to download ${asset_url}"
fi

info "  → downloading SHA256SUMS.txt"
if ! fetch "$sums_url" "${tmpdir}/SHA256SUMS.txt"; then
  err "failed to download ${sums_url}"
fi

# --- Verify checksum --------------------------------------------------------

expected="$(awk -v f="$asset" '$2 == f || $2 == "*"f {print $1; exit}' "${tmpdir}/SHA256SUMS.txt")"
if [ -z "$expected" ]; then
  err "no checksum entry for ${asset} in SHA256SUMS.txt"
fi

actual="$(sha256_of "${tmpdir}/${asset}")"
if [ "$expected" != "$actual" ]; then
  err "checksum mismatch for ${asset}
  expected: ${expected}
  actual:   ${actual}"
fi
info "  → sha256 verified (${actual})"

# --- Install ----------------------------------------------------------------

mkdir -p "$INSTALL_DIR"
dest="${INSTALL_DIR}/${BIN_NAME}"
mv "${tmpdir}/${asset}" "$dest"
chmod +x "$dest"

# Clear Gatekeeper quarantine on macOS so the unsigned binary runs.
if [ "$plat" = "darwin" ] && command -v xattr >/dev/null 2>&1; then
  xattr -dr com.apple.quarantine "$dest" 2>/dev/null || true
fi

info ""
info "Installed: ${dest}"

# --- Embeddings (~35 MB, one-time) ------------------------------------------
#
# Pulled straight from upstream sources — no tensor-mcp mirror:
#
#   • Model + tokenizer files: huggingface.co/Xenova/all-MiniLM-L6-v2
#     (the `onnx/model_quantized.onnx` file matches our historic SHA byte
#     for byte; the five small tokenizer/config files live at the repo
#     root).
#
#   • libonnxruntime: unpkg CDN, serving the
#     onnxruntime-node@1.21.0 npm package which embeds prebuilt dylibs
#     per platform under bin/napi-v3/<plat>/<arch>/.
#
# Hardcoded URLs + SHA-256s mean install.sh has zero deps beyond
# curl/wget + sha256 — no python, no jq. When we bump to onnxruntime
# 1.22+ or swap models, bump this section.
#
# Soft failure: if anything fails (offline, upstream 404, SHA mismatch)
# the binary still works in BM25-only mode and we say so.
# Windows entries live in install.ps1; install.sh handles macOS/Linux/WSL.

HF_BASE="https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main"
ORT_BASE="https://unpkg.com/onnxruntime-node@1.21.0/bin/napi-v3"
EMBED_DIR="${HOME}/.tensor-mcp/embeddings"

# Determine the per-platform runtime entry. Empty for unsupported
# platforms — semantic ranking just isn't available there.
case "$target" in
  darwin-arm64)
    runtime_local="libonnxruntime.1.21.0.dylib"
    runtime_url="${ORT_BASE}/darwin/arm64/libonnxruntime.1.21.0.dylib"
    runtime_sha="1bce2d05d778282c912e7fab6d5dfc5fa851f5797e8d0914a62d4adeb1d4d82b"
    ;;
  darwin-x64)
    runtime_local="libonnxruntime.1.21.0.dylib"
    runtime_url="${ORT_BASE}/darwin/x64/libonnxruntime.1.21.0.dylib"
    runtime_sha="eadc928764eff24f8b2f332d51a6aa03d82abe6febf0fb5016f2c42dea43c8e1"
    ;;
  linux-x64)
    runtime_local="libonnxruntime.so.1.21.0"
    runtime_url="${ORT_BASE}/linux/x64/libonnxruntime.so.1.21.0"
    runtime_sha="05bfddeefc536a44478c20226218dae8853995518bb2a994b4fa15a996f5f412"
    ;;
  linux-arm64)
    runtime_local="libonnxruntime.so.1.21.0"
    runtime_url="${ORT_BASE}/linux/arm64/libonnxruntime.so.1.21.0"
    runtime_sha="36671b53885a8433882c4db360138bd060f3580f7d7cb6578050e755e83b6128"
    ;;
  *)
    runtime_local=""
    runtime_url=""
    runtime_sha=""
    ;;
esac

# Each line: <subdir> <local_filename> <full_url> <sha256>
# Model files all land in fast-all-MiniLM-L6-v2/; runtime in runtime/.
model_entries="fast-all-MiniLM-L6-v2 model.onnx ${HF_BASE}/onnx/model_quantized.onnx afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1
fast-all-MiniLM-L6-v2 tokenizer.json ${HF_BASE}/tokenizer.json da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0
fast-all-MiniLM-L6-v2 tokenizer_config.json ${HF_BASE}/tokenizer_config.json 9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3
fast-all-MiniLM-L6-v2 special_tokens_map.json ${HF_BASE}/special_tokens_map.json b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3
fast-all-MiniLM-L6-v2 config.json ${HF_BASE}/config.json 7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7
fast-all-MiniLM-L6-v2 vocab.txt ${HF_BASE}/vocab.txt 07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3"

if [ -n "$runtime_url" ]; then
  embed_entries="${model_entries}
runtime ${runtime_local} ${runtime_url} ${runtime_sha}"
else
  embed_entries="$model_entries"
fi

info ""
info "Downloading embeddings (one-time, ~35 MB)..."

embed_failed=0
# Use a here-doc so the `while` loop runs in the current shell — assigning
# to `embed_failed` from a piped subshell wouldn't survive.
while IFS=' ' read -r subdir local_name url sha; do
  [ -z "$local_name" ] && continue
  dest_subdir="${EMBED_DIR}/${subdir}"
  dest_path="${dest_subdir}/${local_name}"
  if [ -f "$dest_path" ]; then
    info "  → ${local_name} (cached)"
    continue
  fi
  info "  → ${local_name}"
  mkdir -p "$dest_subdir"
  tmp_path="${dest_path}.part"
  if ! fetch "$url" "$tmp_path"; then
    info "    ⚠ download failed"
    embed_failed=1
    rm -f "$tmp_path"
    continue
  fi
  actual="$(sha256_of "$tmp_path")"
  if [ "$actual" != "$sha" ]; then
    info "    ⚠ sha256 mismatch (expected ${sha}, got ${actual})"
    embed_failed=1
    rm -f "$tmp_path"
    continue
  fi
  mv "$tmp_path" "$dest_path"
done <<EMBED_LIST
${embed_entries}
EMBED_LIST

if [ -z "$runtime_url" ]; then
  info "  → no libonnxruntime for ${target}; search will use BM25-only."
elif [ "$embed_failed" = "1" ]; then
  info "  ⚠ some embedding files failed. Search will use BM25-only until re-run."
else
  info "  → embeddings ready at ${EMBED_DIR}"
fi

# --- PATH hint --------------------------------------------------------------

case ":${PATH:-}:" in
  *":${INSTALL_DIR}:"*)
    info "Run: tensor-mcp --help"
    ;;
  *)
    info ""
    info "Add ${INSTALL_DIR} to your PATH. For example:"
    info ""
    info "  echo 'export PATH=\"${INSTALL_DIR}:\$PATH\"' >> ~/.zshrc"
    info "  # or ~/.bashrc"
    info ""
    info "Then run: tensor-mcp --help"
    ;;
esac
