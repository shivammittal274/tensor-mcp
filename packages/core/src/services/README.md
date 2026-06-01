# Services

This folder defines every third-party tool tensor-mcp can connect to. Each
service is a `defineService({...})` entry registered in `index.ts`.

There are two transport shapes:

- **Hosted-remote** — the vendor runs the tool code at a public MCP URL.
  Our CLI just handles OAuth/DCR and proxies traffic.
- **Pipedream-as-code** — we lift the upstream Pipedream component
  byte-identical and run its actions in-process. We own auth + execution.

Adding a hosted-remote service is one file (e.g. `linear.ts`). Adding a
Pipedream-as-code service is a folder with the lifted upstream code +
one handwritten `index.ts`. The rest of this README covers the
Pipedream-as-code path, because it has more moving parts.

## The 1:1 naming rule

**Folder name = upstream Pipedream component name = `defineService.id`.**

```
services/slack_v2/         ← Pipedream's components/slack_v2/
services/google_sheets/    ← Pipedream's components/google_sheets/
services/youtube_data_api/ ← Pipedream's components/youtube_data_api/
```

No rename tables. No vendor → folder map. `scripts/sync-pipedream.ts`
walks the registry, hits `github.com/PipedreamHQ/pipedream/components/<id>/`,
and re-lifts. Friendly display names live on `Service.displayName`.

## Lifting a service from Pipedream

### 1. Pick the component id

Browse [PipedreamHQ/pipedream/components](https://github.com/PipedreamHQ/pipedream/tree/master/components)
and grab the directory name verbatim. That's your `<id>`.

### 2. Add the id to the sync script

`scripts/sync-pipedream.ts` has a constant:

```ts
const ALL_COMPONENTS = [
  "slack_v2",
  "github",
  // …
  "<your-id>",
];
```

### 3. Run the sync

```sh
bun run scripts/sync-pipedream.ts <your-id>
# or to refresh everything:
bun run scripts/sync-pipedream.ts --all
```

The script:

- Sparse-clones Pipedream into `/tmp/pipedream-lift` (first run ~30s)
- `cp -r components/<id>` byte-identical into `services/<id>/`
- Strips `package.json` (it would hijack Bun's `./<id>` resolution), `README.md`, `sources/`
- Regenerates `index.mjs` + `index.d.mts` barrels
- Preserves any existing handwritten `index.ts`
- Prints aggregate npm deps surfaced from upstream `import` lines

### 4. Install any new npm deps

The script prints what it found. Compare against `packages/core/package.json`
and pin to **Pipedream's own version range** (check the upstream
component's `package.json` in `/tmp/pipedream-lift/components/<id>/`).
Matching upstream pins guarantees the lifted code's transitive graph
resolves the same way it does on Pipedream.

```sh
bun add <pkg>@<pipedream-range>
```

### 5. Write `services/<id>/index.ts`

Pick an auth strategy (see below), then:

```ts
import { defineService } from "../../defineService";
import { patAuth } from "../../auth";
import { actions, app } from "./index.mjs";

export default defineService({
  id: "<id>",                      // Must match the folder name.
  displayName: "<Display Name>",
  auth: patAuth({
    description: "Paste your <vendor> token …",
    storageKey: "token",
  }),
  pipedream: {
    app,
    actions,
    authAliases: {
      // Maps Pipedream's $auth.<key> proxy to our stored bundle field.
      // Check `<id>.app.mjs` for `this.$auth.<name>` references.
      api_token: (b) => b.token,
    },
  },
});
```

### 6. Register

Add the default import to `services/index.ts` and append to the `ALL`
array. Done.

### 7. Smoke-load

```sh
bun -e "
  import { listServices } from './packages/core/src/services/index.ts';
  console.log(listServices().length, 'services');
"
```

If anything fails to resolve, the error names the missing import.
Almost always it's an npm dep that needs `bun add`.

## Picking an auth strategy

```
                         ┌─────────────────────────────┐
                         │ Vendor ships a hosted MCP   │
                         │ endpoint with DCR?          │
                         └──────────────┬──────────────┘
                                        │
                            ┌───────────┴───────────┐
                            │ yes                   │ no
                            ▼                       ▼
                     ┌────────────┐       ┌─────────────────┐
                     │ dcrAuth()  │       │ Vendor uses     │
                     │ + remote   │       │ static OAuth    │
                     └────────────┘       │ (Slack, Google) │
                                          └────────┬────────┘
                                                   │
                                       ┌───────────┴───────────┐
                                       │ yes                   │ no
                                       ▼                       ▼
                              ┌─────────────────┐       ┌──────────────┐
                              │ oauth()         │       │ PAT / API    │
                              │ via shared      │       │ key?         │
                              │ factory if      │       │ patAuth() or │
                              │ ≥2 services     │       │ apiKeyAuth() │
                              │ share a client  │       └──────────────┘
                              └─────────────────┘
```

- **`dcrAuth({ remoteUrl })`** — vendor-side dynamic client registration
  (RFC 7591). MCP SDK does the heavy lifting. Used by Linear, Notion,
  Jira, Confluence, Asana, Cal.com.
- **`oauth({ ... })`** — DIY static OAuth (PKCE). Used when the vendor
  ships a static `client_id` and won't accept DCR. Slack, Google,
  GitHub fit here.
- **`patAuth({ description, storageKey })`** — user pastes a personal
  access token at connect time. Discord (`bot_token`), Telegram
  (`token`), Brave Search, Tavily, Firecrawl, Anthropic.
- **`apiKeyAuth(...)`** — same as PAT for vendors that prefer the term.

## Shared OAuth factories (`_shared/`)

When ≥2 services share an OAuth `client_id` (e.g. Gmail + Calendar +
Drive + Docs + Sheets + Meet all under one Google Cloud project), the
client config lives in `_shared/<vendor>.ts` as a factory. Each service
calls the factory with its own scope:

```ts
// gmail/index.ts
auth: googleOAuth({
  scope: "https://www.googleapis.com/auth/gmail.modify",
  description: "Opens a browser to authorize Gmail.",
}),
```

Inside `_shared/google.ts`, `googleOAuth(opts)` returns a configured
`oauth(...)` strategy with the Google `client_id`/`client_secret`,
authorization endpoint, token endpoint, redirect port, and
`access_type=offline` / `prompt=consent` baked in.

Add a new shared factory only when the second service shows up — don't
preemptively abstract.

## Re-syncing later (drift detection)

Run `bun run scripts/sync-pipedream.ts --all` periodically. The script
overwrites the lifted code in place. `git diff` shows you what changed
upstream. Two common shapes:

- **New action subdir added upstream** → `index.mjs` barrel
  regenerates with the new export automatically. No code changes
  needed.
- **Action signature/schema changed** → no compile error (the lifted
  `.mjs` are loose JS), but tool runtime behavior shifts. Spot-check
  any action you depend on after a sync.

The handwritten `index.ts` is never touched by the sync.

## Two services we intentionally diverged from upstream

- **`gmail/`** — `update-org-signature` was deleted post-sync. The
  Pipedream upstream imports `../../../google_cloud/google_cloud.app.mjs`
  (cross-component dependency), and the action needs a Google Workspace
  JWT / service-account flow that doesn't match our user OAuth shape.
  If you re-run the sync, delete the directory again.
- **`google_meet/`** — Pipedream's meet scheduling actually rides the
  Calendar API; we request the calendar scope instead of a meet-specific
  scope. The `scope` is set in `google_meet/index.ts`, not in the
  lifted code, so it survives sync.

## File layout for a lifted service

```
services/<id>/
├─ <id>.app.mjs          ← upstream, the Pipedream app definition
├─ actions/
│  ├─ <action-1>/        ← upstream, one dir per action
│  │  └─ <action-1>.mjs
│  └─ common/            ← upstream, shared helpers (optional)
├─ common/               ← upstream, app-level helpers (optional)
├─ index.mjs             ← generated, barrel of { app, actions }
├─ index.d.mts           ← generated, .d.ts for the barrel
└─ index.ts              ← handwritten, defineService({...})
```

Anything generated is overwritten on sync. Only `index.ts` is yours.
