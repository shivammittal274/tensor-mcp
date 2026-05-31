import { oauth } from "../../auth";
import { defineService } from "../../defineService";
import { SLACK_AS_METADATA } from "../_shared/oauth-metadata";
import { OAUTH_PORTS } from "../_shared/oauth-ports";
import {
  actions as slackActions,
  app as slackApp,
} from "./index.mjs";

/**
 * Default `client_id` for the tensor-mcp Slack OAuth app. Users can
 * override by setting `TENSOR_MCP_SLACK_CLIENT_ID`. The id is public —
 * shipping it in the binary is the standard pattern for distributed OSS
 * CLIs (see `gh`, `vercel`, `claude`, `supabase`). PKCE is enabled on
 * the app so no `client_secret` is required.
 */
const SLACK_DEFAULT_CLIENT_ID = "7212105899924.11242012298227";

/**
 * Slack via Pipedream-as-code.
 *
 * Tokens stay in the OS keychain, every API call goes from the user's
 * box direct to slack.com — Pipedream sees nothing, tensor-mcp's
 * maintainers see nothing. Each user installs our tensor-mcp Slack app
 * into their own workspace; the resulting tokens are workspace-scoped.
 *
 * Two declarative vendor quirks plus one callback:
 *   • `scopeParam: "user_scope"` — Slack rejects bot scopes (`scope=…`)
 *     when redirecting to a loopback URI. Requesting user scopes via
 *     `user_scope=…` works around it.
 *   • `redirectPort` — Slack OAuth app config requires an exact-match
 *     redirect URI; we pin one and document the matching registration.
 *   • `parseTokenResponse` — Slack's `oauth.v2.access` puts the user
 *     token under `authed_user.access_token` instead of at the top
 *     level. The callback reshapes it into OAuth-2.0 shape and stashes
 *     team/user ids in metadata for the Pipedream component's
 *     `$auth.<key>` lookups.
 */
export default defineService({
  id: "slack",
  displayName: "Slack",
  auth: oauth({
    authServerMetadata: SLACK_AS_METADATA,
    clientId:
      process.env.TENSOR_MCP_SLACK_CLIENT_ID || SLACK_DEFAULT_CLIENT_ID,
    scope:
      "chat:write,channels:read,channels:history,users:read,search:read.public",
    scopeParam: "user_scope",
    redirectPort: OAUTH_PORTS.slack,
    registerAppUrl: "https://api.slack.com/apps",
    description:
      "Opens a browser to install the Slack app into your workspace.",
    parseTokenResponse: (raw) => {
      const authedUser = raw.authed_user as Record<string, unknown> | undefined;
      if (!authedUser || typeof authedUser.access_token !== "string") {
        throw new Error(
          "Slack token response missing authed_user.access_token — " +
            "make sure your Slack app declares user scopes under " +
            '"User Token Scopes" matching the requested set.',
        );
      }
      const team = (raw.team as Record<string, unknown>) ?? {};
      return {
        tokens: {
          access_token: authedUser.access_token,
          scope:
            typeof authedUser.scope === "string" ? authedUser.scope : undefined,
        },
        metadata: {
          slack_user_id: String(authedUser.id ?? ""),
          slack_team_id: String(team.id ?? ""),
          slack_team_name: String(team.name ?? ""),
        },
      };
    },
  }),
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
