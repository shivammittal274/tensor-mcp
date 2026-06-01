import { apiKeyAuth } from "../../auth";
import { defineService } from "../../defineService";
import { actions as exaActions, app as exaApp } from "./index.mjs";

/**
 * Exa via Pipedream-as-code. AI-native semantic web search — complements
 * Brave (lexical web search) and Tavily (LLM-curated search) by ranking
 * results with embeddings instead of BM25 / keyword overlap.
 *
 * Auth is a single API key, sent in the `x-api-key` header. The lifted
 * component reads `$auth.api_key`.
 */
export default defineService({
  id: "exa",
  displayName: "Exa",
  auth: apiKeyAuth({
    signupUrl: "https://dashboard.exa.ai/api-keys",
    description:
      "Sign up at dashboard.exa.ai and create an API key. Free tier covers " +
      "the basic search endpoints — paid tier unlocks higher rate limits and " +
      "advanced features like `findSimilar`.",
  }),
  pipedream: {
    app: exaApp,
    actions: exaActions,
    authAliases: {
      api_key: (b) => b.access_token,
    },
  },
});
