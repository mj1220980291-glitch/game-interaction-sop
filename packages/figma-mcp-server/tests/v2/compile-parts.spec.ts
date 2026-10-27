import { describe, it, expect } from 'vitest';
import type { FigmaBackend, NodeInfo, PluginDataEntry } from '../../src/v2/figma-client.js';
import { buildParts, isPublishableName, planParts } from '../../src/v2/compile/parts.js';

function fakeBackend(types: Record<string, NodeInfo['type']> = {}) {
  let seq = 0;
  const nodes = new Map<string, NodeInfo>(
    Object.entries(types).map(([id, type]) => [id, { id, name: id, type }])
  );
  const data: Record<string, Record<string, string | null>> = {};
  const calls: string[] = [];

  const backend = {
    async cloneNode({ sourceId, parentId }: { sourceId: string; parentId?: string }) {
      const src = nodes.get(sourceId)!;
      const n: NodeInfo = { ...src, id: `clone:${++seq}`, parentId };
      nodes.set(n.id, n);
      calls.push(`clone:${sourceId}->${parentId}`);
      return n;
    },
    async detachInstance(nodeId: string) {
      const n = nodes.get(nodeId)!;
      const f: NodeInfo = { ...n, id: `frame:${++seq}`, type: 'FRAME' };
      nodes.set(f.id, f);
      calls.push(`detach:${nodeId}`);
      return f;
    },
    async createComponentFromNode({ nodeId, name }: { nodeId: string; name?: string }) {
      const n = nodes.get(nodeId)!;
      const c: NodeInfo = { ...n, id: `comp:${++seq}`, type: 'COMPONENT', name: name ?? n.name };
      nodes.set(c.id, c);
      calls.push(`component:${c.name}`);
      return c;
    },
    async setPluginData(entries: PluginDataEntry[]) {
      for (const e of entries) {
        (data[e.nodeId] ??= {})[e.key] = e.value;
      }
    }
  } as unknown as FigmaBackend;

  return { backend, nodes, data, calls };
}

const THREE = { top: 's:t', chapter: 's:c', cluster: 's:k' };

describe('planParts', () => {
  it('三部件 + 无 footer → 3 步 + 1 条缺口', () => {
    const plan = planParts({ project: '惊魂寻宝队', staged: THREE });
    expect(plan.steps.map((s) => s.part)).toEqual(['top', 'chapter', 'cluster']);
    expect(plan.steps[0]!.name).toBe('惊魂寻宝队 / 顶部');
    expect(plan.gaps).toHaveLength(1);
    expect(plan.gaps[0]!.what).toContain('结尾');
  });

  it('缺 chapter 直接拒绝', () => {
    expect(() => planParts({ project: 'P', staged: { top: 'a', cluster: 'b' } })).toThrow(
      /缺「章节」/
    );
  });

  it('版本后缀进名字', () => {
    const plan = planParts({ project: 'P', staged: THREE, versionSuffix: '-v2' });
    expect(plan.steps[1]!.name).toBe('P / 章节-v2');
  });

  it('项目名含文件系统保留字符 → 拒绝（配置文件名会写不出来）', () => {
    expect(() => planParts({ project: '1:14 官方', staged: THREE })).toThrow(/保留字符/);
  });

  it('项目名以 _ 开头 → 命名红线', () => {
    expect(() => planParts({ project: '_P', staged: THREE })).toThrow(/不发布/);
  });
});

describe('isPublishableName', () => {
  it('_ 与 . 前缀不可发布', () => {
    expect(isPublishableName('_smoke')).toBe(false);
    expect(isPublishableName('.hidden')).toBe(false);
    expect(isPublishableName('P / 顶部')).toBe(true);
  });
});

describe('buildParts', () => {
  const pageId = 'page:lib';

  it('克隆 → 变组件 → 打 part/project 锚点', async () => {
    const h = fakeBackend({ 's:t': 'FRAME', 's:c': 'GROUP', 's:k': 'FRAME' });
    const r = await buildParts({ project: 'P', staged: THREE, pageId, backend: h.backend });

    expect(r.built.map((b) => b.part)).toEqual(['top', 'chapter', 'cluster']);
    expect(h.calls).toContain('clone:s:t->page:lib');
    expect(h.calls).toContain('component:P / 章节');
    const chapterComp = r.built[1]!.componentId;
    expect(h.data[chapterComp]!['part']).toBe('chapter');
    expect(h.data[chapterComp]!['project']).toBe('P');
  });

  it('粘进来的是实例时先拆一层再变组件', async () => {
    const h = fakeBackend({ 's:t': 'INSTANCE', 's:c': 'FRAME', 's:k': 'FRAME' });
    const r = await buildParts({ project: 'P', staged: THREE, pageId, backend: h.backend });
    expect(h.calls.some((c) => c.startsWith('detach:'))).toBe(true);
    expect(r.built[0]!.part).toBe('top');
  });

  it('后端缺 createComponentFromNode → 明确拒绝', async () => {
    const h = fakeBackend({ 's:t': 'FRAME', 's:c': 'FRAME', 's:k': 'FRAME' });
    const broken = { ...h.backend, createComponentFromNode: undefined } as unknown as FigmaBackend;
    await expect(
      buildParts({ project: 'P', staged: THREE, pageId, backend: broken })
    ).rejects.toThrow(/createComponentFromNode/);
  });
});
