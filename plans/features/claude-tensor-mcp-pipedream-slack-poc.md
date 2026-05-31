# POC: Pipedream Slack port into tensor-mcp

## Goal
Measure how cheap-per-action it is to port Pipedream components into tensor-mcp
once a shim exists. End-state: `tensor-mcp execute slack send_message_to_channel '{...}'`
calls the unchanged Pipedream `send-message.mjs` against the real Slack API.

## Strategy
- Add a third service-source type `pipedream: { app, actions }` alongside `spawn` /
  `remote`. Keep the runtime contract identical (returns `{ content: [...] }`).
- Lift `slack_v2/` from upstream Pipedream **unchanged**. The shim adapts at runtime
  (`this` proxy + `$.export` + `$auth` reader).
- For tool-listing, walk action props + propDefinitions and emit JSON Schema.
- Skip Pipedream `options()` (UI dropdown helper) — execution path doesn't need it.
- Use the existing keyring (TokenStore) for `this.$auth.<key>` lookups. Token bundle's
  `access_token` becomes `oauth_access_token`; `metadata.bot_token` becomes `bot_token`.

## Files
- `packages/core/src/services/adapt/pipedream/index.ts` — facade
- `.../propsToJsonSchema.ts` — props → JSON Schema (+ propDefinition resolver inline)
- `.../runAction.ts` — bind `this`, invoke `run({ $ })`, return `{ content }`
- `.../listTools.ts` — convert action modules → tool descriptors
- `packages/core/src/services/local/slack/` — lifted Pipedream slack_v2

## Wire-up
- `defineService.ts` — accept `pipedream` source; lift mutual-exclusion guard.
- `catalog/ingest.ts` — if `pipedream`, use the shim's listTools.
- `mcp/execute.ts` — if `pipedream`, dispatch to shim runAction.
- `services.ts` — register `slack` with `pipedream: { app, actions: [send, find, list] }`.

## Risks / open questions
- `@pipedream/platform` import — install or stub `ConfigurationError`? Install.
- `@slack/web-api` is the real SDK — install. Bun handles ESM `.mjs` natively.
- `additionalProps`/`reloadProps` — UI-only; ignored at execute time.
- Tool name shape: `tensor-mcp execute slack send_message_to_channel` — slugified
  from action `key` (drop `slack_v2-` prefix, replace `-` with `_`).
