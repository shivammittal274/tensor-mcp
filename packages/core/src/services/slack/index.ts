import { staticOAuthAuth } from "../../auth";
import { defineService } from "../../defineService";
import { SLACK_AS_METADATA } from "../_shared/oauth-metadata";
import {
  actions as slackActions,
  app as slackApp,
} from "./index.mjs";

const env = (key: string): string => process.env[key] ?? "";

/**
 * Slack via Pipedream-as-code. We register a tensor-mcp app at
 * https://api.slack.com/apps (one-time) and ship the client_id via
 * `TENSOR_MCP_SLACK_CLIENT_ID`. The user goes through Slack's OAuth flow,
 * tokens land in the OS keychain, and every tool call runs Pipedream's
 * `slack_v2` component code in-process against `slack.com/api/`.
 */
export default defineService({
  id: "slack",
  displayName: "Slack",
  auth: staticOAuthAuth({
    authServerUrl: "https://slack.com",
    authServerMetadata: SLACK_AS_METADATA,
    clientId: env("TENSOR_MCP_SLACK_CLIENT_ID"),
    clientSecret: process.env.TENSOR_MCP_SLACK_CLIENT_SECRET,
    scope:
      "chat:write,channels:read,channels:history,users:read,search:read.public",
    registerAppUrl: "https://api.slack.com/apps",
    description:
      "Opens a browser to install the Slack app into your workspace.",
  }),
  pipedream: {
    app: slackApp,
    actions: slackActions,
    // Pipedream's `slack_v2` component reads four `$auth.<key>` slots:
    //   • `oauth_access_token` — user OAuth token (chat.postMessage as user)
    //   • `bot_token`          — bot token (chat.postMessage as bot)
    //   • `oauth_uid`          — Slack user id (rarely used)
    //   • `base_url`           — Slack API root
    // We resolve these from the stored TokenBundle. The bot token isn't
    // returned by Slack's OAuth flow in our minimal scope set; we fall
    // through to the user token, which lets `chat.postMessage` work as the
    // installer rather than as a bot.
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
