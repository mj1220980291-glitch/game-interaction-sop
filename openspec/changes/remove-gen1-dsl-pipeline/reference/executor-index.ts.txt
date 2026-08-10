/**
 * Public surface of the figma-executor capability.
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/figma-executor/spec.md
 */
export {
  Executor,
  ExecutorError,
  ExecutorErrorCodes,
  type ExecutorErrorCode,
  type ExecutionLogEntry,
  type ExecutorOptions
} from './executor.js';
export type {
  FigmaExecuteBackend,
  ExecuteRequest,
  ExecuteResponse,
  StatusResponse
} from './backend.js';
export { TEMPLATE_NAMES, type TemplateName, type TemplateParamMap } from '../templates/index.js';
