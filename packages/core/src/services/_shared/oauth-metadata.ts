import type { AuthorizationServerMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";

// Hardcoded AS metadata for vendors that don't expose `.well-known/oauth-authorization-server`
// (RFC 8414). Skipping discovery removes a network round-trip during connect
// and lets us declare scope in the service file. Update the URLs from the
// vendor's developer docs if they change their endpoints.

export const SLACK_AS_METADATA: AuthorizationServerMetadata = {
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

export const GOOGLE_AS_METADATA: AuthorizationServerMetadata = {
  issuer: "https://accounts.google.com",
  authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  token_endpoint: "https://oauth2.googleapis.com/token",
  response_types_supported: ["code"],
  code_challenge_methods_supported: ["S256", "plain"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  token_endpoint_auth_methods_supported: [
    "client_secret_post",
    "client_secret_basic",
  ],
};

export const MICROSOFT_AS_METADATA: AuthorizationServerMetadata = {
  issuer: "https://login.microsoftonline.com/common/v2.0",
  authorization_endpoint:
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  token_endpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
  response_types_supported: ["code"],
  code_challenge_methods_supported: ["S256"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  token_endpoint_auth_methods_supported: [
    "client_secret_post",
    "client_secret_basic",
  ],
};

export const DISCORD_AS_METADATA: AuthorizationServerMetadata = {
  issuer: "https://discord.com",
  authorization_endpoint: "https://discord.com/oauth2/authorize",
  token_endpoint: "https://discord.com/api/oauth2/token",
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  token_endpoint_auth_methods_supported: ["client_secret_post"],
};
