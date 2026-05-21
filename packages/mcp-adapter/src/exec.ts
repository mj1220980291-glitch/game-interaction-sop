/**
 * The `FigmaExec` contract.
 *
 * The adapter never calls figma-console MCP directly. Instead the caller
 * supplies an `exec(code)` function that:
 *   1. Takes a JS source string
 *   2. Runs it inside the Figma plugin sandbox (via figma-console MCP's
 *      `figma_execute` tool, or any compatible tool that returns the
 *      same {success, result, error} shape)
 *   3. Returns a Promise resolving to the value produced by the script's
 *      top-level `return`
 *
 * Example wiring inside an AI agent conversation:
 *
 *   import { createFigmaConsoleBackend } from '@game-interaction-sop/mcp-adapter';
 *
 *   const backend = createFigmaConsoleBackend({
 *     exec: async (code) => {
 *       const resp = await use_mcp_tool(                 // agent-side call
 *         'figma-console', 'figma_execute', { code }
 *       );
 *       if (!resp.success) throw new Error(resp.error);
 *       return resp.result;
 *     }
 *   });
 */

export type FigmaExec = (code: string) => Promise<unknown>;

/**
 * Adapter-level error with enough context to explain which script failed.
 */
export class FigmaExecError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly code: string,
    public readonly cause?: unknown,
    /**
     * Set when the underlying MCP bridge timed out (e.g. the figma-console
     * 7s WebSocket EXECUTE_CODE limit). Callers (especially the engine's
     * image-apply path) can use this to downgrade to "leave placeholder"
     * without aborting the whole render. See pitfalls Bug 15.
     */
    public readonly isBridgeTimeout: boolean = false
  ) {
    super(message);
    this.name = 'FigmaExecError';
  }
}

/**
 * Recognize bridge timeout patterns across MCP implementations.
 * We look for the classic figma-console message plus a few synonyms.
 */
function detectBridgeTimeout(raw: unknown): boolean {
  const msg =
    raw instanceof Error
      ? raw.message
      : typeof raw === 'string'
      ? raw
      : JSON.stringify(raw ?? '');
  return (
    /EXECUTE_CODE timed out/i.test(msg) ||
    /BRIDGE_COMMAND_TIMEOUT/i.test(msg) ||
    /WebSocket command .* timed out/i.test(msg)
  );
}

/**
 * Wrap a raw `exec` with uniform error handling. Every backend method
 * routes its JS body through `runScript` so failures carry the operation
 * name for debugging.
 */
export async function runScript<T = unknown>(
  exec: FigmaExec,
  operation: string,
  code: string
): Promise<T> {
  try {
    const result = await exec(code);
    return result as T;
  } catch (err) {
    const timeout = detectBridgeTimeout(err);
    throw new FigmaExecError(
      `figma-console exec failed at "${operation}"${timeout ? ' (bridge timeout)' : ''}: ${
        err instanceof Error ? err.message : String(err)
      }`,
      operation,
      code,
      err,
      timeout
    );
  }
}
