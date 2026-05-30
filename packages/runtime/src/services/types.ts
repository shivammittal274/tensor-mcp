import type { TokenBlob } from "../vault";

export interface VendorConfig {
  dir: string;
  command: string[];
  envInject?: Record<string, string>;
}

export interface DCROAuthConfig {
  type: "dcr";
  wellKnownUrl: string;
  scope: string;
}

export interface StaticOAuthConfig {
  type: "static";
  issuer?: string;
  clientId?: string;
  scope?: string;
}

export type OAuthConfig = DCROAuthConfig | StaticOAuthConfig | { type: "none" };

export interface ServiceDefinition {
  service: string;
  displayName: string;
  vendor: VendorConfig;
  oauth: OAuthConfig;
  authShape: (blob: TokenBlob) => Record<string, unknown>;
}
