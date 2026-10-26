/**
 * adoptInstances 插件脚本级验证：detach → 变组件 → 原位换实例 → 变体集重组。
 */

import { describe, it, expect } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { buildFigmaConsoleBackend } from '../../src/server/figmaConsoleBackend.js';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...args: string[]
) => (...a: unknown[]) => Promise<unknown>;

interface N {
  id: string;
  type: string;
  name: string;
  children: N[];
  parent: N | null;
  x: number;
  y: number;
  main?: N;
}

function node(id: string, type: string, name: string, extra: Partial<N> = {}): N {
  return { id, type, name, children: [], parent: null, x: 0, y: 0, ...extra };
}

function attach(parent: N, child: N, index = parent.children.length) {
  if (child.parent) {
    const i = child.parent.children.indexOf(child);
    if (i >= 0) child.parent.children.splice(i, 1);
  }
  child.parent = parent;
  parent.children.splice(index, 0, child);
}

function adoptHarness() {
  let seq = 0;
  const id = (p: string) => `${p}:${++seq}`;

  const partsPage = node('parts', 'PAGE', 'parts');
  const root = node('root', 'COMPONENT', 'P / 顶部');
  const set = node('extset', 'COMPONENT_SET', '标签');
  const v1 = node('ext1', 'COMPONENT', '职能=策划');
  const v2 = node('ext2', 'COMPONENT', '职能=美术');
  attach(set, v1);
  attach(set, v2);
  const i1 = node('i1', 'INSTANCE', '标签', { main: v1 });
  const i2 = node('i2', 'INSTANCE', '标签', { main: v2 });
  attach(root, i1);
  attach(root, i2);

  const all = [partsPage, root, set, v1, v2, i1, i2];

  const real = (n: N): N => all.find((x) => x.id === n.id) ?? n;

  const wrap = (n: N) => {
    const w: Record<string, unknown> = {
      id: n.id,
      type: n.type,
      get name() {
        return n.name;
      },
      set name(v: string) {
        n.name = v;
      },
      x: n.x,
      y: n.y,
      get parent() {
        return n.parent ? wrap(n.parent) : null;
      },
      get children() {
        return n.children.map(wrap);
      },
      get mainComponent() {
        return n.main ? wrap(n.main) : null;
      },
      getMainComponentAsync: async () => (n.main ? wrap(n.main) : null),
      insertChild: (index: number, child: N) => attach(n, real(child), index),
      appendChild: (child: N) => attach(n, real(child)),
      detachInstance: () => {
        const p = n.parent!;
        const i = p.children.indexOf(n);
        p.children.splice(i, 1);
        const frame = node(id('frame'), 'FRAME', n.name);
        all.push(frame);
        attach(p, frame, i);
        return wrap(frame);
      },
      createInstance: () => {
        const inst = node(id('inst'), 'INSTANCE', n.name, { main: n });
        all.push(inst);
        return wrap(inst)
      }
    };
    return w as unknown as N & Record<string, () => unknown>;
  };

  const figma = {
    getNodeByIdAsync: async (nid: string) => {
      const hit = all.find((x) => x.id === nid);
      return hit ? wrap(hit) : null;
    },
    createComponentFromNode: (wrapped: N) => {
      const frame = real(wrapped);
      const p = frame.parent!;
      const i = p.children.indexOf(frame);
      p.children.splice(i, 1);
      const comp = node(id('comp'), 'COMPONENT', frame.name);
      attach(p, comp, i);
      all.push(comp);
      return wrap(comp);
    },
    combineAsVariants: (comps: N[], parent: N) => {
      const s = node(id('set'), 'COMPONENT_SET', 'Component Set');
      attach(real(parent), s);
      for (const c of comps) attach(s, real(c));
      all.push(s);
      return wrap(s);
    }
  };

  const client = {
    callTool: async ({ arguments: args }: { arguments: { code: string } }) => {
      const fn = new AsyncFunction('figma', args.code);
      const result = await fn(figma);
      return { content: [{ type: 'text', text: JSON.stringify({ _mcp: 'f', success: true, result }) }] };
    }
  } as unknown as Client;

  return { backend: buildFigmaConsoleBackend(client), root, partsPage };
}

describe('adoptInstances（插件脚本）', () => {
  it('两个变体实例 → 自有组件 + 重建组件集 + 原位换自家实例', async () => {
    const h = adoptHarness();
    const r = await h.backend.adoptInstances!({
      rootId: 'root',
      partsPageId: 'parts',
      project: 'P'
    });

    expect(r.adopted.map((a) => a.originalName)).toEqual(['职能=策划', '职能=美术']);
    expect(r.unresolved).toEqual([]);
    expect(r.sets).toHaveLength(1);
    expect(r.sets[0]!.name).toBe('P / 零件 / 标签');
    expect(r.sets[0]!.variants).toEqual(['职能=策划', '职能=美术']);
    expect(r.createdInstances).toHaveLength(2);

    // 部件里剩下的是实例，且指向我们自己组好的变体集成员
    expect(h.root.children.every((c) => c.type === 'INSTANCE')).toBe(true);
    const mains = h.root.children.map((c) => c.main!);
    expect(mains.every((m) => m.parent?.type === 'COMPONENT_SET')).toBe(true);
    expect(h.partsPage.children.map((c) => c.type)).toEqual(['COMPONENT_SET']);
  });
});
