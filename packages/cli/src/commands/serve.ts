import { runMcpServer } from "@tensor-mcp/runtime";
import { SERVICES } from "@tensor-mcp/services";

export async function serveCmd(): Promise<number> {
  try {
    await runMcpServer({ services: SERVICES });
    return 0;
  } catch (err) {
    process.stderr.write(`tensor-mcp serve: ${(err as Error).message}\n`);
    return 1;
  }
}
