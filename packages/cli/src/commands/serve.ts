import { runMcpServer } from "@tensor-mcp/runtime";

export async function runServe(_args: string[]): Promise<number> {
  try {
    await runMcpServer();
    return 0;
  } catch (err) {
    process.stderr.write(
      `tensor-mcp serve: ${(err as Error).message}\n`,
    );
    return 1;
  }
}
