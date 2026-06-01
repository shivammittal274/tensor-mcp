import { defineService } from "../../defineService";
import { googleOAuth } from "../_shared/google";
import {
  actions as meetActions,
  app as meetApp,
} from "./index.mjs";

/**
 * Google Meet via Pipedream-as-code. Meet scheduling actually goes
 * through the Calendar API (Pipedream's google_meet module imports
 * `@googleapis/calendar`), so we request the calendar scope.
 *
 * Single action today: `schedule_meeting` — creates a calendar event
 * with a Google Meet conferencing link attached.
 */
export default defineService({
  id: "google_meet",
  displayName: "Google Meet",
  auth: googleOAuth({
    scope: "https://www.googleapis.com/auth/calendar",
    description:
      "Opens a browser to authorize Google Meet (uses Calendar API).",
  }),
  pipedream: {
    app: meetApp,
    actions: meetActions,
    authAliases: {
      oauth_access_token: (b) => b.access_token,
    },
  },
});
