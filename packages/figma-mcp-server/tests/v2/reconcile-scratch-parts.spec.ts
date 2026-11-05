/**
 * P0 回归：adopt 模式下 scratch 渲染不可用时的正确姿势。
 *
 * 真机（2026-11-04，enginePid 11968）：M1 传 rootId + componentKey、不带 dryRun
 * → `V2_RECONCILE_SCRATCH_MISMATCH: scratch render produced no parts layout`，
 * 画布零写入；同样的参数带 dryRun 却 ok:true。差别只有一个：计划阶段不跑
 * scratch，只有真跑才跑。
 *
 * 修法：
 *   1. 计划阶段就知道「这轮能不能新建节点」（canCreate）。不能建时把需要新节点
 *      的改动记成 `needs-new-node` 冲突 + `V2_W_RECONCILE_NO_CREATE` 告警，
 *      而不是留到 scratch 阶段炸掉——dryRun 与真跑因此结论一致；
 *   2. 真跑照常应用能应用的改动（文字、标号），第二跑 `changes: []`；
 *   3. 万一仍然走到 scratch，错误消息必须点出章节与原因。
 *
 * 另附重复标记（外部脚本克隆）的取舍：拆掉的那份不该顶替原位那份。
 */

import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderV2MarkdownToFigma } from '../../src/v2/render.js';
import { buildSnapshot } from '../../src/v2/reconcile/snapshot.js';
import { Tree } from '../../src/v2/reconcile/tree.js';
import { parseStamp } from '../../src/v2/reconcile/stamp.js';
import type {
  ApplyOpsResult,
  FigmaBackend,
  NodeInfo,
  ReconcileOp,
  StampEntry,
  StampedNodeRaw,
  StampedTree
} from '../../src/v2/figma-client.js';

// 这些用例靠「机器上没有模板包」进入 adopt 分支：引擎包内基线包（0.4.4 起随包
// 分发）必须关掉，否则会先命中基线包，走不到 adopt。
process.env.GISOP_BUNDLED_PACKS = 'off';

const MD = (bullet: string[]) => `# 主串联 M1 复刻

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

### 经验条
@GUI

${bullet.map((b) => `- ${b}`).join('\n')}
`;

function raw(n: Omit<StampedNodeRaw, 'childIds'> & { childIds?: string[] }): StampedNodeRaw {
  return { childIds: [], ...n };
}

function makeTree(itemText: string): StampedTree {
  const doc = {
    kind: 'doc',
    v: 1,
    header: {},
    overview: {},
    sections: [{ id: 's1', text: '战斗界面' }],
    structure: 'parts',
    parts: { structure: 'parts', packHash: 'oldhash', components: { top: 'k1', chapter: 'k2', cluster: 'k3' } }
  };
  return {
    nodes: [
      raw({ id: 'root-1', name: '旧文档', type: 'FRAME', childIds: ['sec-1'], stamp: JSON.stringify(doc) }),
      raw({
        id: 'sec-1',
        name: '界面说明1',
        type: 'FRAME',
        parentId: 'root-1',
        childIds: ['col-1'],
        stamp: JSON.stringify({ kind: 'section', sid: 's1', name: '战斗界面', clusters: [{ id: 'c1', text: '经验条' }] })
      }),
      raw({
        id: 'col-1',
        name: 'Text',
        type: 'FRAME',
        parentId: 'sec-1',
        childIds: ['cl-1'],
        stamp: JSON.stringify({ kind: 'slot', role: 'column' })
      }),
      raw({
        id: 'cl-1',
        name: '经验条',
        type: 'FRAME',
        parentId: 'col-1',
        childIds: ['it-1'],
        stamp: JSON.stringify({
          kind: 'cluster',
          cid: 'c1',
          title: '经验条',
          roles: ['GUI'],
          items: [{ id: 'i1', t: 'rule', text: itemText }]
        })
      }),
      raw({
        id: 'it-1',
        name: '正文/规则',
        type: 'TEXT',
        parentId: 'cl-1',
        characters: itemText,
        stamp: JSON.stringify({ kind: 'item', iid: 'i1', t: 'rule', text: itemText })
      })
    ],
    truncated: false,
    pageId: 'page-1',
    strayScratchIds: []
  };
}

/**
 * 能记账的桩：`setText` / `stamp` 真的改到节点上，这样"二跑幂等"才是真结论，
 * 而不是同一个旧快照被读两遍。
 */
function harness(itemText: string) {
  const nodes = new Map<string, StampedNodeRaw>();
  for (const n of makeTree(itemText).nodes) nodes.set(n.id, { ...n, childIds: [...n.childIds] });
  const ops: ReconcileOp[] = [];
  const warn = (message: string): StampedNodeRaw => {
    throw new Error(message);
  };
  const info = (id: string): NodeInfo => {
    const n = nodes.get(id) ?? warn(`mock: node ${id} not found`);
    return {
      id: n.id,
      name: n.name,
      type: n.type,
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 }
    };
  };
  const backend = {
    async readStampedTree(): Promise<StampedTree> {
      return {
        nodes: [...nodes.values()].map((n) => ({ ...n, childIds: [...n.childIds] })),
        truncated: false,
        pageId: 'page-1',
        strayScratchIds: []
      };
    },
    async stampNodes(entries: StampEntry[]) {
      for (const e of entries) {
        const n = nodes.get(e.nodeId);
        if (n) n.stamp = e.stamp ? JSON.stringify(e.stamp) : undefined;
      }
    },
    async applyOps(batch: ReconcileOp[]): Promise<ApplyOpsResult> {
      ops.push(...batch);
      for (const op of batch) {
        if (op.op === 'setText') {
          const n = nodes.get(op.nodeId);
          if (!n) continue;
          n.characters = op.text;
          const st = parseStamp(n.stamp);
          if (st && st.kind !== 'doc' && st.kind !== 'section' && st.kind !== 'slot') n.stamp = JSON.stringify({ ...st, text: op.text });
        } else if (op.op === 'stamp') {
          const n = nodes.get(op.nodeId);
          if (n) n.stamp = JSON.stringify(op.stamp);
        } else if (op.op === 'delete') {
          nodes.delete(op.nodeId);
        }
      }
      return { boldUnavailable: [] };
    },
    async commitUndoCheckpoint() {
      /* no-op */
    },
    async deleteNodes(ids: string[]) {
      for (const id of ids) nodes.delete(id);
    },
    async getNodeInfo(id: string) {
      return info(id);
    },
    async getNodesInfo(ids: string[]) {
      return ids.map(info);
    },
    async resizeNode() {
      /* geometry is out of scope here */
    },
    async moveNode() {
      /* no-op */
    },
    async scanSubtree(rootId: string) {
      return { nodes: [info(rootId)], truncated: false };
    }
  } as unknown as FigmaBackend;
  return { backend, ops, nodes };
}

function useNoPack(on: boolean): void {
  if (on) delete process.env.GISOP_TEMPLATE_PACK;
  else process.env.GISOP_TEMPLATE_PACK = packPath;
}

let dir = '';
let packPath = '';

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'gisop-scratch-'));
  packPath = join(dir, 'template.json');
  writeFileSync(
    packPath,
    JSON.stringify({
      schema_version: 1,
      project: 'scratch',
      components: { top: 'k1', chapter: 'k2', cluster: 'k3' },
      capabilities: { badgeSlot: 'container' }
    })
  );
});

afterAll(() => {
  delete process.env.GISOP_TEMPLATE_PACK;
  rmSync(dir, { recursive: true, force: true });
});

const call = (backend: FigmaBackend, opts: { dryRun?: boolean; md?: string } = {}) =>
  renderV2MarkdownToFigma(
    {
      markdown: opts.md ?? MD(['A', 'b']),
      target: { rootId: 'root-1' },
      template: { componentKey: 'lib-key' },
      ...(opts.dryRun ? { dryRun: true } : {})
    },
    backend
  );

describe('P0 adopt 模式下需要新建节点', () => {
  it('真跑不再抛 V2_RECONCILE_SCRATCH_MISMATCH：改成 needs-new-node 冲突 + 告警', async () => {
    useNoPack(true);
    const h = harness('a');

    const r = await call(h.backend);

    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(r.errors.map((e) => e.code)).not.toContain('V2_RECONCILE_SCRATCH_MISMATCH');
    expect(r.conflicts?.some((c) => c.kind === 'needs-new-node' && c.path === '01/1/#2')).toBe(true);
    expect(r.warnings.some((w) => w.code === 'V2_W_RECONCILE_NO_CREATE')).toBe(true);
    // 文字改动照常落地（'a' → 'A'）。
    expect(r.changes?.map((c) => `${c.path}:${c.action}`)).toEqual(['01/1/#1:update']);
    expect(h.nodes.get('it-1')?.characters).toBe('A');
  });

  it('dryRun 与真跑的 changes 结论一致', async () => {
    useNoPack(true);
    const dry = await call(harness('a').backend, { dryRun: true });
    const real = await call(harness('a').backend);
    expect(dry.ok, JSON.stringify(dry.errors)).toBe(true);
    expect(real.ok, JSON.stringify(real.errors)).toBe(true);
    expect(dry.changes).toEqual(real.changes);
    expect(dry.conflicts).toEqual(real.conflicts);
  });

  it('二跑幂等：changes 为空', async () => {
    useNoPack(true);
    const h = harness('a');
    const first = await call(h.backend);
    expect(first.ok, JSON.stringify(first.errors)).toBe(true);

    const second = await call(h.backend);
    expect(second.ok, JSON.stringify(second.errors)).toBe(true);
    expect(second.changes).toEqual([]);
  });

  it('有模板包时不会降级：仍然按"要建节点"处理（这个桩渲染不了 → 明确失败）', async () => {
    useNoPack(false);
    const h = harness('a');
    const r = await call(h.backend);
    // canCreate 只有 adopt（无包）才关：有包时计划里照常有 scratch 需求，
    // 于是桩的渲染能力不足会直接失败，而不是被当成"不能建"静默跳过。
    expect(r.ok).toBe(false);
    expect(r.conflicts?.some((c) => c.kind === 'needs-new-node') ?? false).toBe(false);
    expect(r.warnings.some((w) => w.code === 'V2_W_RECONCILE_NO_CREATE')).toBe(false);
  });
});

describe('重复标记：留原位那份', () => {
  it('章节被复制并拖进别的章节里：原位那份赢', () => {
    const doc = {
      kind: 'doc',
      v: 1,
      header: {},
      overview: {},
      sections: [
        { id: 's1', text: '战斗界面' },
        { id: 's2', text: '设置' }
      ],
      structure: 'parts',
      parts: { structure: 'parts', packHash: 'h', components: { top: 'k1', chapter: 'k2', cluster: 'k3' } }
    };
    const tree = new Tree(
      {
        nodes: [
          raw({ id: 'root-1', name: '旧文档', type: 'FRAME', childIds: ['sec-1', 'sec-2'], stamp: JSON.stringify(doc) }),
          raw({
            id: 'sec-1',
            name: '界面说明1',
            type: 'FRAME',
            parentId: 'root-1',
            childIds: ['col-1'],
            stamp: JSON.stringify({ kind: 'section', sid: 's1', name: '战斗界面', clusters: [] })
          }),
          raw({
            id: 'col-1',
            name: 'Text',
            type: 'FRAME',
            parentId: 'sec-1',
            childIds: ['sec-2-dup'],
            stamp: JSON.stringify({ kind: 'slot', role: 'column' })
          }),
          // 复制出来又被拖进 sec-1 的那一份：BFS 顺序上排在原位之前。
          raw({
            id: 'sec-2-dup',
            name: '界面说明2',
            type: 'FRAME',
            parentId: 'col-1',
            childIds: [],
            stamp: JSON.stringify({ kind: 'section', sid: 's2', name: '设置', clusters: [] })
          }),
          raw({
            id: 'sec-2',
            name: '界面说明2',
            type: 'FRAME',
            parentId: 'root-1',
            childIds: [],
            stamp: JSON.stringify({ kind: 'section', sid: 's2', name: '设置', clusters: [] })
          })
        ],
        truncated: false,
        pageId: 'page-1',
        strayScratchIds: []
      },
      'root-1'
    );

    const snap = buildSnapshot(tree);
    const s2 = snap.sections.find((s) => s.sid === 's2');
    expect(s2?.node?.id).toBe('sec-2');
    expect(snap.warnings.some((w) => w.code === 'V2_W_DUPLICATE_STAMP')).toBe(true);
  });
});
