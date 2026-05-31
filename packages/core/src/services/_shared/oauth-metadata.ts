import type { AuthorizationServerMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";

// Hardcoded AS metadata for vendors that don't expose
// `.well-known/oauth-authorization-server` (RFC 8414). Skipping discovery
// removes a network round-trip during connect and lets us declare scope
// in the service file. Update the URLs from the vendor's developer docs
// if they change their endpoints.
//
// Only `authorization_endpoint` and `token_endpoint` are consumed by our
// `oauth()` strategy. The other fields are kept to satisfy the SDK's
// `AuthorizationServerMetadata` type so the constants can be reused by
// any future MCP-SDK-based code path.

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

export const GITHUB_AS_METADATA: AuthorizationServerMetadata = {
  issuer: "https://github.com",
  authorization_endpoint: "https://github.com/login/oauth/authorize",
  token_endpoint: "https://github.com/login/oauth/access_token",
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code"],
  token_endpoint_auth_methods_supported: ["client_secret_post"],
};

export const NOTION_AS_METADATA: AuthorizationServerMetadata = {
  issuer: "https://api.notion.com",
  authorization_endpoint: "https://api.notion.com/v1/oauth/authorize",
  token_endpoint: "https://api.notion.com/v1/oauth/token",
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code"],
  token_endpoint_auth_methods_supported: ["client_secret_basic"],
};

export const HUBSPOT_AS_METADATA: AuthorizationServerMetadata = {
  issuer: "https://app.hubspot.com",
  authorization_endpoint: "https://app.hubspot.com/oauth/authorize",
  token_endpoint: "https://api.hubapi.com/oauth/v1/token",
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  token_endpoint_auth_methods_supported: ["client_secret_post"],
};

export const DROPBOX_AS_METADATA: AuthorizationServerMetadata = {
  issuer: "https://www.dropbox.com",
  authorization_endpoint: "https://www.dropbox.com/oauth2/authorize",
  token_endpoint: "https://api.dropboxapi.com/oauth2/token",
  response_types_supported: ["code"],
  code_challenge_methods_supported: ["S256"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  token_endpoint_auth_methods_supported: [
    "client_secret_post",
    "client_secret_basic",
  ],
};
