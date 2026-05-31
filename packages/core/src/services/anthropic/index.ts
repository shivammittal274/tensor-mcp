import { apiKeyAuth } from "../../auth";
import { defineService } from "../../defineService";
import { actions as anthropicActions, app as anthropicApp } from "./index.mjs";

/**
 * Anthropic via Pipedream-as-code. API-key auth — pasted at
 * `tensor-mcp connect anthropic <key>` and stored in the OS keychain.
 * The lifted component reads `$auth.api_key`; the Anthropic SDK builds
 * the `x-api-key` + `anthropic-version` headers itself.
 */
export default defineService({
  id: "anthropic",
  displayName: "Anthropic",
  auth: apiKeyAuth({
    signupUrl: "https://console.anthropic.com/settings/keys",
    description:
      "Generate an API key with scope for Messages (chat completion) and " +
      "Models (list). The key starts with `sk-ant-…`.",
  }),
  pipedream: {
    app: anthropicApp,
    actions: anthropicActions,
    authAliases: {
      api_key: (b) => b.access_token,
    },
  },
});
