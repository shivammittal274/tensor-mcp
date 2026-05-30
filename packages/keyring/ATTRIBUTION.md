# Attribution

This package is a fork of Composio's `cli-keyring` TypeScript package.

- **Upstream source**: https://github.com/ComposioHQ/composio/tree/next/ts/packages/cli-keyring
- **Upstream license**: ISC ("Copyright (c) 2025 Sampark Inc."), see `LICENSE` in this directory if present
- **Vendored at commit**: 22a9171981d96e573d937ac4360a1185d5682256
- **Vendored date**: 2026-05-30

## Modifications from upstream

- `package.json`: renamed `"name"` from `"@composio/cli-keyring"` → `"@tensor-mcp/keyring"`

No source code changes.

## Why this lives here

tensor-mcp uses OS keychains (macOS Keychain via Bun FFI to Security.framework, libsecret on Linux) for OAuth token storage. This package implements those backends; we wrap it in `packages/runtime/src/vault.ts`.

## Platform support

- macOS: native via Bun FFI; ~1ms latency
- Linux: `secret-tool` subprocess (requires `libsecret-tools` system package)
- Windows: **NOT supported by this package** — throws `NoStorageAccess`. tensor-mcp will add a DPAPI backend in Phase 3 (`packages/keyring/src/stores/windows-dpapi.ts`).
