/**
 * Project template pack — the machine-readable half of
 * `<项目根>/.interaction-sop/template.json`.
 *
 * Spec: openspec/changes/template-contract-and-probe/specs/template-contract/spec.md
 *
 * A pack answers one question: given this project's own Figma template, which
 * four published library components do we render with, and which strategy does
 * each ambiguous slot follow. Style (fonts, colors, spacing, badge shape) is
 * NOT in here on purpose — it travels with the cloned components.
 */

export const TEMPLATE_PACK_SCHEMA_VERSION = 1;

// --- capabilities --------------------------------------------------------

/** Allowed values per capability. `none` / `absent` mean "this template has no such slot". */
export const CAPABILITY_VALUES = {
  overview: ['two-frames', 'single-block', 'none'],
  clusterGroups: ['slot-run', 'inline-subtitle', 'none'],
  badgeSlot: ['container', 'manual', 'none'],
  numberBadge: ['text', 'instance', 'none'],
  roleAnnotation: ['component-variant', 'inline-suffix', 'none'],
  figure: ['named-group', 'first-non-text', 'none'],
  hiddenPool: ['reuse', 'ignore', 'absent'],
  column: ['right', 'bottom']
} as const;

export type CapabilityKey = keyof typeof CAPABILITY_VALUES;

export interface Capabilities {
  overview: 'two-frames' | 'single-block' | 'none';
  clusterGroups: 'slot-run' | 'inline-subtitle' | 'none';
  badgeSlot: 'container' | 'manual' | 'none';
  numberBadge: 'text' | 'instance' | 'none';
  roleAnnotation: 'component-variant' | 'inline-suffix' | 'none';
  figure: 'named-group' | 'first-non-text' | 'none';
  hiddenPool: 'reuse' | 'ignore' | 'absent';
  column: 'right' | 'bottom';
}

/**
 * Defaults are, by construction, equivalent to the official `1:14` template —
 * so "unknown project" still renders something rather than refusing, and
 * `1:14` itself needs zero configuration.
 */
export const DEFAULT_CAPABILITIES: Capabilities = {
  overview: 'two-frames',
  clusterGroups: 'slot-run',
  badgeSlot: 'container',
  numberBadge: 'text',
  roleAnnotation: 'component-variant',
  figure: 'named-group',
  hiddenPool: 'ignore',
  column: 'right'
};

export const CAPABILITY_KEYS = Object.keys(CAPABILITY_VALUES) as CapabilityKey[];

// --- pack shape ----------------------------------------------------------

/** The four independently importable library components. */
export interface ComponentKeys {
  top: string | null;
  chapter: string | null;
  cluster: string | null;
  /** Optional: templates without a trailing block simply omit it. */
  footer: string | null;
}

export const COMPONENT_KEY_FIELDS = ['top', 'chapter', 'cluster', 'footer'] as const;

/**
 * How a non-default anchor is located. Default names (`#Name`, `正文/规则`, …)
 * are not written to the pack at all — absence means "use the contract name".
 */
export interface AnchorSpec {
  kind: 'name' | 'plugin-data' | 'invisible-frame';
  value: string;
}

export interface TemplateSource {
  fileKey: string;
  nodeIds: string[];
  /** `sha256:…` over structural shape only, never over text. */
  fingerprint?: string;
}

/**
 * 几何与色彩：不算能力，但决定观感。
 *
 * 全部可缺省——缺了就用手里的常量，老包因此零影响。
 * `bubbleGrid` 按**主图比例**（0–1）存，模板换尺寸时网格自动跟着缩放。
 */
export interface TemplateGeometry {
  docBackground?: string;
  chapterWidth?: number;
  mainImage?: { width: number; height: number };
  placeholder?: { fill: string; stroke: string };
  bubbleGrid?: Array<{ x: number; y: number }>;
  badgeSize?: { width: number; height: number };
  rootGap?: number;
  /**
   * 文档根帧的内边距。
   *
   * 原稿的文档常常比章节宽一圈（蛋仔：内容 2205、外面还有 60 的底边），
   * 那圈底色不属于任何部件，编译只拿部件时会丢，渲染按这份数据补回来。
   */
  docPadding?: { top: number; right: number; bottom: number; left: number };
  /**
   * 结尾部件之前的留白。
   *
   * 原稿里是一块实心的空 FRAME（蛋仔 200 高），不是间距：根帧再用一个
   * `itemSpacing` 表达不了「只有这一处大」。
   */
  footerGap?: number;
  /**
   * 章节外面的「壳」链（外 → 内）。
   *
   * 模板的黑色边距与章节卡片底色都不是画在章节里的：外面套了几层带 padding
   * 和填充的框（`官方1.14`：`Comp_1` pad 64 / `#000000`，`需求目标` pad 64 /
   * `#161616`）。编译只拿最里层的章节时这些都会丢，渲染必须按这份数据套回去。
   */
  sectionShell?: Array<{
    padding: { top: number; right: number; bottom: number; left: number };
    fill?: string;
  }>;
}

export interface TemplatePack {
  schema_version: number;
  project?: string;
  source?: TemplateSource;
  components: ComponentKeys;
  capabilities: Capabilities;
  anchors: Record<string, AnchorSpec>;
  /**
   * 文档底色（`#rrggbb`）。模板身份的一部分：蛋仔这类深色稿在白色画布上整篇
   * 文字都看不清。不写在配置里就得靠渲染去猜，所以由编译期从原稿根节点抄下来。
   */
  docBackground?: string;
  /** 几何与色彩（编译期实测；缺省 = 渲染期默认值）。 */
  geometry?: TemplateGeometry;
  /** Relative path of the human-readable writing contract. */
  mdContract?: string;
}

export interface ParseTemplatePackOk {
  ok: true;
  pack: TemplatePack;
  /** Errors that did not block parsing (e.g. unknown extra top-level keys). */
  warnings: string[];
}

export interface ParseTemplatePackErr {
  ok: false;
  errors: string[];
}

export type ParseTemplatePackResult = ParseTemplatePackOk | ParseTemplatePackErr;

/**
 * `geometry` 逐项解析：坏字段只丢自己，不能连累整份包。
 * 未知字段记 warning（多半是手写配置时拼错）。
 */
function parseGeometry(raw: unknown, warnings: string[]): TemplateGeometry | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) {
    warnings.push('geometry must be an object; ignored');
    return undefined;
  }
  const out: TemplateGeometry = {};
  const drop = (key: string): void => {
    warnings.push(`geometry.${key} is malformed; ignored`);
  };

  const hex = (v: unknown): string | undefined => {
    const s = readString(v);
    return s && /^#[0-9a-fA-F]{6}$/.test(s) ? s : undefined;
  };
  const size = (v: unknown): { width: number; height: number } | undefined => {
    if (!isRecord(v)) return undefined;
    const w = v['width'];
    const h = v['height'];
    if (typeof w !== 'number' || typeof h !== 'number' || w <= 0 || h <= 0) return undefined;
    return { width: w, height: h };
  };

  const bg = hex(raw['docBackground']);
  if (bg) out.docBackground = bg;
  else if (raw['docBackground'] !== undefined) drop('docBackground');

  const cw = raw['chapterWidth'];
  if (typeof cw === 'number' && cw > 0) out.chapterWidth = cw;
  else if (cw !== undefined) drop('chapterWidth');

  const mi = size(raw['mainImage']);
  if (mi) out.mainImage = mi;
  else if (raw['mainImage'] !== undefined) drop('mainImage');

  const ph = raw['placeholder'];
  if (isRecord(ph)) {
    const fill = hex(ph['fill']);
    const stroke = hex(ph['stroke']);
    if (fill && stroke) out.placeholder = { fill, stroke };
    else drop('placeholder');
  } else if (ph !== undefined) drop('placeholder');

  const grid = raw['bubbleGrid'];
  if (Array.isArray(grid)) {
    const points = grid
      .map((p) => {
        if (!isRecord(p)) return undefined;
        const x = p['x'];
        const y = p['y'];
        if (typeof x !== 'number' || typeof y !== 'number') return undefined;
        return { x, y };
      })
      .filter((p): p is { x: number; y: number } => p !== undefined);
    if (points.length === grid.length && points.length > 0) out.bubbleGrid = points;
    else drop('bubbleGrid');
  } else if (grid !== undefined) drop('bubbleGrid');

  const bs = size(raw['badgeSize']);
  if (bs) out.badgeSize = bs;
  else if (raw['badgeSize'] !== undefined) drop('badgeSize');

  const rg = raw['rootGap'];
  if (typeof rg === 'number' && rg >= 0) out.rootGap = rg;
  else if (rg !== undefined) drop('rootGap');

  const dp = raw['docPadding'];
  if (isRecord(dp)) {
    const sides = ['top', 'right', 'bottom', 'left'] as const;
    const ok = sides.every((k) => typeof dp[k] === 'number' && (dp[k] as number) >= 0);
    if (ok) {
      out.docPadding = {
        top: dp['top'] as number,
        right: dp['right'] as number,
        bottom: dp['bottom'] as number,
        left: dp['left'] as number
      };
    } else drop('docPadding');
  } else if (dp !== undefined) drop('docPadding');

  const fg = raw['footerGap'];
  if (typeof fg === 'number' && fg >= 0) out.footerGap = fg;
  else if (fg !== undefined) drop('footerGap');

  const shell = raw['sectionShell'];
  if (Array.isArray(shell)) {
    const chain = shell.filter(
      (
        s
      ): s is {
        padding: { top: number; right: number; bottom: number; left: number };
        fill?: string;
      } =>
        isRecord(s) &&
        isRecord(s['padding']) &&
        ['top', 'right', 'bottom', 'left'].every(
          (k) => typeof (s['padding'] as Record<string, unknown>)[k] === 'number' &&
            ((s['padding'] as Record<string, unknown>)[k] as number) >= 0
        ) &&
        (s['fill'] === undefined || /^#[0-9a-fA-F]{6}$/.test(String(s['fill'])))
    );
    if (chain.length === shell.length && chain.length > 0) out.sectionShell = chain;
    else drop('sectionShell');
  } else if (shell !== undefined) drop('sectionShell');

  return Object.keys(out).length > 0 ? out : undefined;
}

// --- parsing -------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

/**
 * Validate + fill defaults. Never throws: callers decide whether a failure is
 * fatal. Unknown capabilities and out-of-range values are hard errors —
 * silently defaulting there would render the wrong document shape.
 */
export function parseTemplatePack(raw: unknown): ParseTemplatePackResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(raw)) {
    return { ok: false, errors: ['template pack must be a JSON object'] };
  }

  const version = raw['schema_version'];
  if (version !== TEMPLATE_PACK_SCHEMA_VERSION) {
    errors.push(
      `schema_version must be ${TEMPLATE_PACK_SCHEMA_VERSION} (got ${JSON.stringify(version)})`
    );
  }

  // capabilities
  const capabilities: Capabilities = { ...DEFAULT_CAPABILITIES };
  const rawCaps = raw['capabilities'];
  if (rawCaps !== undefined) {
    if (!isRecord(rawCaps)) {
      errors.push('capabilities must be an object');
    } else {
      for (const [key, value] of Object.entries(rawCaps)) {
        if (!(CAPABILITY_KEYS as string[]).includes(key)) {
          errors.push(`unknown capability "${key}" (known: ${CAPABILITY_KEYS.join(', ')})`);
          continue;
        }
        const allowed = CAPABILITY_VALUES[key as CapabilityKey] as readonly string[];
        if (typeof value !== 'string' || !allowed.includes(value)) {
          errors.push(
            `capabilities.${key} must be one of ${allowed.join(' / ')} (got ${JSON.stringify(value)})`
          );
          continue;
        }
        (capabilities as unknown as Record<string, string>)[key] = value;
      }
    }
  }

  // components
  const components: ComponentKeys = { top: null, chapter: null, cluster: null, footer: null };
  const rawComponents = raw['components'];
  if (rawComponents !== undefined) {
    if (!isRecord(rawComponents)) {
      errors.push('components must be an object');
    } else {
      for (const field of COMPONENT_KEY_FIELDS) {
        const value = rawComponents[field];
        if (value === undefined || value === null) continue;
        const key = readString(value);
        if (!key) {
          errors.push(`components.${field} must be a non-empty string or null`);
          continue;
        }
        components[field] = key;
      }
      for (const key of Object.keys(rawComponents)) {
        if (!(COMPONENT_KEY_FIELDS as readonly string[]).includes(key)) {
          warnings.push(`unknown components key "${key}" ignored`);
        }
      }
    }
  }

  // anchors
  const anchors: Record<string, AnchorSpec> = {};
  const rawAnchors = raw['anchors'];
  if (rawAnchors !== undefined) {
    if (!isRecord(rawAnchors)) {
      errors.push('anchors must be an object');
    } else {
      for (const [slot, spec] of Object.entries(rawAnchors)) {
        if (!isRecord(spec)) {
          errors.push(`anchors.${slot} must be an object`);
          continue;
        }
        const kind = spec['kind'];
        const value = readString(spec['value']);
        if (kind !== 'name' && kind !== 'plugin-data' && kind !== 'invisible-frame') {
          errors.push(`anchors.${slot}.kind must be name / plugin-data / invisible-frame`);
          continue;
        }
        if (!value) {
          errors.push(`anchors.${slot}.value must be a non-empty string`);
          continue;
        }
        anchors[slot] = { kind, value };
      }
    }
  }

  // source
  let source: TemplateSource | undefined;
  const rawSource = raw['source'];
  if (rawSource !== undefined) {
    if (!isRecord(rawSource)) {
      errors.push('source must be an object');
    } else {
      const fileKey = readString(rawSource['fileKey']);
      const nodeIdsRaw = rawSource['nodeIds'];
      if (!fileKey) errors.push('source.fileKey must be a non-empty string');
      if (!Array.isArray(nodeIdsRaw) || nodeIdsRaw.length === 0) {
        errors.push('source.nodeIds must be a non-empty array');
      }
      const nodeIds = Array.isArray(nodeIdsRaw)
        ? nodeIdsRaw.map((n) => readString(n)).filter((n): n is string => Boolean(n))
        : [];
      source = { fileKey: fileKey ?? '', nodeIds };
      const fp = readString(rawSource['fingerprint']);
      if (fp) source.fingerprint = fp;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const docBackground = readString(raw['docBackground']);
  if (docBackground !== undefined && !/^#[0-9a-fA-F]{6}$/.test(docBackground)) {
    return { ok: false, errors: [`docBackground must look like #rrggbb (got ${JSON.stringify(docBackground)})`] };
  }

  const pack: TemplatePack = {
    schema_version: TEMPLATE_PACK_SCHEMA_VERSION,
    components,
    capabilities,
    anchors
  };
  if (docBackground) pack.docBackground = docBackground;
  const geometry = parseGeometry(raw['geometry'], warnings);
  if (geometry) pack.geometry = geometry;
  const project = readString(raw['project']);
  if (project) pack.project = project;
  if (source) pack.source = source;
  const mdContract = readString(raw['mdContract']);
  if (mdContract) pack.mdContract = mdContract;

  return { ok: true, pack, warnings };
}
