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
