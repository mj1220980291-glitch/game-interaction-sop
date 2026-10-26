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
 */

import type { FigmaBackend, NodeInfo } from './figma-client.js';
import { ROLE_NAMES } from './ir.js';
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

/**
 * Read the component set once per render and index its variants by role.
 * Returns undefined when the set cannot be read — callers then fall back to
 * plain bullets instead of failing the render.
 */
export async function loadRoleBlocks(
  backend: FigmaBackend,
  config: RoleBlockConfig | undefined,
  warn: (message: string) => void
): Promise<RoleBlockRuntime | undefined> {
  if (!config) return undefined;

  // Library mode: every role has a published key, no backend read needed.
  if (config.variantKeys && Object.keys(config.variantKeys).length > 0) {
    const variantKeys = new Map<string, string>();
    for (const [rawRole, key] of Object.entries(config.variantKeys)) {
      const role = canonicalRole(rawRole);
      if (role && key) variantKeys.set(role, key);
    }
    if (variantKeys.size > 0) {
      return { config, variants: new Map(), variantKeys, warn };
    }
    warn('roleBlock.variantKeys 里没有合法角色名；带 @职能 的条目无法渲染');
    return undefined;
  }

  if (!config.componentSetId) return undefined;

  let set: NodeInfo;
  try {
    set = await backend.getNodeInfo(config.componentSetId);
  } catch (e) {
    warn(
      `roleBlock.componentSetId=${config.componentSetId} 读不到（${(e as Error).message}）；` +
        '带 @职能 的条目降级为普通正文'
    );
    return undefined;
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
    warn(
      `组件集 "${set.name}" (${config.componentSetId}) 下没有 "${config.variantPrefix}" 开头的变体；` +
        '带 @职能 的条目降级为普通正文'
    );
    return undefined;
  }
  return { config, variants, warn };
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
