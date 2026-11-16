/**
 * adoptInstances 插件脚本级验证：detach → 变组件 → 原位换实例 → 变体集重组。
 */

import { describe, it, expect } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { buildFigmaConsoleBackend } from '../../src/server/figmaConsoleBackend.js';
import { arrangeCompiledParts } from '../../src/v2/compile/index.js';

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
  width: number;
  height: number;
  main?: N;
}

function node(id: string, type: string, name: string, extra: Partial<N> = {}): N {
  return { id, type, name, children: [], parent: null, x: 0, y: 0, width: 100, height: 60, ...extra };
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
  // 同一个源组件的第二个实例：应复用已收编的组件，而不是再造一个。
  const i3 = node('i3', 'INSTANCE', '标签', { main: v1 });
  attach(root, i1);
  attach(root, i2);
  attach(root, i3);

  const all = [partsPage, root, set, v1, v2, i1, i2, i3];

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
      get x() { return n.x; },
      set x(value: number) { n.x = value; },
      get y() { return n.y; },
      set y(value: number) { n.y = value; },
      get width() { return n.width; },
      get height() { return n.height; },
      resizeWithoutConstraints: (width: number, height: number) => {
        n.width = width; n.height = height;
      },
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
      remove: () => {
        const i = n.parent ? n.parent.children.indexOf(n) : -1;
        if (i >= 0) n.parent!.children.splice(i, 1);
      },
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
    expect(r.createdInstances).toHaveLength(3);
    // 两个源组件 → 两个自有组件；第三个实例复用，不再多造。
    expect(Object.keys(r.mapping)).toHaveLength(2);
    expect(r.adopted).toHaveLength(2);

    // 部件里剩下的是实例，且指向我们自己组好的变体集成员
    expect(h.root.children.every((c) => c.type === 'INSTANCE')).toBe(true);
    const mains = h.root.children.map((c) => c.main!);
    expect(mains.every((m) => m.parent?.type === 'COMPONENT_SET')).toBe(true);
    expect(h.partsPage.children.map((c) => c.type)).toEqual(['COMPONENT_SET']);
    const ownSet = h.partsPage.children[0]!;
    expect(ownSet.children.map((c) => [c.x, c.y])).toEqual([[40, 40], [40, 140]]);
    expect([ownSet.width, ownSet.height]).toEqual([180, 240]);
  });
});

describe('编译排列写入边界（实际插件脚本）', () => {
  function setup() {
    const page = node('page', 'PAGE', '项目');
    const old = [
      node('source', 'FRAME', '源稿', { x: -200, y: -100 }),
      node('old', 'COMPONENT', '旧组件', { x: 600, y: 900 }),
      node('section', 'SECTION', '旧项目区', { x: 1200, y: 2000, height: 800 })
    ];
    const nested = node('nested', 'COMPONENT', '既有嵌套组件');
    attach(old[2]!, nested);
    const a = node('new-a', 'COMPONENT', 'A', { width: 400 });
    const set = node('new-set', 'COMPONENT_SET', 'B', { width: 300 });
    const variant = node('variant', 'COMPONENT', '职能=GUI', { x: 40, y: 80 });
    attach(set, variant);
    for (const n of [...old, a, set]) attach(page, n);
    const all = [page, ...old, nested, a, set, variant];
    let calls = 0;
    const client = { callTool: async ({ arguments: args }: { arguments: { code: string } }) => {
      calls++;
      const result = await new AsyncFunction('figma', args.code)({
        getNodeByIdAsync: async (id: string) => all.find((n) => n.id === id)
      });
      return { content: [{ type: 'text', text: JSON.stringify({ _mcp: 'f', success: true, result }) }] };
    } } as unknown as Client;
    const snapshot = (nodes: N[]) => nodes.map((n) => ({
      id: n.id, x: n.x, y: n.y, width: n.width, height: n.height, parent: n.parent?.id
    }));
    return { backend: buildFigmaConsoleBackend(client), old, nested, a, set, variant, snapshot, calls: () => calls };
  }

  it('同页仅排新组件/集，旧根/Section/源稿坐标尺寸父级不变且避开旧区', async () => {
    const h = setup();
    const before = h.snapshot([...h.old, h.nested]);
    const result = await h.backend.arrangePageChildren!({
      pageId: 'page', nodeIds: ['new-set', 'new-a', 'new-a', 'variant', 'nested', 'section', 'source']
    });
    expect(result.map((n) => n.name)).toEqual(['A', 'B']);
    expect(h.snapshot([...h.old, h.nested])).toEqual(before);
    expect([h.a.x, h.a.y, h.set.x, h.set.y]).toEqual([0, 2920, 520, 2920]);
    expect([h.variant.x, h.variant.y, h.variant.parent?.id]).toEqual([40, 80, 'new-set']);
  });

  it('空或运行期缺失白名单零调用，不回退全页', async () => {
    const h = setup();
    expect(await h.backend.arrangePageChildren!({ pageId: 'page', nodeIds: [] })).toEqual([]);
    expect(await h.backend.arrangePageChildren!({ pageId: 'page' } as never)).toEqual([]);
    expect(h.calls()).toBe(0);
  });

  it('未知或非直属ID不提升到旧项目Section', async () => {
    const h = setup();
    const before = h.snapshot([...h.old, h.nested, h.a, h.set]);
    expect(await h.backend.arrangePageChildren!({ pageId: 'page', nodeIds: ['missing', 'nested'] })).toEqual([]);
    expect(h.snapshot([...h.old, h.nested, h.a, h.set])).toEqual(before);
  });

  it('compile同页合并去重只调用一次，旧资产不变', async () => {
    const h = setup();
    const before = h.snapshot(h.old);
    await arrangeCompiledParts(h.backend, [
      { pageId: 'page', nodeIds: ['new-a'] },
      { pageId: 'page', nodeIds: ['new-set', 'variant', 'new-a'] }
    ]);
    expect(h.calls()).toBe(1);
    expect(h.snapshot(h.old)).toEqual(before);
    expect([h.a.y, h.set.y]).toEqual([2920, 2920]);
  });

  it('compile异页分别传白名单，空组不调用', async () => {
    const h = setup();
    const calls: unknown[] = [];
    h.backend.arrangePageChildren = async (p) => { calls.push(p); return []; };
    await arrangeCompiledParts(h.backend, [
      { pageId: 'library', nodeIds: ['top', 'chapter'] },
      { pageId: 'parts', nodeIds: ['part', 'set'] },
      { pageId: 'empty', nodeIds: [] }
    ]);
    expect(calls).toEqual([
      { pageId: 'library', nodeIds: ['top', 'chapter'] },
      { pageId: 'parts', nodeIds: ['part', 'set'] }
    ]);
  });

  it('新产物换行仍有间距，不改集内部坐标', async () => {
    const h = setup();
    await h.backend.arrangePageChildren!({ pageId: 'page', nodeIds: ['new-a', 'new-set'], maxWidth: 500 });
    expect(h.set.x).toBe(0);
    expect(h.set.y).toBe(h.a.y + h.a.height + 120);
    expect([h.variant.x, h.variant.y]).toEqual([40, 80]);
  });
});
