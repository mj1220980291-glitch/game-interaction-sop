/**
 * E3 — 旧 pack 文档的同步通路（adopt / forceReconcile）。
 *
 * 真机：M1/M2 早期由 pack 渲染，后来机器上没有那份 pack（或模板重编过），
 * `reconcile` 直接拒绝「re-render it instead of syncing」——即便传了可用的
 * `template.componentKey` 也不给同步，于是只能放弃引擎手写 figma_execute。
 *
 * 现在的规则：
 *   - pack 缺失 + 传了 `template.componentKey` → 隐式 adopt，继续增量同步；
 *   - pack 缺失 / 指纹变化 + `forceReconcile:true` → 显式 adopt；
 *   - 指纹变化且 adopt 成功 → 文档指纹重打成当前包（之后不再报 mismatch）；
 *   - 都没给 → 仍是 V2_PACK_MISMATCH，但报错里直说两条出路。
 */

import { afterAll, beforeAll, describe, it, expect } from 'vitest';import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderV2MarkdownToFigma } from '../../src/v2/render.js';
import { packHash } from '../../src/v2/template/pack-hash.js';
import { parseTemplatePack } from '../../src/v2/template/schema.js';
import type {
  ApplyOpsResult,
  FigmaBackend,
  NodeInfo,
  ReconcileOp,
  StampEntry,
  StampedNodeRaw,
  StampedTree
} from '../../src/v2/figma-client.js';

// 这些用例模拟「机器上没有模板包」：引擎包内基线包（0.4.4 起随包分发）必须关掉，
// 否则 adopt / legacy 分支根本走不到。
process.env.GISOP_BUNDLED_PACKS = 'off';

const MD = `# adopt 同步

跟进UI：测试
需求组：测试
易协作链接：#待补充
最后更新时间：2026.11.03

## 设计总览

### 功能背景

背景。

### 核心交互

交互。

## 01. 战斗界面

### 经验条
@GUI

- b
`;

const OLD_PACK_HASH = 'oldhash00000000';

function stampedNode(raw: StampedNodeRaw): StampedNodeRaw {
  return raw;
}

/** 一份最小的 parts 结构文档：root → section → column → cluster → item。 */
function makeTree(): StampedTree {
  const docStamp = {
    kind: 'doc',
    v: 1,
    header: {},
    overview: {},
    sections: [{ id: 's1', text: '战斗界面' }],
    structure: 'parts',
    parts: {
      structure: 'parts',
      packHash: OLD_PACK_HASH,
      components: { top: 'k1', chapter: 'k2', cluster: 'k3' }
    }
  };
  return {
    nodes: [
      stampedNode({
        id: 'root-1',
        name: '旧文档',
        type: 'FRAME',
        childIds: ['sec-1'],
        stamp: JSON.stringify(docStamp)
      }),
      stampedNode({
        id: 'sec-1',
        name: '界面说明1',
        type: 'FRAME',
        parentId: 'root-1',
        childIds: ['col-1'],
        stamp: JSON.stringify({
          kind: 'section',
          sid: 's1',
          name: '战斗界面',
          clusters: [{ id: 'c1', text: '经验条' }]
        })
      }),
      stampedNode({
        id: 'col-1',
        name: 'Text',
        type: 'FRAME',
        parentId: 'sec-1',
        childIds: ['cl-1'],
        stamp: JSON.stringify({ kind: 'slot', role: 'column' })
      }),
      stampedNode({
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
          items: [{ id: 'i1', t: 'rule', text: 'a' }]
        })
      }),
      stampedNode({
        id: 'it-1',
        name: '正文/规则',
        type: 'TEXT',
        parentId: 'cl-1',
        childIds: [],
        characters: 'a',
        stamp: JSON.stringify({ kind: 'item', iid: 'i1', t: 'rule', text: 'a' })
      })
    ],
    truncated: false,
    pageId: 'page-1',
    strayScratchIds: []
  };
}

interface Harness {
  backend: FigmaBackend;
  ops: ReconcileOp[];
  stampWrites: Array<{ nodeId: string; stamp: Record<string, unknown> | null }>;
}

function harness(): Harness {
  const ops: ReconcileOp[] = [];
  const stampWrites: Harness['stampWrites'] = [];
  const info = (id: string): NodeInfo => ({
    id,
    name: id,
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 }
  });
  const backend = {
    async readStampedTree() {
      return makeTree();
    },
    async stampNodes(entries: StampEntry[]) {
      for (const e of entries) stampWrites.push({ nodeId: e.nodeId, stamp: e.stamp });
    },
    async applyOps(batch: ReconcileOp[]): Promise<ApplyOpsResult> {
      ops.push(...batch);
      for (const op of batch) {
        if (op.op === 'stamp') stampWrites.push({ nodeId: op.nodeId, stamp: op.stamp });
      }
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
      /* geometry refresh is not what this test is about */
    },
    async moveNode() {
      /* no-op */
    }
  } as unknown as FigmaBackend;
  return { backend, ops, stampWrites };
}

let dir = '';
let packPath = '';
let currentPackHash = '';

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'gisop-adopt-'));
  packPath = join(dir, 'template.json');
  const packJson = {
    schema_version: 1,
    project: 'adopt',
    components: { top: 'k1', chapter: 'k2', cluster: 'k3' },
    capabilities: { badgeSlot: 'container' }
  };
  writeFileSync(packPath, JSON.stringify(packJson));
  const parsed = parseTemplatePack(packJson);
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  currentPackHash = packHash(parsed.pack);
});

afterAll(() => {
  delete process.env.GISOP_TEMPLATE_PACK;
  rmSync(dir, { recursive: true, force: true });
});

function usePack(on: boolean): void {
  if (on) process.env.GISOP_TEMPLATE_PACK = packPath;
  else delete process.env.GISOP_TEMPLATE_PACK;
}

async function sync(extra: {
  template?: { componentKey?: string };
  forceReconcile?: boolean;
  dryRun?: boolean;
}) {
  const h = harness();
  const r = await renderV2MarkdownToFigma(
    {
      markdown: MD,
      target: { rootId: 'root-1' },
      ...(extra.template ? { template: extra.template } : {}),
      ...(extra.forceReconcile ? { forceReconcile: true } : {}),
      dryRun: extra.dryRun
    },
    h.backend
  );
  return { r, h };
}

describe('E3 旧 pack 文档的 adopt 同步', () => {
  it('pack 缺失 + template.componentKey + dryRun：返回 changes 而不是 V2_PACK_MISMATCH', async () => {
    usePack(false);
    const { r } = await sync({ template: { componentKey: 'lib-key' }, dryRun: true });

    expect(r.errors.map((e) => e.code)).not.toContain('V2_PACK_MISMATCH');
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(r.mode).toBe('reconcile');
    expect(r.changes?.map((c) => c.path)).toContain('01/1/#1');
    expect(r.warnings.some((w) => w.code === 'V2_W_PACK_ADOPTED')).toBe(true);
  });

  it('pack 缺失且没有任何 adopt 信号：仍然拒绝，并在报错里指路', async () => {
    usePack(false);
    const { r } = await sync({ dryRun: true });
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.code).toBe('V2_PACK_MISMATCH');
    expect(r.errors[0]?.message).toContain('forceReconcile');
  });

  it('forceReconcile 可以显式降级（pack 缺失）', async () => {
    usePack(false);
    const { r } = await sync({ forceReconcile: true, dryRun: true });
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(r.warnings.some((w) => w.code === 'V2_W_PACK_ADOPTED')).toBe(true);
  });

  it('指纹变化 + forceReconcile：按当前包同步，成功后重打指纹', async () => {
    usePack(true);
    const { r, h } = await sync({ forceReconcile: true });
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    const rewritten = h.stampWrites
      .map((s) => s.stamp as { kind?: string; parts?: { packHash?: string } } | null)
      .filter((s) => s?.kind === 'doc')
      .pop();
    expect(rewritten?.parts?.packHash).toBe(currentPackHash);
    expect(rewritten?.parts?.packHash).not.toBe(OLD_PACK_HASH);
  });

  it('指纹变化但没有 forceReconcile：拒绝，报错里给出 adopt 选项', async () => {
    usePack(true);
    const { r } = await sync({ dryRun: true });
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.code).toBe('V2_PACK_MISMATCH');
    expect(r.errors[0]?.message).toContain('forceReconcile');
  });
});
