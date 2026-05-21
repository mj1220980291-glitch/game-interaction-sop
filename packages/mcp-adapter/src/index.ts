/**
 * @game-interaction-sop/mcp-adapter — public API.
 *
 * Wires the engine's `FigmaBackend` interface to a figma-console (or
 * compatible) MCP `figma_execute` tool via a caller-supplied `exec`
 * function.
 */

export {
  createFigmaConsoleBackend,
  type CreateBackendOptions
} from './figma-console-backend.js';

export { FigmaExecError, type FigmaExec } from './exec.js';

// Re-export the helpers constant so advanced users can embed it inside
// their own custom scripts.
export { FIGMA_PLUGIN_HELPERS } from './plugin-helpers.js';
