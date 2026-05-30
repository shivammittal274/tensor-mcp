# services/

Service registry. All supported third-party services are declared in `index.ts`.

## Adding a service

Three steps.

### 1. Vendor the Klavis MCP server

Find the service in [Klavis-AI/klavis/mcp_servers](https://github.com/Klavis-AI/klavis/tree/main/mcp_servers).

```bash
cp -r /path/to/klavis/mcp_servers/<svc> vendored/<svc>
```

If it's a Python service, bump CVE pins in `requirements.txt`:
- `mcp>=1.23.0`
- `h11>=0.16.0`

Create `vendored/<svc>/ATTRIBUTION.md` (copy the format from `vendored/linear/ATTRIBUTION.md`).

### 2. Declare the service in `index.ts`

Add a row to the `SERVICES` record:

```ts
notion: defineService({
  id: "notion",
  displayName: "Notion",
  auth: mcpDcrAuth({ mcpServerUrl: "https://mcp.notion.com" }),
  executor: klavisExecutor({ vendorDir: "vendored/notion", lang: "python" }),
}),
```

### 3. Test

```bash
tensor-mcp connect notion     # opens browser, OAuths, ingests catalog
tensor-mcp show               # confirms it landed
tensor-mcp search "create page" --services notion   # exercises BM25 + connection check
```

That's it.

## Auth strategy reference

Pick one based on what the vendor supports.

### `mcpDcrAuth({ mcpServerUrl, scope? })`

Use for services whose hosted MCP supports OAuth 2.1 Dynamic Client Registration. Browser-based, no app registration on our side, fresh client per user.

Verified DCR support: **Linear, Notion, Atlassian, Asana, Cloudflare, Sentry, Cal.com**.

To check a candidate, fetch `https://mcp.<vendor>.com/.well-known/oauth-authorization-server` — if it returns 200 with a `registration_endpoint`, it works.

### `patAuth({ tokenUrl, description })`

Use for vendors without DCR. User pastes a Personal Access Token from the vendor's UI.

```ts
github: defineService({
  id: "github",
  displayName: "GitHub",
  auth: patAuth({
    tokenUrl: "https://github.com/settings/tokens/new?scopes=repo,read:org",
    description: "scopes: repo, read:org",
  }),
  executor: klavisExecutor({ vendorDir: "vendored/github", lang: "go" }),
}),
```

### `apiKeyAuth({ signupUrl, description })`

Same UX as `patAuth`, framed as "API key" for vendors that issue long-lived keys (Cal.com via direct API, e.g.).

## Executor reference

### `klavisExecutor({ vendorDir, lang })`

Convention-based subprocess spawner.

- `lang: "python"` →  `uv run --with-requirements requirements.txt python server.py --port {{PORT}}`
- `lang: "typescript"` →  `bun run index.ts` with `PORT={{PORT}}` env

Both pass the user's token as `AUTH_DATA` env (base64-encoded JSON of `{ access_token: "..." }`). Klavis servers expect this shape.

If a service needs a different `AUTH_DATA` shape (e.g. Slack's `authed_user.access_token`), pass `forgeAuthData: (bundle) => ({...})` to the executor.

## Pending OAuth registrations

Slack and Gmail use OAuth 2.0 with static client registration. Each requires:
- Slack: register a Slack App at [api.slack.com/apps](https://api.slack.com/apps)
- Gmail: create a Google Cloud project + OAuth consent screen + Desktop OAuth client

Once registered, the `oauthPending(...)` placeholder in `index.ts` gets replaced with a `staticOAuth({...})` strategy (planned for Phase 3 alongside GitHub PAT).
