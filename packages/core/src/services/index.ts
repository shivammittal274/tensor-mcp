// tensor-mcp service registry.
//
// Adding a new service:
//
//   1. Hosted-MCP vendor (vendor runs the tool code at a public URL):
//      Create `services/<id>.ts`:
//          export default defineService({
//            id: "<id>",
//            displayName: "<Display Name>",
//            auth: mcpDcrAuth(...) | staticOAuthAuth(...) | ...,
//            remote: remoteMcp("<vendor mcp url>"),
//          });
//      Add an import below.
//
//   2. Pipedream-as-code vendor (we run upstream component code in-process):
//      Create `services/<id>/`:
//          - lift the `<vendor>.app.mjs` + `actions/` from
//            github.com/PipedreamHQ/pipedream/tree/master/components/<id>
//          - add `index.mjs` barrel that exports { app, actions }
//          - add `index.ts` with `defineService({ pipedream: { app, actions, authAliases } })`
//      Add an import below + the vendor SDK to `packages/core/package.json`.
//
// Strategic direction: as more vendors ship hosted MCP endpoints, Pipedream
// services migrate to remote. Migration is a one-line change to the
// service's `defineService({...})` entry.

import type { Service } from "../defineService";
import asana from "./asana";
import calCom from "./cal-com";
import confluence from "./confluence";
import jira from "./jira";
import linear from "./linear";
import notion from "./notion";
import slack from "./slack";

const ALL: Service[] = [linear, notion, jira, confluence, asana, calCom, slack];

export const SERVICES: Record<string, Service> = Object.fromEntries(
  ALL.map((s) => [s.id, s]),
);

export function getService(id: string): Service | undefined {
  return SERVICES[id];
}

export function listServices(): Service[] {
  return ALL;
}

/**
 * Services that can be connected today vs. those waiting on configuration
 * (e.g. a static OAuth client_id env var that hasn't been set yet).
 */
export function listConnectableServices(): Service[] {
  return ALL.filter(
    (s) =>
      !s.auth.describe().instructions.toLowerCase().includes("not configured"),
  );
}
