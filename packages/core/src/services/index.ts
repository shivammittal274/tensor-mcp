// tensor-mcp service registry.
//
// Adding a new service:
//
//   1. Hosted-MCP vendor (vendor runs the tool code at a public URL):
//      Create `services/<id>.ts`:
//          export default defineService({
//            id: "<id>",
//            displayName: "<Display Name>",
//            auth: dcrAuth(...) | oauth(...) | apiKeyAuth(...) | ...,
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
import anthropic from "./anthropic";
import asana from "./asana";
import braveSearchApi from "./brave_search_api";
import calCom from "./cal-com";
import confluence from "./confluence";
import discordBot from "./discord_bot";
import exa from "./exa";
import firecrawl from "./firecrawl";
import github from "./github";
import gitlab from "./gitlab";
import gmail from "./gmail";
import googleCalendar from "./google_calendar";
import googleDocs from "./google_docs";
import googleDrive from "./google_drive";
import googleMeet from "./google_meet";
import googleSheets from "./google_sheets";
import jira from "./jira";
import linear from "./linear";
import notion from "./notion";
import posthog from "./posthog";
import slackV2 from "./slack_v2";
import stripe from "./stripe";
import supabase from "./supabase";
import tavily from "./tavily";
import telegramBotApi from "./telegram_bot_api";
import youtubeDataApi from "./youtube_data_api";

// Folder name = upstream Pipedream component name = service id. This 1:1
// mapping lets `scripts/sync-pipedream.ts` re-lift any service from
// github.com/PipedreamHQ/pipedream/components/<id>/ without per-service
// rename tables. Display names stay friendly via Service.displayName.
const ALL: Service[] = [
  linear,
  notion,
  jira,
  confluence,
  asana,
  calCom,
  slackV2,
  github,
  anthropic,
  braveSearchApi,
  tavily,
  firecrawl,
  gmail,
  googleCalendar,
  googleDrive,
  googleDocs,
  googleSheets,
  googleMeet,
  youtubeDataApi,
  discordBot,
  telegramBotApi,
  stripe,
  exa,
  gitlab,
  posthog,
  supabase,
];

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
 * (e.g. an OAuth client_id env var that hasn't been set yet). Uses each
 * strategy's typed `isConfigured()` — no string-matching on prose.
 */
export function listConnectableServices(): Service[] {
  return ALL.filter((s) => s.auth.isConfigured().ok);
}
