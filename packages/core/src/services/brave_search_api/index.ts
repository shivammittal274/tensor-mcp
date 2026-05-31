import { apiKeyAuth } from "../../auth";
import { defineService } from "../../defineService";
import {
  actions as braveActions,
  app as braveApp,
} from "./index.mjs";

/**
 * Brave Search API via Pipedream-as-code. API-key auth — single tool
 * (`web_search`) that hits Brave's web search index. The lifted
 * component reads `$auth.api_key` and sends it as `X-Subscription-Token`.
 */
export default defineService({
  id: "brave_search",
  displayName: "Brave Search",
  auth: apiKeyAuth({
    signupUrl: "https://brave.com/search/api/",
    description:
      "Sign up for the Brave Search API and create a subscription. The key " +
      "is on the dashboard under \"Subscription Token\".",
  }),
  pipedream: {
    app: braveApp,
    actions: braveActions,
    authAliases: {
      api_key: (b) => b.access_token,
    },
  },
});
