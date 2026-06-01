import { defineService } from "../../defineService";
import { googleOAuth } from "../_shared/google";
import {
  actions as calendarActions,
  app as calendarApp,
} from "./index.mjs";

/**
 * Google Calendar via Pipedream-as-code. Shares the Google OAuth
 * client with every other tensor-mcp Google service.
 *
 * Scope: `calendar` covers reading + creating + updating calendars
 * and events. (Narrower `calendar.events` would suffice for event-only
 * flows but excludes list-calendars.)
 */
export default defineService({
  id: "google_calendar",
  displayName: "Google Calendar",
  auth: googleOAuth({
    scope: "https://www.googleapis.com/auth/calendar",
    description: "Opens a browser to authorize Google Calendar access.",
  }),
  pipedream: {
    app: calendarApp,
    actions: calendarActions,
    authAliases: {
      oauth_access_token: (b) => b.access_token,
    },
  },
});
