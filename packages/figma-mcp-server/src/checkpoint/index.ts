/**
 * Public surface of the engine-checkpoint capability.
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/engine-checkpoint/spec.md
 */
export {
  CheckpointStore,
  CheckpointError,
  CheckpointErrorCodes,
  type CheckpointErrorCode,
  type PhaseCheckpoint,
  type CheckpointStoreOptions
} from './store.js';
export { hash, stableStringify } from './hash.js';
