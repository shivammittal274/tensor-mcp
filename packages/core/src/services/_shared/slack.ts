import type { AuthorizationServerMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  oauth,
  type AuthStrategy,
  type ParsedTokenResponse,
} from "../../auth";

/**
 * Shared Slack OAuth configuration for any tensor-mcp Slack-family
 * service. Today only `services/slack/` consumes this; if a second
 * Slack product is added later (e.g. an admin-API service) it'd live
 * next to slack/ and import the same `slackOAuth()` factory.
 *
 * The Slack OAuth flow has three vendor quirks that all live here:
 *
 *   • `scopeParam: "user_scope"` — Slack rejects bot scopes (the
 *     standard `scope=…` parameter) when the redirect URI is a
 *     loopback. Requesting user scopes via `user_scope=…` is the
 *     documented workaround.
 *
 *   • `redirectPort: 33418` — Slack OAuth app config requires an
 *     exact-match redirect URI; we pin the port. The matching entry on
 *     the Slack app's `OAuth & Permissions` page is
 *     `http://127.0.0.1:33418/callback`.
 *
 *   • `parseTokenResponse` — Slack's `oauth.v2.access` response puts
 *     the user token under `authed_user.access_token` instead of at
 *     the top level. We reshape into OAuth-2.0 shape and stash team +
 *     user ids in `metadata` for the Pipedream component's
 *     `$auth.<key>` lookups.
 *
 * To use your own Slack OAuth app: fork tensor-mcp and replace
 * SLACK_CLIENT_ID below. The id is public (Slack docs explicitly say
 * client_id can be shared; PKCE handles the auth security).
 */

const SLACK_AS_METADATA: AuthorizationServerMetadata = {
  issuer: "https://slack.com",
  authorization_endpoint: "https://slack.com/oauth/v2/authorize",
  token_endpoint: "https://slack.com/api/oauth.v2.access",
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code"],
  token_endpoint_auth_methods_supported: [
    "client_secret_post",
    "client_secret_basic",
  ],
};

const SLACK_CLIENT_ID = "7212105899924.11242012298227";

const SLACK_REDIRECT_PORT = 33418;

const SLACK_SCOPE =
  "chat:write,channels:read,channels:history,users:read,search:read.public";

function parseSlackTokenResponse(
  raw: Record<string, unknown>,
): ParsedTokenResponse {
  const authedUser = raw.authed_user as Record<string, unknown> | undefined;
  if (!authedUser || typeof authedUser.access_token !== "string") {
    throw new Error(
      "Slack token response missing authed_user.access_token — make " +
        "sure your Slack app declares user scopes under 'User Token " +
        "Scopes' matching the requested set.",
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
}

/**
 * Build the Slack OAuth strategy. Zero per-call knobs today — the
 * scope set is fixed, and the three quirks above never change between
 * Slack services. Sibling Slack services (none yet) would just call
 * `slackOAuth()` and inherit the same flow.
 */
export function slackOAuth(): AuthStrategy {
  return oauth({
    authServerMetadata: SLACK_AS_METADATA,
    clientId: SLACK_CLIENT_ID,
    scope: SLACK_SCOPE,
    scopeParam: "user_scope",
    redirectPort: SLACK_REDIRECT_PORT,
    parseTokenResponse: parseSlackTokenResponse,
    registerAppUrl: "https://api.slack.com/apps",
    description:
      "Opens a browser to install the Slack app into your workspace.",
  });
}
