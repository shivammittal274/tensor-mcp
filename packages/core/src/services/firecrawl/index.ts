import { apiKeyAuth } from "../../auth";
import { defineService } from "../../defineService";
import {
  actions as firecrawlActions,
  app as firecrawlApp,
} from "./index.mjs";

/**
 * Firecrawl via Pipedream-as-code. API-key auth — web scraping +
 * crawling tuned for LLM consumption. Seven actions: scrape, crawl,
 * map, search, extract structured data, plus status checks for
 * long-running crawl/extract jobs.
 */
export default defineService({
  id: "firecrawl",
  displayName: "Firecrawl",
  auth: apiKeyAuth({
    signupUrl: "https://www.firecrawl.dev/app/api-keys",
    description:
      "Sign up at firecrawl.dev and create an API key. Keys start with " +
      "`fc-…`.",
  }),
  pipedream: {
    app: firecrawlApp,
    actions: firecrawlActions,
    authAliases: {
      api_key: (b) => b.access_token,
    },
  },
});
