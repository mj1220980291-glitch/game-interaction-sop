/**
 * Runtime template resolution.
 *
 * The master template used to be two hard-coded constants
 * (`UYCJok3MXTWITMfeJSqEF6` / `1:14`). Projects that keep their own copy of the
 * template had to fork the engine. Resolution order now:
 *
 *   1. explicit `template` argument on `render_v2_markdown_to_figma`
 *   2. env `FIGMA_TEMPLATE_FILE_KEY` / `FIGMA_TEMPLATE_NODE_ID`
 *   3. config file — `$GISOP_TEMPLATE_CONFIG`, else `~/.game-interaction-sop/template.json`,
 *      else the `figma` block of `~/.game-interaction-sop/config.local.json`
 *   4. {@link DEFAULT_TEMPLATE}
 *
 * The config file is read on every render, so pointing the engine at another
 * template needs no restart. Env vars are read at process start (they are part
 * of the MCP server config).
 *
 * The template's **internal** structure is not configurable: section / cluster
 * / bullet slots are still resolved by the names in `template-map.ts`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { TEMPLATE_FILE_KEY, TEMPLATE_NODE_ID } from './template-map.js';
import { parseTemplatePack, type TemplatePack } from './template/schema.js';

export interface TemplateRef {
  /** File that owns the template component (file mode). */
  fileKey?: string;
  /** COMPONENT / FRAME node cloned once per document (file mode). */
  nodeId?: string;
  /** Published library key of the template (library mode — used when set). */
  componentKey?: string;
}

/** Role-annotation component set ("职能标记"). */
export interface RoleBlockConfig {
  /** COMPONENT_SET node id inside `TemplateRef.fileKey` (file mode). */
  componentSetId?: string;
  /** role → published variant key (library mode). */
  variantKeys?: Record<string, string>;
  /** Variant name prefix. `职能标记=#策划` / `职能标记=策划` both resolve. */
  variantPrefix: string;
  /** Name of the variant's label TEXT (the one we do NOT write). */
  labelTextName: string;
}

export interface TemplateConfig extends TemplateRef {
  roleBlock?: RoleBlockConfig;
  /**
   * Project template pack, when one was found. Its `components` are the four
   * published library keys; its `capabilities` say which strategy each
   * ambiguous slot follows. Absent = behaviour identical to before packs
   * existed.
   */
  pack?: TemplatePack;
  /** Path the pack was read from (for diagnostics). */
  packPath?: string;
}

export const DEFAULT_TEMPLATE = {
  fileKey: TEMPLATE_FILE_KEY,
  nodeId: TEMPLATE_NODE_ID
} as const satisfies TemplateRef;

export const DEFAULT_VARIANT_PREFIX = '职能标记=';
export const DEFAULT_LABEL_TEXT_NAME = '文本';

interface RawConfig {
  template?: Partial<TemplateRef>;
  roleBlock?: Partial<RoleBlockConfig>;
  figma?: {
    template_file_key?: string;
    template_node_id?: string;
    template_component_key?: string;
    role_block_component_set_id?: string;
    role_block_variant_keys?: Record<string, string>;
  };
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

/** First existing config file, in priority order. */
function loadConfigFile(env: NodeJS.ProcessEnv): RawConfig | undefined {
  const explicit = env.GISOP_TEMPLATE_CONFIG;
  // `off` pins resolution to env vars + defaults. Tests use it so a developer's
  // ~/.game-interaction-sop/template.json cannot change their outcome.
  if (explicit === 'off') return undefined;
  if (explicit) {
    const cfg = readJson(explicit) as RawConfig | undefined;
    if (cfg) return cfg;
  }
  const home = homedir();
  return (
    (readJson(join(home, '.game-interaction-sop', 'template.json')) as RawConfig | undefined) ??
    (readJson(join(home, '.game-interaction-sop', 'config.local.json')) as RawConfig | undefined)
  );
}

function pick(...values: Array<string | undefined>): string | undefined {
  return values.find((v) => typeof v === 'string' && v.trim() !== '');
}

export interface TemplatePackLookupOptions {
  /** Directory treated as the project root. Defaults to `process.cwd()`. */
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Home directory override — tests need a hermetic `~`. Defaults to `os.homedir()`. */
  home?: string;
}

/** Where a candidate path came from — mirror of the lookup order. */
export type PackCandidateOrigin = 'env' | 'cwd' | 'project' | 'default';

/**
 * `hit` 命中；`missing` 文件不存在；`invalid` JSON 或协议不合法；
 * `incomplete` 缺 `top` / `chapter` / `cluster` 任一 key（半套 key 拼不出文档）。
 */
export type PackCandidateState = 'hit' | 'missing' | 'invalid' | 'incomplete';

export interface PackCandidate {
  path: string;
  origin: PackCandidateOrigin;
  state: PackCandidateState;
  /** Why `invalid` / `incomplete` — surfaced in errors so nobody has to guess. */
  reason?: string;
}

export interface PackResolution {
  hit?: { path: string; origin: PackCandidateOrigin; pack: TemplatePack };
  /** Empty when `disabledByEnv` — nothing was looked up. */
  candidates: PackCandidate[];
  disabledByEnv?: boolean;
}

/** Keys without which a pack cannot produce a document. */
const REQUIRED_PACK_KEYS = ['top', 'chapter', 'cluster'] as const;

/**
 * Locate the project template pack. Order (first hit wins, spec D8):
 *
 *   1. `$GISOP_TEMPLATE_PACK` (explicit path; `off` disables the whole lookup)
 *   2. `<cwd>/.interaction-sop/template.json`
 *   3. `~/.game-interaction-sop/templates/<project>.json` (`$GISOP_PROJECT`)
 *   4. `~/.game-interaction-sop/templates/default.json`
 *
 * Never throws. Every candidate's outcome is kept so a miss can be explained:
 * 「没配 pack」和「配了但写错」以前都是静默跳过，报错只能猜。
 */
export function resolvePackWithTrace(opts: TemplatePackLookupOptions = {}): PackResolution {
  const env = opts.env ?? process.env;
  if (env.GISOP_TEMPLATE_PACK === 'off') return { candidates: [], disabledByEnv: true };

  const home = opts.home ?? homedir();
  const project = env.GISOP_PROJECT;
  const candidates: Array<{ path: string; origin: PackCandidateOrigin }> = [];
  if (env.GISOP_TEMPLATE_PACK) {
    candidates.push({ path: env.GISOP_TEMPLATE_PACK, origin: 'env' });
  }
  candidates.push({
    path: join(opts.cwd ?? process.cwd(), '.interaction-sop', 'template.json'),
    origin: 'cwd'
  });
  if (project) {
    candidates.push({
      path: join(home, '.game-interaction-sop', 'templates', `${project}.json`),
      origin: 'project'
    });
  }
  candidates.push({
    path: join(home, '.game-interaction-sop', 'templates', 'default.json'),
    origin: 'default'
  });

  const trace: PackCandidate[] = [];
  for (const candidate of candidates) {
    if (!existsSync(candidate.path)) {
      trace.push({ ...candidate, state: 'missing' });
      continue;
    }
    const raw = readJson(candidate.path);
    if (raw === undefined) {
      trace.push({ ...candidate, state: 'invalid', reason: 'not readable as JSON' });
      if (candidate.origin === 'env') return { candidates: trace };
      continue;
    }
    const parsed = parseTemplatePack(raw);
    if (!parsed.ok) {
      trace.push({
        ...candidate,
        state: 'invalid',
        reason: parsed.errors.slice(0, 2).join('; ')
      });
      if (candidate.origin === 'env') return { candidates: trace };
      continue;
    }
    const missingKeys = REQUIRED_PACK_KEYS.filter((k) => !parsed.pack.components[k]);
    if (missingKeys.length > 0) {
      trace.push({
        ...candidate,
        state: 'incomplete',
        reason: `missing components.${missingKeys.join(' / components.')}`
      });
      // 显式指定的路径是唯一的权威：它坏了就停下，别拿机器上的 default.json
      // 顶上——那正是「明明配了这个项目，渲染出来却是官方模板」的成因。
      if (candidate.origin === 'env') return { candidates: trace };
      continue;
    }
    trace.push({ ...candidate, state: 'hit' });
    return {
      hit: { path: candidate.path, origin: candidate.origin, pack: parsed.pack },
      candidates: trace
    };
  }
  return { candidates: trace };
}

/** Thin wrapper — see {@link resolvePackWithTrace} for the diagnostics. */
export function loadTemplatePack(
  opts: TemplatePackLookupOptions = {}
): { path: string; pack: TemplatePack } | undefined {
  const hit = resolvePackWithTrace(opts).hit;
  return hit ? { path: hit.path, pack: hit.pack } : undefined;
}

/**
 * 找一个可用于「多部件渲染」的模板包：`top` / `chapter` / `cluster` 三 key 齐全。
 *
 * 齐全性已由 {@link resolvePackWithTrace} 判为 `hit`，这里保留名字是因为调用点
 * 表达的是「能不能走多部件渲染」，不是「找没找到包」。
 */
export function loadPartsPack(
  opts: TemplatePackLookupOptions = {}
): { path: string; pack: TemplatePack } | undefined {
  return loadTemplatePack(opts);
}

/**
 * Resolve the template + optional 职能标记 component set for one render.
 * Never throws: an unreadable config simply falls through to the default.
 */
export function resolveTemplateConfig(
  explicit?: Partial<TemplateRef>,
  env: NodeJS.ProcessEnv = process.env,
  opts: { cwd?: string; home?: string } = {}
): TemplateConfig {
  const file = loadConfigFile(env);
  const fileKey =
    pick(explicit?.fileKey, env.FIGMA_TEMPLATE_FILE_KEY, file?.template?.fileKey, file?.figma?.template_file_key) ??
    DEFAULT_TEMPLATE.fileKey;
  const nodeId =
    pick(explicit?.nodeId, env.FIGMA_TEMPLATE_NODE_ID, file?.template?.nodeId, file?.figma?.template_node_id) ??
    DEFAULT_TEMPLATE.nodeId;

  const componentKey = pick(
    explicit?.componentKey,
    env.FIGMA_TEMPLATE_COMPONENT_KEY,
    file?.template?.componentKey,
    file?.figma?.template_component_key
  );

  const componentSetId = pick(
    file?.roleBlock?.componentSetId,
    file?.figma?.role_block_component_set_id
  );
  const variantKeys = file?.roleBlock?.variantKeys ?? file?.figma?.role_block_variant_keys;

  return {
    ...(componentKey ? { componentKey } : { fileKey, nodeId }),
    ...(componentSetId || (variantKeys && Object.keys(variantKeys).length > 0)
      ? {
          roleBlock: {
            ...(componentSetId ? { componentSetId } : {}),
            ...(variantKeys && Object.keys(variantKeys).length > 0 ? { variantKeys } : {}),
            variantPrefix: pick(file?.roleBlock?.variantPrefix) ?? DEFAULT_VARIANT_PREFIX,
            labelTextName: pick(file?.roleBlock?.labelTextName) ?? DEFAULT_LABEL_TEXT_NAME
          }
        }
      : {}),
    ...(() => {
      const found = loadTemplatePack({ cwd: opts.cwd, home: opts.home, env });
      return found ? { pack: found.pack, packPath: found.path } : {};
    })()
  };
}

/** True when the resolved config still points at the hard-coded master. */
export function isDefaultTemplate(t: TemplateRef): boolean {
  return t.fileKey === DEFAULT_TEMPLATE.fileKey && t.nodeId === DEFAULT_TEMPLATE.nodeId;
}

/** Library mode: template addressed by published component key. */
export function isLibraryTemplate(t: TemplateRef): boolean {
  return typeof t.componentKey === 'string' && t.componentKey.trim() !== '';
}
