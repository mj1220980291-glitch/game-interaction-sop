/**
 * v2 module barrel — public API.
 *
 * The host wires a FigmaBackend implementation and calls
 * `renderV2MarkdownToFigma`.
 */

export { parseV2 } from './parser.js';
export {
  renderV2MarkdownToFigma,
  figureSlotsFromIr,
  type AssetSpec,
  type RenderInput,
  type RenderResult,
  type BubbleRecord,
  type FigureSlotRecord
} from './render.js';
export {
  parseBadgeAnchors,
  pickAnchors,
  anchorKey,
  badgeDefaultsWarning,
  isTextAnchor,
  type BadgeAnchor,
  type BadgeAnchorMap,
  type CoordBadgeAnchor,
  type TextBadgeAnchor
} from './badge-anchor.js';
export { resolveTextAnchors, type ImageRect } from './badge-resolve.js';
export { ENGINE_VERSION, REQUIRED_SKILL_VERSION } from './version.js';
export {
  checkPhase1Signoff,
  emptyPhase1Signoff,
  PHASE1_DIMENSIONS,
  type Phase1Signoff,
  type Phase1Dimension
} from './phase1-signoff.js';
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
  resolvePackWithTrace,
  loadTemplatePack,
  isDefaultTemplate,
  DEFAULT_TEMPLATE,
  DEFAULT_VARIANT_PREFIX,
  DEFAULT_LABEL_TEXT_NAME,
  type TemplateRef,
  type TemplateConfig,
  type RoleBlockConfig,
  type TemplatePackLookupOptions,
  type PackCandidate,
  type PackCandidateOrigin,
  type PackCandidateState,
  type PackResolution
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
export {
  auditPackFields,
  auditRenderedContrast,
  auditTemplatePack,
  contrastMinFromEnv,
  smokePackKeys,
  type PackKeySmoke,
  DEFAULT_CONTRAST_MIN
} from './pack-audit.js';
export { compileTemplate, type CompileReport, type CompileInput } from './compile/index.js';
export { structuralFingerprint } from './probe/fingerprint.js';
export { parseRoleBullet, type RoleBullet } from './role-block.js';
