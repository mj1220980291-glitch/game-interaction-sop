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

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { TEMPLATE_FILE_KEY, TEMPLATE_NODE_ID } from './template-map.js';

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

function readJson(path: string): RawConfig | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as RawConfig;
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
    const cfg = readJson(explicit);
    if (cfg) return cfg;
  }
  const home = homedir();
  return (
    readJson(join(home, '.game-interaction-sop', 'template.json')) ??
    readJson(join(home, '.game-interaction-sop', 'config.local.json'))
  );
}

function pick(...values: Array<string | undefined>): string | undefined {
  return values.find((v) => typeof v === 'string' && v.trim() !== '');
}

/**
 * Resolve the template + optional 职能标记 component set for one render.
 * Never throws: an unreadable config simply falls through to the default.
 */
export function resolveTemplateConfig(
  explicit?: Partial<TemplateRef>,
  env: NodeJS.ProcessEnv = process.env
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
      : {})
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
