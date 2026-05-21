/**
 * Backend abstraction over figma-console-mcp's `figma_execute` and
 * `figma_get_status`. We do NOT take a hard dependency on the MCP client
 * library here — the engine accepts any object satisfying this interface,
 * which keeps the executor unit-testable with an in-process fake.
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/figma-executor/spec.md
 */

export interface ExecuteRequest {
  code: string;
  timeout?: number;
}

export interface ExecuteResponse {
  /** Whatever the JS `return ...` produced. JSON-serializable. */
  result: unknown;
  /** Optional analysis blob from figma-console-mcp. */
  resultAnalysis?: { warning?: string; [k: string]: unknown };
}

export interface StatusResponse {
  ok: boolean;
  /** mcp version reported by figma-console */
  version?: string;
  /** raw status payload, for debugging */
  raw?: unknown;
}

export interface FigmaExecuteBackend {
  execute(req: ExecuteRequest): Promise<ExecuteResponse>;
  status(): Promise<StatusResponse>;
}
