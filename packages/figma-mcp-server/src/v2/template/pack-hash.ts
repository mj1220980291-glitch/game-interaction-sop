/**
 * 模板包指纹。
 *
 * 同步要在旧文档上原地改结构，前提是那份文档是按同一套部件渲染出来的。
 * 模板重编会改部件 key 或能力（`figure` 从 `named-group` 变 `none` 之类），
 * 按新能力去改旧结构会删错节点，所以指纹一变就拒绝同步、要求重渲染。
 */

import { createHash } from 'node:crypto';
import type { TemplatePack } from './schema.js';

/** 参与指纹的能力键：与「怎么画」有关，与数据来源无关。 */
const HASHED_CAPABILITIES = [
  'overview',
  'clusterGroups',
  'badgeSlot',
  'numberBadge',
  'roleAnnotation',
  'figure',
  'hiddenPool',
  'column'
] as const;

export function packHash(pack: TemplatePack): string {
  const components = Object.entries(pack.components)
    .filter(([, key]) => Boolean(key))
    .sort(([a], [b]) => a.localeCompare(b));
  const capabilities = HASHED_CAPABILITIES.map((k) => [k, pack.capabilities[k]]);
  const payload = JSON.stringify({ components, capabilities });
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

export function packComponents(pack: TemplatePack): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [part, key] of Object.entries(pack.components)) {
    if (key) out[part] = key;
  }
  return out;
}
