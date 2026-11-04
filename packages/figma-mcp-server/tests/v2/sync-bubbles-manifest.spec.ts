/**
 * P1 回归：同步成功返回体必须带 `bubbles`（逐章标号清单）。
 *
 * 真机（2026-11-04）：create 模式有清单，reconcile 成功返回体没有——调用方只能
 * 自己数画布。同步不重渲文档，所以清单只能从画布读：写完（或 dryRun 的现状）
 * 之后逐章读标号容器，顺带核对数量，不符报 `V2_W_BADGE_COUNT_MISMATCH`。
 */

import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderV2MarkdownToFigma } from '../../src/v2/render.js';
import { CHAPTER_SLOTS } from '../../src/v2/template-slots.js';
import { BADGE_MASTER_NAME } from '../../src/v2/template-slots.js';
import type {
  ApplyOpsResult,
  FigmaBackend,
  NodeInfo,
  StampEntry,
  StampedNodeRaw,
  StampedTree
} from '../../src/v2/figma-client.js';

const MD = `# 同步清单

跟进UI：测试
需求组：测试
易协作链接：#待补充
最后更新时间：2026.11.04

## 设计总览

### 功能背景

背景。

### 核心交互

交互。

## 01. 战斗界面

### 血条
@GUI

- a

### 击杀提示
@GUI

- b
`;

interface BadgeFixture {
  /** 画布上真实存在的标号编号（1 起）。 */
  badges: number[];
  includeMaster?: boolean;
}

function tree(f: BadgeFixture): StampedTree {
  const doc = {
    kind: 'doc',
    v: 1,
    header: {},
    overview: {},
    sections: [{ id: 's1', text: '战斗界面' }],
    structure: 'parts',
    parts: { structure: 'parts', packHash: 'hash', components: { top: 'k1', chapter: 'k2', cluster: 'k3' } }
  };
  const badgeNodes: StampedNodeRaw[] = f.badges.map((n) => ({
    id: `bdg-${n}`,
    name: `标号/${n}`,
    type: 'FRAME',
    parentId: 'bub-1',
    childIds: [],
    stamp: JSON.stringify({ kind: 'slot', role: 'bubble', cid: `c${n}` })
  }));
  const master: StampedNodeRaw[] = f.includeMaster
    ? [
        {
          id: 'bdg-master',
          name: BADGE_MASTER_NAME,
          type: 'FRAME',
          parentId: 'bub-1',
          childIds: []
        }
      ]
    : [];
  return {
    nodes: [
      {
        id: 'root-1',
        name: '旧文档',
        type: 'FRAME',
        childIds: ['sec-1'],
        stamp: JSON.stringify(doc)
      },
      {
        id: 'sec-1',
        name: '界面说明1',
        type: 'FRAME',
        parentId: 'root-1',
        childIds: ['col-1', 'bub-1'],
        stamp: JSON.stringify({
          kind: 'section',
          sid: 's1',
          name: '战斗界面',
          clusters: [
            { id: 'c1', text: '血条' },
            { id: 'c2', text: '击杀提示' }
          ]
        })
      },
      {
        id: 'col-1',
        name: 'Text',
        type: 'FRAME',
        parentId: 'sec-1',
        childIds: ['cl-1', 'cl-2'],
        stamp: JSON.stringify({ kind: 'slot', role: 'column' })
      },
      {
        id: 'bub-1',
        name: CHAPTER_SLOTS.badgeContainer,
        type: 'FRAME',
        parentId: 'sec-1',
        childIds: [...master.map((m) => m.id), ...badgeNodes.map((b) => b.id)],
        stamp: JSON.stringify({ kind: 'slot', role: 'bubbleFrame' })
      },
      {
        id: 'cl-1',
        name: '血条',
        type: 'FRAME',
        parentId: 'col-1',
        childIds: ['it-1'],
        stamp: JSON.stringify({
          kind: 'cluster',
          cid: 'c1',
          title: '血条',
          roles: ['GUI'],
          items: [{ id: 'i1', t: 'rule', text: 'a' }]
        })
      },
      {
        id: 'it-1',
        name: '正文/规则',
        type: 'TEXT',
        parentId: 'cl-1',
        childIds: [],
        characters: 'a',
        stamp: JSON.stringify({ kind: 'item', iid: 'i1', t: 'rule', text: 'a' })
      },
      {
        id: 'cl-2',
        name: '击杀提示',
        type: 'FRAME',
        parentId: 'col-1',
        childIds: ['it-2'],
        stamp: JSON.stringify({
          kind: 'cluster',
          cid: 'c2',
          title: '击杀提示',
          roles: ['GUI'],
          items: [{ id: 'i2', t: 'rule', text: 'b' }]
        })
      },
      {
        id: 'it-2',
        name: '正文/规则',
        type: 'TEXT',
        parentId: 'cl-2',
        childIds: [],
        characters: 'b',
        stamp: JSON.stringify({ kind: 'item', iid: 'i2', t: 'rule', text: 'b' })
      },
      ...master,
      ...badgeNodes
    ],
    truncated: false,
    pageId: 'page-1',
    strayScratchIds: []
  };
}

function harness(f: BadgeFixture) {
  const rawTree = tree(f);
  const info = (id: string): NodeInfo => {
    const n = rawTree.nodes.find((x) => x.id === id);
    if (!n) throw new Error(`mock: node ${id} not found`);
    return {
      id: n.id,
      name: n.name,
      type: n.type,
      absoluteBoundingBox: { x: 0, y: 0, width: 48, height: 48 },
      ...(n.childIds.length > 0 ? { childIds: [...n.childIds] } : {})
    };
  };
  const backend = {
    async readStampedTree() {
      return rawTree;
    },
    async stampNodes(_entries: StampEntry[]) {
      /* not needed */
    },
    async applyOps(): Promise<ApplyOpsResult> {
      return { boldUnavailable: [] };
    },
    async commitUndoCheckpoint() {
      /* no-op */
    },
    async deleteNodes() {
      /* no-op */
    },
    async getNodeInfo(id: string) {
      return info(id);
    },
    async getNodesInfo(ids: string[]) {
      return ids.map(info);
    },
    async resizeNode() {
      /* no-op */
    },
    async scanSubtree(rootId: string) {
      const out: NodeInfo[] = [];
      const queue = [rootId];
      while (queue.length > 0) {
        const id = queue.shift()!;
        out.push(info(id));
        const n = rawTree.nodes.find((x) => x.id === id);
        queue.push(...(n?.childIds ?? []));
      }
      return { nodes: out, truncated: false };
    }
  } as unknown as FigmaBackend;
  return backend;
}

let dir = '';
let packPath = '';

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'gisop-sync-badges-'));
  packPath = join(dir, 'template.json');
  writeFileSync(
    packPath,
    JSON.stringify({
      schema_version: 1,
      project: 'sync-badges',
      components: { top: 'k1', chapter: 'k2', cluster: 'k3' },
      capabilities: { badgeSlot: 'container' }
    })
  );
});

afterAll(() => {
  delete process.env.GISOP_TEMPLATE_PACK;
  rmSync(dir, { recursive: true, force: true });
});

const sync = (backend: FigmaBackend, dryRun?: boolean) =>
  renderV2MarkdownToFigma(
    {
      markdown: MD,
      target: { rootId: 'root-1' },
      // 现场就是 adopt 场景（M1 由 pack 渲染，现在没配包）：没有这个开关早就
      // 被 V2_PACK_MISMATCH 挡住了，轮不到看 bubbles。
      forceReconcile: true,
      ...(dryRun ? { dryRun: true } : {})
    },
    backend
  );

describe('P1 同步返回 bubbles', () => {
  it('无改动同步：按画布逐章列出标号，且不带 packMissing', async () => {
    delete process.env.GISOP_TEMPLATE_PACK;
    const r = await sync(harness({ badges: [1, 2] }));

    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(r.changes).toEqual([]);
    expect(r.bubbles).toEqual([
      { section: '01', cluster: 1, nodeId: 'bdg-1' },
      { section: '01', cluster: 2, nodeId: 'bdg-2' }
    ]);
    expect(r.warnings.some((w) => w.code === 'V2_W_BADGE_COUNT_MISMATCH')).toBe(false);
    expect('packMissing' in r).toBe(false);
    expect('packCandidates' in r).toBe(false);
  });

  it('标号比簇少：照样给清单，并报 V2_W_BADGE_COUNT_MISMATCH 点名缺号', async () => {
    delete process.env.GISOP_TEMPLATE_PACK;
    const r = await sync(harness({ badges: [1] }));

    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(r.bubbles).toHaveLength(1);
    const mismatch = r.warnings.find((w) => w.code === 'V2_W_BADGE_COUNT_MISMATCH');
    expect(mismatch?.message).toContain('缺 2 号');
  });

  it('标号母版不算数', async () => {
    delete process.env.GISOP_TEMPLATE_PACK;
    const r = await sync(harness({ badges: [1, 2], includeMaster: true }));
    expect(r.bubbles?.map((b) => b.nodeId)).toEqual(['bdg-1', 'bdg-2']);
  });

  it('dryRun 也给清单（读到的是现状）', async () => {
    delete process.env.GISOP_TEMPLATE_PACK;
    const r = await sync(harness({ badges: [1, 2] }), true);
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(r.bubbles).toHaveLength(2);
  });

  it('模板声明 badgeSlot=none 时不报缺号', async () => {
    process.env.GISOP_TEMPLATE_PACK = join(dir, 'none.json');
    writeFileSync(
      process.env.GISOP_TEMPLATE_PACK,
      JSON.stringify({
        schema_version: 1,
        project: 'no-badge',
        components: { top: 'k1', chapter: 'k2', cluster: 'k3' },
        capabilities: { badgeSlot: 'none' }
      })
    );
    const r = await sync(harness({ badges: [] }));
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(r.bubbles).toBeUndefined();
    expect(r.warnings.some((w) => w.code === 'V2_W_BADGE_COUNT_MISMATCH')).toBe(false);
  });

  it('engineVersion 随返回体回显（判断跑的是不是新 build）', async () => {
    delete process.env.GISOP_TEMPLATE_PACK;
    const r = await sync(harness({ badges: [1, 2] }));
    expect(r.engineVersion).toBe('0.4.2');
  });
});
