/**
 * Public surface of the DSL capability.
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/interaction-doc-dsl/spec.md
 */
export { validate, type ValidationResult } from './validate.js';
export {
  ErrorCodes,
  messageFor,
  makeError,
  type ErrorCode,
  type ValidationError
} from './errors.js';
export {
  DocSchema,
  MetaSchema,
  SectionSchema,
  BubbleSchema,
  AnchorSchema,
  DesignRefSchema,
  ScreenshotSchema,
  type Doc,
  type Meta,
  type Section,
  type Bubble,
  type Anchor,
  type DesignRef,
  type Screenshot
} from './schema.js';
