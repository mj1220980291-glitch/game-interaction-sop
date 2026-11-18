/**
 * 能力契约自检的接入点：pack 加载时比对「表 ↔ 实现」，不一致只出软告警，渲染照旧。
 *
 * 注入方式：直接在表上抹掉一段契约文案，模拟「某个消费点没跟上表」。
 *
 * Spec: openspec/specs/capability-contract/spec.md
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderV2MarkdownToFigma } from '../../src/v2/render.js';
import { CAPABILITY_RULES } from '../../src/v2/capability-contract.js';
import { makeBackend, type NodeStore } from './helpers/mock-backend.js';
import { partsBackend, type PNodeSpec } from './helpers/parts-backend.js';

const MD = readFileSync(join(__dirname, 'fixtures', 'buzhong.md'), 'utf8');
const MISMATCH = 'V2_W_CAPABILITY_CONTRACT_MISMATCH';

function toSpec(store: NodeStore, id: string): PNodeSpec {
  const n = store[id];
  if (!n) throw new Error(`selfcheck: node ${id} missing`);
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

let dir = '';
let packPath = '';

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'gisop-selfcheck-'));
  packPath = join(dir, 'template.json');
  writeFileSync(
    packPath,
    JSON.stringify({
      schema_version: 1,
      project: '自检',
      components: { top: 'k-top', chapter: 'k-chapter', cluster: 'k-cluster', footer: null }
    })
  );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const PREV_PACK = process.env.GISOP_TEMPLATE_PACK;
afterEach(() => {
  if (PREV_PACK === undefined) delete process.env.GISOP_TEMPLATE_PACK;
  else process.env.GISOP_TEMPLATE_PACK = PREV_PACK;
});

/** 用旧路径的产物当部件源，再在 parts 后端上跑一次带 pack 的渲染。 */
async function renderWithPack() {
  const legacy = makeBackend();
  process.env.GISOP_TEMPLATE_PACK = 'off';
  const baseline = await renderV2MarkdownToFigma(
    { markdown: MD, target: { pageId: 'page:1' } },
    legacy.backend
  );
  if (!baseline.ok) throw new Error(baseline.errors.map((e) => e.message).join('; '));

  const topSpec = toSpec(legacy.store, legacy.rootId);
  topSpec.children = topSpec.children?.filter((c) => c.name !== '需求目标');

  const h = partsBackend({ id: 'page:1', name: 'Page 1', type: 'PAGE', width: 4000, height: 4000 });
  h.registerComponent('k-top', topSpec);
  h.registerComponent('k-chapter', toSpec(legacy.store, legacy.masterSectionId));
  h.registerComponent('k-cluster', toSpec(legacy.store, legacy.seedBlockId));

  process.env.GISOP_TEMPLATE_PACK = packPath;
  return renderV2MarkdownToFigma({ markdown: MD, target: { pageId: 'page:1' } }, h.backend);
}

describe('能力契约自检', () => {
  it('表与实现一致：不出告警，渲染照旧成功', async () => {
    const r = await renderWithPack();
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(r.warnings.some((w) => w.code === MISMATCH)).toBe(false);
  });

  it('注入一条不一致（表漏了契约文案）：只出警告，渲染继续', async () => {
    const rule = CAPABILITY_RULES.column.right.contract!;
    const saved = rule.column;
    rule.column = '';
    try {
      const r = await renderWithPack();
      expect(r.ok, JSON.stringify(r.errors)).toBe(true);
      const hit = r.warnings.find((w) => w.code === MISMATCH);
      expect(hit?.message).toContain('column=right');
      expect(hit?.message).toContain('期望');
      expect(hit?.message).toContain('实际');
    } finally {
      rule.column = saved;
    }
  });
});
