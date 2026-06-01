import { defineService } from "../../defineService";
import { googleOAuth } from "../_shared/google";
import {
  actions as youtubeActions,
  app as youtubeApp,
} from "./index.mjs";

/**
 * YouTube via Pipedream-as-code. Shares the Google OAuth client (config
 * in `_shared/google.ts`) with every other tensor-mcp Google service —
 * no per-vendor setup, just enable the YouTube Data API on your shared
 * Google Cloud project at
 *
 *   https://console.cloud.google.com/apis/library/youtube.googleapis.com
 *
 * Scope: `youtube` covers read + write (playlists, channel updates,
 * subscriptions). Add `youtube.upload` if we wire upload actions; today
 * the lifted Pipedream code's upload actions need it but won't be
 * reachable without the user re-authorizing.
 */
export default defineService({
  id: "youtube_data_api",
  displayName: "YouTube",
  auth: googleOAuth({
    scope: "https://www.googleapis.com/auth/youtube",
    description:
      "Opens a browser to authorize YouTube via Google. " +
      "Make sure the YouTube Data API v3 is enabled in your Google Cloud project.",
  }),
  pipedream: {
    app: youtubeApp,
    actions: youtubeActions,
    authAliases: {
      oauth_access_token: (b) => b.access_token,
    },
  },
});
