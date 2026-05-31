import { apiKeyAuth } from "../../auth";
import { defineService } from "../../defineService";
import {
  actions as tavilyActions,
  app as tavilyApp,
} from "./index.mjs";

/**
 * Tavily via Pipedream-as-code. API-key auth — agent-focused search API.
 * Single tool (`send_query`) that returns LLM-friendly search results.
 */
export default defineService({
  id: "tavily",
  displayName: "Tavily",
  auth: apiKeyAuth({
    signupUrl: "https://app.tavily.com/home",
    description:
      "Sign up at app.tavily.com and create an API key. Keys start with " +
      "`tvly-…`.",
  }),
  pipedream: {
    app: tavilyApp,
    actions: tavilyActions,
    authAliases: {
      api_key: (b) => b.access_token,
    },
  },
});
