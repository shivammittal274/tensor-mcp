import { defineService } from "../../defineService";
import { googleOAuth } from "../_shared/google";
import {
  actions as sheetsActions,
  app as sheetsApp,
} from "./index.mjs";

/**
 * Google Sheets via Pipedream-as-code. Shares the Google OAuth client.
 *
 * Scopes: `spreadsheets` covers all Sheets data actions; `drive` is
 * required because list-spreadsheets searches via the Drive API.
 */
export default defineService({
  id: "google_sheets",
  displayName: "Google Sheets",
  auth: googleOAuth({
    scope:
      "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive",
    description: "Opens a browser to authorize Google Sheets access.",
  }),
  pipedream: {
    app: sheetsApp,
    actions: sheetsActions,
    authAliases: {
      oauth_access_token: (b) => b.access_token,
    },
  },
});
