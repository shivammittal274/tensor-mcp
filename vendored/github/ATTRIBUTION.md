# Attribution

This directory is a fork of the Klavis MCP GitHub server.

- **Upstream source**: https://github.com/Klavis-AI/klavis/tree/main/mcp_servers/github
- **Upstream license**: Apache 2.0 (see Klavis repo LICENSE)
- **Vendored at commit**: 246207aec639b86b5da61bd35b017c434dc7ada3
- **Vendored date**: 2026-05-31

## Modifications from upstream

None yet. The server reads `AUTH_DATA` env (raw JSON) natively — same Klavis
convention as our Python/TypeScript vendored servers — so no shim is needed.

## How tensor-mcp runs this

- Pre-compiled at build time by `scripts/build.sh` into
  `vendored/github/bin/<platform>-<arch>/server` (CGO disabled, statically
  linked).
- At runtime, the service's `SpawnConfig` uses `command: ["./bin/<plat>-<arch>/server"]`
  and sets `PORT={{PORT}}` via `envInject` — matching the Klavis Cloud
  Run convention at `server.go:99`.

## Authentication

GitHub does not support DCR or static OAuth without app registration. The
`github` service in `packages/services/index.ts` uses **`patAuth`** — the
user generates a Personal Access Token at
https://github.com/settings/tokens/new and pastes it into `tensor-mcp connect github`.
The token is stored in the OS keychain and forged into the standard
`{access_token}` AUTH_DATA shape on subprocess spawn.

To migrate to full OAuth: register a GitHub OAuth App, then swap `patAuth`
for `staticOAuthAuth` in the service definition — no server-side changes.
