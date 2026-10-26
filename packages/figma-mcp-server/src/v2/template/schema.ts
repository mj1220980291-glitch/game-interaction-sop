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

export interface TemplatePack {
  schema_version: number;
  project?: string;
  source?: TemplateSource;
  components: ComponentKeys;
  capabilities: Capabilities;
  anchors: Record<string, AnchorSpec>;
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

  const pack: TemplatePack = {
    schema_version: TEMPLATE_PACK_SCHEMA_VERSION,
    components,
    capabilities,
    anchors
  };
  const project = readString(raw['project']);
  if (project) pack.project = project;
  if (source) pack.source = source;
  const mdContract = readString(raw['mdContract']);
  if (mdContract) pack.mdContract = mdContract;

  return { ok: true, pack, warnings };
}
