/**
 * 职能标记 (role-annotation) bullets.
 *
 * Markdown writes a rule that belongs to exactly one 职能 as
 *
 *     - @策划：阈值与配表由策划维护
 *
 * The renderer turns that bullet into an instance of the `职能标记` component
 * set instead of a plain `正文/规则` TEXT. Which variant is used comes from the
 * variant name (`职能标记=#策划` / `职能标记=策划`), so adding a role only needs
 * a new variant in the Figma library.
 *
 * Two sources are supported, in this order:
 *
 * 1. `roleBlock.variantKeys` — published component keys, imported by key. The
 *    only mode that works when the component set lives in another library.
 * 2. `roleBlock.componentSetId` — a COMPONENT_SET in the **render target file**.
 */

import type { FigmaBackend, NodeInfo } from './figma-client.js';
import { ROLE_NAMES, type DocIR } from './ir.js';
import type { RoleBlockConfig } from './template-config.js';

/**
 * 组件库 / 口语里的别名 → 规范角色名。`v2` 契约只认 7 个规范名，但设计稿
 * 的变体与用户口头写法常见这些别名，统一在这里归一。
 */
const ROLE_ALIASES: Record<string, string> = {
  音效: '音频',
  特效: '动效',
  vx: '动效',
  VX: '动效',
  开发: '程序'
};

const ROLE_ALT = [...ROLE_NAMES, ...Object.keys(ROLE_ALIASES)].join('|');

function canonicalRole(name: string): string | undefined {
  const role = ROLE_ALIASES[name] ?? name;
  return (ROLE_NAMES as readonly string[]).includes(role) ? role : undefined;
}

const ROLE_BULLET_RE = new RegExp(`^@(${ROLE_ALT})\\s*[：:]\\s*([\\s\\S]+)$`);

export interface RoleBullet {
  /** Role without the `@` prefix, exactly as configured in the variant name. */
  role: string;
  /** Display text, i.e. everything after `@策划：`. */
  text: string;
}

/** `- @策划：xxx` → `{ role: '策划', text: 'xxx' }`; anything else → undefined. */
export function parseRoleBullet(raw: string): RoleBullet | undefined {
  const body = raw
    .replace(/^\s*[-·•*]+\s*/, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .trim();
  const m = ROLE_BULLET_RE.exec(body);
  if (!m) return undefined;
  const role = canonicalRole(m[1]!);
  return role ? { role, text: m[2]!.trim() } : undefined;
}

/** `职能标记=#策划` → `策划`. */
export function roleOfVariantName(name: string, prefix: string): string | undefined {
  if (!name.startsWith(prefix)) return undefined;
  const suffix = name.slice(prefix.length).replace(/^#/, '').trim();
  return suffix === '' ? undefined : suffix;
}

export interface RoleBlockRuntime {
  config: RoleBlockConfig;
  /** role → variant COMPONENT node id (file mode). */
  variants: Map<string, string>;
  /** role → published variant key (library mode). Wins over `variants`. */
  variantKeys?: Map<string, string>;
  /** Warning sink; the renderer only reports each missing role once. */
  warn: (message: string) => void;
}

/** Where the variant map came from — surfaced in the render result. */
export type RoleBlockSource = 'keys' | 'set';

/**
 * Why a configured role block could not be used. Callers turn this into an
 * error code instead of the single「模板未配置组件集」sentence, which used to
 * hide four different causes.
 */
export type RoleBlockFailure =
  /** `componentSetId` did not resolve inside the render target file. */
  | { kind: 'not-in-target-file'; componentSetId: string; cause: string }
  /** The set is there but has no variant named `<prefix><role>`. */
  | { kind: 'no-variants'; componentSetId: string; setName: string; variantPrefix: string }
  /** `variantKeys` had no recognised role name. */
  | { kind: 'no-valid-roles' };

export type RoleBlockLoadResult =
  | { ok: true; runtime: RoleBlockRuntime; source: RoleBlockSource }
  | { ok: false; failure: RoleBlockFailure };

/** Figma says "not found" both for a deleted node and for a foreign-library node. */
const NOT_IN_FILE_RE = /not found|could not find|cannot find|does ?not exist|unknown node|another file|different file/i;

export function isNotInTargetFile(cause: string): boolean {
  return NOT_IN_FILE_RE.test(cause);
}

/**
 * Read the variant table once per render.
 *
 * Returns `undefined` when no role block is configured at all; otherwise a
 * structured result so the renderer can report *why* it failed.
 */
export async function loadRoleBlocks(
  backend: FigmaBackend,
  config: RoleBlockConfig | undefined,
  warn: (message: string) => void
): Promise<RoleBlockLoadResult | undefined> {
  if (!config) return undefined;

  // Library mode: every role has a published key, no backend read needed.
  if (config.variantKeys && Object.keys(config.variantKeys).length > 0) {
    const variantKeys = new Map<string, string>();
    for (const [rawRole, key] of Object.entries(config.variantKeys)) {
      const role = canonicalRole(rawRole);
      if (role && key) variantKeys.set(role, key);
    }
    if (variantKeys.size > 0) {
      return { ok: true, runtime: { config, variants: new Map(), variantKeys, warn }, source: 'keys' };
    }
    warn('roleBlock.variantKeys 里没有合法角色名；带 @职能 的条目无法渲染');
    return { ok: false, failure: { kind: 'no-valid-roles' } };
  }

  if (!config.componentSetId) return undefined;

  let set: NodeInfo;
  try {
    set = await backend.getNodeInfo(config.componentSetId);
  } catch (e) {
    return {
      ok: false,
      failure: {
        kind: 'not-in-target-file',
        componentSetId: config.componentSetId,
        cause: (e as Error).message
      }
    };
  }

  const children = set.childIds?.length ? await backend.getNodesInfo(set.childIds) : [];
  const variants = new Map<string, string>();
  for (const child of children) {
    if (child.type !== 'COMPONENT') continue;
    const role = roleOfVariantName(child.name, config.variantPrefix);
    const canonical = role ? canonicalRole(role) : undefined;
    if (canonical && !variants.has(canonical)) variants.set(canonical, child.id);
  }
  if (variants.size === 0) {
    return {
      ok: false,
      failure: {
        kind: 'no-variants',
        componentSetId: config.componentSetId,
        setName: set.name,
        variantPrefix: config.variantPrefix
      }
    };
  }
  return { ok: true, runtime: { config, variants, warn }, source: 'set' };
}

/** Roles referenced by the IR. */
export function rolesInIr(ir: DocIR): string[] {
  const roles = new Set<string>();
  for (const section of ir.sections) {
    for (const cluster of section.clusters) {
      for (const bullet of cluster.bullets) {
        const parsed = parseRoleBullet(bullet);
        if (parsed) roles.add(parsed.role);
      }
    }
  }
  return [...roles];
}

/** IR roles that the runtime cannot render. Empty = every role is covered. */
export function missingRoles(ir: DocIR, runtime: RoleBlockRuntime): string[] {
  const have = new Set<string>([...runtime.variants.keys(), ...(runtime.variantKeys?.keys() ?? [])]);
  return rolesInIr(ir).filter((role) => !have.has(role));
}

/** What the render result echoes so one call is enough to reconcile the config. */
export interface ResolvedRoleBlock {
  mode: RoleBlockSource;
  /** Config file path; `env:<path>` when it came from `$GISOP_TEMPLATE_CONFIG`. */
  source: string;
  componentSetId?: string;
  variantPrefix: string;
  labelTextName: string;
  roles: string[];
}

export function describeRoleBlock(
  runtime: RoleBlockRuntime,
  source: RoleBlockSource,
  configPath?: string
): ResolvedRoleBlock {
  const available = new Set<string>([
    ...runtime.variants.keys(),
    ...(runtime.variantKeys?.keys() ?? [])
  ]);
  return {
    mode: source,
    source: configPath ?? '(unknown)',
    ...(runtime.config.componentSetId ? { componentSetId: runtime.config.componentSetId } : {}),
    variantPrefix: runtime.config.variantPrefix,
    labelTextName: runtime.config.labelTextName,
    // Stable order: contract role order first, then anything extra.
    roles: [
      ...ROLE_NAMES.filter((r) => available.has(r)),
      ...[...available].filter((r) => !(ROLE_NAMES as readonly string[]).includes(r))
    ]
  };
}

/**
 * The TEXT inside a 职能标记 instance that holds the body.
 * The variant ships one label TEXT (named `文本`) plus one body TEXT; the body
 * is whichever TEXT is not the label. Falls back to the last TEXT child.
 */
export async function findRoleBlockBody(
  backend: FigmaBackend,
  instanceId: string,
  labelTextName: string
): Promise<string | undefined> {
  const info = await backend.getNodeInfo(instanceId);
  if (!info.childIds?.length) return undefined;
  const kids = await backend.getNodesInfo(info.childIds);
  const texts = kids.filter((k) => k.type === 'TEXT');
  return (texts.find((t) => t.name !== labelTextName) ?? texts[texts.length - 1])?.id;
}
