import { defineService } from "../../defineService";
import { googleOAuth } from "../_shared/google";
import { actions as gmailActions, app as gmailApp } from "./index.mjs";

/**
 * Gmail via Pipedream-as-code. Shares the Google OAuth client (config
 * in `_shared/google.ts`) with every other tensor-mcp Google service.
 *
 * Scope: `gmail.modify` covers read + send + label + archive. Use
 * `gmail.full` instead if you need delete.
 */
export default defineService({
  id: "gmail",
  displayName: "Gmail",
  auth: googleOAuth({
    scope: "https://www.googleapis.com/auth/gmail.modify",
    description: "Opens a browser to authorize Gmail access via Google.",
  }),
  pipedream: {
    app: gmailApp,
    actions: gmailActions,
    authAliases: {
      oauth_access_token: (b) => b.access_token,
    },
  },
});
