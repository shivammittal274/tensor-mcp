import { defineService } from "../../defineService";
import { slackOAuth } from "../_shared/slack";
import {
  actions as slackActions,
  app as slackApp,
} from "./index.mjs";

/**
 * Slack via Pipedream-as-code.
 *
 * Tokens stay in the OS keychain; every API call goes from the user's
 * box direct to slack.com — Pipedream sees nothing, tensor-mcp's
 * maintainers see nothing. Each user installs the tensor-mcp Slack app
 * into their own workspace via `slackOAuth()` (config in
 * `_shared/slack.ts`); the resulting tokens are workspace-scoped.
 */
export default defineService({
  id: "slack_v2",
  displayName: "Slack",
  auth: slackOAuth(),
  pipedream: {
    app: slackApp,
    actions: slackActions,
    // Pipedream's `slack_v2` component reads four `$auth.<key>` slots.
    // Slack's user-scope flow doesn't issue a separate bot token, so
    // `bot_token` falls back to the user token — fine for our scope set.
    authAliases: {
      oauth_access_token: (b) => b.access_token,
      bot_token: (b) =>
        b.metadata?.bot_token ??
        b.metadata?.slack_bot_token ??
        b.access_token,
      oauth_uid: (b) => b.metadata?.slack_user_id ?? "",
      base_url: () => "https://slack.com/api/",
    },
  },
});
