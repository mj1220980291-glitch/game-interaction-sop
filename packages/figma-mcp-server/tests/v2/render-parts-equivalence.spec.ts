/**
 * 1:14 新旧路径等价性。
 *
 * 同一份 md：旧路径 = 克隆整份 1:14；新路径 = 用 1:14 的顶部 / 章节 / 簇做成 4 部件再拼装。
 * 比对「槽位文本」这一层：章节标题、簇标题、内容行、编号。名称 / 数量不一致即为回归。
 *
 * Spec: template-render「1:14 新旧路径等价」
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseV2 } from '../../src/v2/parser.js';
import { renderV2MarkdownToFigma } from '../../src/v2/render.js';
import { renderFromParts } from '../../src/v2/render/parts/index.js';
import { parseTemplatePack } from '../../src/v2/template/schema.js';
import { makeBackend, type NodeStore } from './helpers/mock-backend.js';
import { partsBackend, type PNodeSpec } from './helpers/parts-backend.js';

const MD = readFileSync(join(__dirname, 'fixtures', 'buzhong.md'), 'utf8');

function toSpec(store: NodeStore, id: string): PNodeSpec {
  const n = store[id];
  if (!n) throw new Error(`equivalence: node ${id} missing`);
  const box = n.absoluteBoundingBox;
  return {
    id: n.id,
    name: n.name,
    type: n.type,
    ...(n.characters !== undefined ? { characters: n.characters } : {}),
    visible: n.visible !== false,
    width: box?.width ?? 100,
    height: box?.height ?? 100,
    children: n.children.map((c) => toSpec(store, c))
  };
}

const SLOT_NAMES = new Set(['#Name', '#Title_Main', '正文/规则', '#Number']);

function slotTexts(store: NodeStore | Map<string, { name: string; characters?: string; children: string[]; visible?: boolean }>, rootId: string): string[] {
  const out: string[] = [];
  const visit = (id: string): void => {
    const n = store instanceof Map ? store.get(id) : store[id];
    if (!n) return;
    if (n.visible === false) return;
    if (SLOT_NAMES.has(n.name) && n.characters) out.push(`${n.name}=${n.characters}`);
    for (const c of n.children) visit(c);
  };
  visit(rootId);
  return out.sort();
}

describe('1:14 新旧路径等价', () => {
  it('槽位文本一致', async () => {
    // --- 旧路径：克隆整份 1:14 ---
    const legacy = makeBackend();
    const prev = process.env.GISOP_TEMPLATE_PACK;
    process.env.GISOP_TEMPLATE_PACK = 'off';
    let legacyRoot: string;
    try {
      const r = await renderV2MarkdownToFigma({ markdown: MD, target: { pageId: 'page:1' } }, legacy.backend);
      expect(r.ok).toBe(true);
      legacyRoot = r.rootInstanceId!;
    } finally {
      if (prev === undefined) delete process.env.GISOP_TEMPLATE_PACK;
      else process.env.GISOP_TEMPLATE_PACK = prev;
    }

    // --- 新路径：用 1:14 的顶部 / 章节 / 簇做部件 ---
    const parsed = parseV2(MD);
    if (!parsed.ir) throw new Error(parsed.errors.map((e) => e.message).join('; '));
    const packParsed = parseTemplatePack({
      schema_version: 1,
      project: '官方1.14',
      components: { top: 'k-top', chapter: 'k-chapter', cluster: 'k-cluster', footer: null }
    });
    if (!packParsed.ok) throw new Error(packParsed.errors.join('; '));

    const topSpec = toSpec(legacy.store, legacy.rootId);
    topSpec.children = topSpec.children?.filter((c) => c.name !== '需求目标');
    const h = partsBackend({ id: 'page:1', name: 'Page 1', type: 'PAGE', width: 4000, height: 4000 });
    h.registerComponent('k-top', topSpec);
    h.registerComponent('k-chapter', toSpec(legacy.store, legacy.masterSectionId));
    h.registerComponent('k-cluster', toSpec(legacy.store, legacy.seedBlockId));

    const parts = await renderFromParts({
      ir: parsed.ir,
      pack: packParsed.pack,
      pageId: 'page:1',
      backend: h.backend
    });

    expect(slotTexts(h.nodes, parts.rootId)).toEqual(slotTexts(legacy.store, legacyRoot));
  });
});
