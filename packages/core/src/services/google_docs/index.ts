import { defineService } from "../../defineService";
import { googleOAuth } from "../_shared/google";
import {
  actions as docsActions,
  app as docsApp,
} from "./index.mjs";

/**
 * Google Docs via Pipedream-as-code. Shares the Google OAuth client.
 *
 * Scopes: `documents` covers all Docs actions; `drive` is added because
 * find-document searches via the Drive API (Docs API has no file search
 * primitive) and create-document-from-template needs Drive's copy
 * primitive.
 */
export default defineService({
  id: "google_docs",
  displayName: "Google Docs",
  auth: googleOAuth({
    scope:
      "https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive",
    description: "Opens a browser to authorize Google Docs access.",
  }),
  pipedream: {
    app: docsApp,
    actions: docsActions,
    authAliases: {
      oauth_access_token: (b) => b.access_token,
    },
  },
});
