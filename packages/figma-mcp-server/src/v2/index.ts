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
