/**
 * v2 module barrel — public API.
 *
 * The host wires a FigmaBackend implementation and calls
 * `renderV2MarkdownToFigma`.
 */

export { parseV2 } from './parser.js';
export {
  renderV2MarkdownToFigma,
  type AssetSpec,
  type RenderInput,
  type RenderResult
} from './render.js';
export type {
  DocIR,
  DocHeader,
  DesignOverview,
  InterfaceSection,
  SemanticCluster,
  HardError,
  SoftWarning,
  ParseResult,
  RoleName
} from './ir.js';
export { ROLE_NAMES, HARD_ERROR_CODES, SOFT_WARNING_CODES } from './ir.js';
export type {
  FigmaBackend,
  NodeInfo,
  BoundingBox,
  FigmaNodeType
} from './figma-client.js';
export { FigmaSafetyError, SAFETY_CODES } from './figma-client.js';
export {
  TEMPLATE_FILE_KEY,
  TEMPLATE_NODE_ID,
  ROLE_COLORS,
  ROLE_TEXT_ORDER
} from './template-map.js';
export {
  resolveTemplateConfig,
  loadTemplatePack,
  isDefaultTemplate,
  DEFAULT_TEMPLATE,
  DEFAULT_VARIANT_PREFIX,
  DEFAULT_LABEL_TEXT_NAME,
  type TemplateRef,
  type TemplateConfig,
  type RoleBlockConfig,
  type TemplatePackLookupOptions
} from './template-config.js';
export {
  CAPABILITY_KEYS,
  CAPABILITY_VALUES,
  DEFAULT_CAPABILITIES,
  TEMPLATE_PACK_SCHEMA_VERSION,
  parseTemplatePack,
  type Capabilities,
  type CapabilityKey,
  type ComponentKeys,
  type AnchorSpec,
  type TemplatePack
} from './template/schema.js';
export { probeTemplate, probeFromTree, type ProbeReport, type ProbeVerdict } from './probe/index.js';
export { compileTemplate, type CompileReport, type CompileInput } from './compile/index.js';
export { structuralFingerprint } from './probe/fingerprint.js';
export { parseRoleBullet, type RoleBullet } from './role-block.js';
