/**
 * Every command emits a single JSON value to stdout on success, and an
 * `{ error: string }` object to stderr on failure. Agents parse it the
 * same way the MCP server returns tool results — one consistent shape
 * across both surfaces. Trailing newline so line-oriented `jq` works.
 */

export function emitOk(value: unknown): number {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  return 0;
}

export function emitErr(message: string, extras?: Record<string, unknown>): number {
  const payload = extras ? { error: message, ...extras } : { error: message };
  process.stderr.write(`${JSON.stringify(payload)}\n`);
  return 1;
}
