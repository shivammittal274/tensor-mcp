/**
 * Activepieces `@activepieces/shared` shim.
 *
 * We only re-export the symbols lifted pieces reach for at runtime: a few
 * enums + the `assert*` / `isNil` / `isEmpty` helpers. Webhook / trigger
 * type aliases are typed as `any` since triggers aren't executed by
 * tensor-mcp in this POC.
 */

export enum AppConnectionType {
  OAUTH2 = "OAUTH2",
  CLOUD_OAUTH2 = "CLOUD_OAUTH2",
  PLATFORM_OAUTH2 = "PLATFORM_OAUTH2",
  BASIC_AUTH = "BASIC_AUTH",
  CUSTOM_AUTH = "CUSTOM_AUTH",
  SECRET_TEXT = "SECRET_TEXT",
  NO_AUTH = "NO_AUTH",
}

export enum PieceCategory {
  COMMUNICATION = "COMMUNICATION",
  PRODUCTIVITY = "PRODUCTIVITY",
  DEVELOPER_TOOLS = "DEVELOPER_TOOLS",
  MARKETING = "MARKETING",
  SALES_AND_CRM = "SALES_AND_CRM",
  ACCOUNTING = "ACCOUNTING",
  FORMS_AND_SURVEYS = "FORMS_AND_SURVEYS",
  ARTIFICIAL_INTELLIGENCE = "ARTIFICIAL_INTELLIGENCE",
  BUSINESS_INTELLIGENCE = "BUSINESS_INTELLIGENCE",
  COMMERCE = "COMMERCE",
  CONTENT_AND_FILES = "CONTENT_AND_FILES",
  CUSTOMER_SUPPORT = "CUSTOMER_SUPPORT",
  HUMAN_RESOURCES = "HUMAN_RESOURCES",
  IT_OPERATIONS = "IT_OPERATIONS",
  PAYMENT_PROCESSING = "PAYMENT_PROCESSING",
  PROJECT_MANAGEMENT = "PROJECT_MANAGEMENT",
  CORE = "CORE",
}

export enum ExecutionType {
  BEGIN = "BEGIN",
  RESUME = "RESUME",
}

export enum TriggerStrategy {
  POLLING = "POLLING",
  WEBHOOK = "WEBHOOK",
  APP_WEBHOOK = "APP_WEBHOOK",
  MANUAL = "MANUAL",
}

export enum TriggerTestStrategy {
  SIMULATION = "SIMULATION",
  TEST_FUNCTION = "TEST_FUNCTION",
}

export enum WebhookHandshakeStrategy {
  NONE = "NONE",
  HEADER_PRESENT = "HEADER_PRESENT",
  QUERY_PRESENT = "QUERY_PRESENT",
  BODY_PARAM_PRESENT = "BODY_PARAM_PRESENT",
}

export enum MarkdownVariant {
  INFO = "INFO",
  WARNING = "WARNING",
  ERROR = "ERROR",
  TIP = "TIP",
}

export function isNil<T>(v: T | null | undefined): v is null | undefined {
  return v == null;
}

export function isEmpty<T>(v: T | null | undefined): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

export function assertNotNullOrUndefined<T>(
  value: T,
  fieldName: string,
): asserts value is NonNullable<T> {
  if (value == null) {
    throw new Error(`${fieldName} is required`);
  }
}

// Structural placeholders — lifted Slack uses these as type imports only.
// biome-ignore lint/suspicious/noExplicitAny: structural placeholder
export type AppConnectionValue<_T = any, _U = any> = any;
// biome-ignore lint/suspicious/noExplicitAny: structural placeholder
export type EventPayload = any;
// biome-ignore lint/suspicious/noExplicitAny: structural placeholder
export type ParseEventResponse = any;
// biome-ignore lint/suspicious/noExplicitAny: structural placeholder
export type WebhookHandshakeConfiguration = any;
// biome-ignore lint/suspicious/noExplicitAny: structural placeholder
export type TriggerPayload = any;
// biome-ignore lint/suspicious/noExplicitAny: structural placeholder
export type ResumePayload = any;
// biome-ignore lint/suspicious/noExplicitAny: structural placeholder
export type AgentPieceTool = any;
// biome-ignore lint/suspicious/noExplicitAny: structural placeholder
export type RespondResponse = any;
