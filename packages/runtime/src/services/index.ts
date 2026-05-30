import linear from "./linear";
import slack from "./slack";
import gmail from "./gmail";
import type { ServiceDefinition } from "./types";

export type {
  ServiceDefinition,
  VendorConfig,
  OAuthConfig,
  DCROAuthConfig,
  StaticOAuthConfig,
} from "./types";

const ALL_SERVICES: ServiceDefinition[] = [linear, slack, gmail];

export const SERVICES: Record<string, ServiceDefinition> = Object.fromEntries(
  ALL_SERVICES.map((s) => [s.service, s]),
);

export function getService(slug: string): ServiceDefinition | undefined {
  return SERVICES[slug];
}

export function listServices(): ServiceDefinition[] {
  return ALL_SERVICES;
}

export function listOAuthCapableServices(): ServiceDefinition[] {
  return ALL_SERVICES.filter((s) => s.oauth.type !== "none");
}
