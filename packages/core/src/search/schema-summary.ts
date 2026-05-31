/**
 * Compact summary of a JSON-Schema input shape — just enough for an agent
 * (or a human glancing at `tensor-mcp search`) to call the tool correctly
 * the first time. Avoids round-trips like "call → 'missing required field
 * owner' → call again".
 */

export interface ParamSummary {
  name: string;
  /** JSON-schema "type". `array`/`object` get their element kind appended. */
  type: string;
  required: boolean;
  /** Verbatim from the schema's `description`, if present. */
  description?: string;
  /** From `enum`, if a small enum (≤8 values). */
  enum?: string[];
}

export interface InputShape {
  required: ParamSummary[];
  optional: ParamSummary[];
}

interface RawProperty {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  items?: RawProperty;
  properties?: Record<string, RawProperty>;
}

interface RawSchema {
  type?: string;
  required?: string[];
  properties?: Record<string, RawProperty>;
}

/**
 * Pull required+optional params from a JSON Schema. Robust to schemas with
 * no `properties` (returns empty lists). Sorted alphabetically within each
 * bucket so the output is deterministic.
 */
export function summarizeSchema(schema: unknown): InputShape {
  if (!schema || typeof schema !== "object") {
    return { required: [], optional: [] };
  }
  const s = schema as RawSchema;
  const requiredSet = new Set(s.required ?? []);
  const props = s.properties ?? {};

  const required: ParamSummary[] = [];
  const optional: ParamSummary[] = [];
  for (const [name, prop] of Object.entries(props)) {
    const summary = summarizeProperty(name, prop, requiredSet.has(name));
    if (summary.required) required.push(summary);
    else optional.push(summary);
  }
  required.sort((a, b) => a.name.localeCompare(b.name));
  optional.sort((a, b) => a.name.localeCompare(b.name));
  return { required, optional };
}

function summarizeProperty(
  name: string,
  prop: RawProperty,
  isRequired: boolean,
): ParamSummary {
  const summary: ParamSummary = {
    name,
    type: describeType(prop),
    required: isRequired,
  };
  if (prop.description) summary.description = prop.description.trim();
  if (Array.isArray(prop.enum) && prop.enum.length > 0 && prop.enum.length <= 8) {
    summary.enum = prop.enum.map((v) => String(v));
  }
  return summary;
}

function describeType(prop: RawProperty): string {
  const t = Array.isArray(prop.type)
    ? prop.type.filter((x) => x !== "null").join("|")
    : prop.type;
  if (!t) return "any";
  if (t === "array" && prop.items) {
    return `array<${describeType(prop.items)}>`;
  }
  return t;
}
