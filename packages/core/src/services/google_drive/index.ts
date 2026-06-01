import { defineService } from "../../defineService";
import { googleOAuth } from "../_shared/google";
import {
  actions as driveActions,
  app as driveApp,
} from "./index.mjs";

/**
 * Google Drive via Pipedream-as-code. Shares the Google OAuth client.
 *
 * Scope: `drive` covers full read + write across the user's Drive.
 * Use `drive.file` instead if you only want access to files this app
 * creates — note that list-files / find-file would then only see
 * those files.
 */
export default defineService({
  id: "google_drive",
  displayName: "Google Drive",
  auth: googleOAuth({
    scope: "https://www.googleapis.com/auth/drive",
    description: "Opens a browser to authorize Google Drive access.",
  }),
  pipedream: {
    app: driveApp,
    actions: driveActions,
    authAliases: {
      oauth_access_token: (b) => b.access_token,
    },
  },
});
