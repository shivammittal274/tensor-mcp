import type { Service } from "@tensor-mcp/core";
import gmail from "./gmail/service";
import jira from "./jira/service";
import linear from "./linear/service";
import notion from "./notion/service";
import slack from "./slack/service";

const ALL_SERVICES: Service[] = [linear, notion, jira, slack, gmail];

export const SERVICES: Record<string, Service> = Object.fromEntries(
  ALL_SERVICES.map((s) => [s.id, s]),
);

export function getService(id: string): Service | undefined {
  return SERVICES[id];
}

export function listServices(): Service[] {
  return ALL_SERVICES;
}

export function listOAuthCapableServices(): Service[] {
  return ALL_SERVICES.filter(
    (s) =>
      s.auth.method === "oauth-dcr" ||
      s.auth.method === "pat" ||
      s.auth.method === "api-key",
  ).filter((s) => !s.auth.describe().instructions.includes("not yet wired"));
}
