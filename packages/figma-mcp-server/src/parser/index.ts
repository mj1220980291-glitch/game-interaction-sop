/**
 * Public surface of the parser capability.
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/dsl-parser/spec.md
 */
export {
  parseMarkdown,
  extractDesignRefs,
  ParseError,
  type ParsedDoc,
  type ParsedSection,
  type ParsedBubble,
  type ParsedDesignRef,
  type ParsedScreenshot,
  type ParseWarning
} from './markdown.js';
