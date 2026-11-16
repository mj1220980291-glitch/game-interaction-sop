import { describe, it, expect } from 'vitest';
import { harness, type FakeNode } from './helpers/compile-backend-harness.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { buildFigmaConsoleBackend } from '../../src/server/figmaConsoleBackend.js';

describe('verify 导入阶段诊断', () => {
  function diagnosticBackend(fail: 'import' | 'serialize' | 'parent' | 'missing' | 'none') {
    let removed = 0;
    const instance = {
      id: 'probe:1', name: 'probe', type: 'INSTANCE',
      get absoluteBoundingBox() { if (fail === 'serialize') throw new Error('bounds unavailable'); return null; },
      remove() { removed += 1; }
    };
    const figma = {
      fileKey: 'sandbox-file',
      importComponentByKeyAsync: async () => {
        if (fail === 'import') throw new Error('network unavailable');
        if (fail === 'missing') throw new Error('Could not find published component');
        return { id: 'comp:1', name: 'comp', type: 'COMPONENT', createInstance: () => instance };
      },
      getNodeByIdAsync: async () => null
    };
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    const calls: Array<{ fileKey?: string }> = [];
    const client = { callTool: async ({ arguments: args }: { arguments: { code: string; fileKey?: string } }) => {
      calls.push(args);
      try {
        const result = await new AsyncFunction('figma', args.code)(figma);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, result }) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: (e as Error).message }) }] };
      }
    } } as unknown as Client;
    return { backend: buildFigmaConsoleBackend(client, 'sandbox-file'), calls, removed: () => removed };
  }

  it('import 脚本失败包含 key/实际文件/绑定文件/阶段，不误判 stale', async () => {
    const h = diagnosticBackend('import');
    await expect(h.backend.instantiateByKey!({ componentKey: 'chapter-key' })).rejects.toMatchObject({
      message: expect.stringContaining('stage=import actualFile=sandbox-file')
    });
    await expect(h.backend.importComponentByKey!('top-key')).rejects.toThrow('importComponentByKey key=top-key file=sandbox-file');
    expect(h.calls.every((c) => c.fileKey === 'sandbox-file')).toBe(true);
    expect(h.calls).toHaveLength(2);
  });

  it.each(['serialize', 'parent'] as const)('%s 失败清理新实例，保留具体阶段，不宣称 key 失效', async (fail) => {
    const h = diagnosticBackend(fail);
    try {
      await h.backend.instantiateByKey!({ componentKey: 'chapter-key', ...(fail === 'parent' ? { parentId: 'absent' } : {}) });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toContain(`stage=${fail}`);
      expect((e as Error).message).toContain('key=chapter-key');
      expect((e as { code?: string }).code).toBeUndefined();
    }
    expect(h.removed()).toBe(1);
    expect(h.calls).toHaveLength(1);
  });

  it('仅明确找不到组件保留 stale 分类', async () => {
    const h = diagnosticBackend('missing');
    await expect(h.backend.instantiateByKey!({ componentKey: 'missing-key' })).rejects.toMatchObject({ code: 'V2_TEMPLATE_KEY_STALE' });
  });

  it('成功实例化不清理返回实例', async () => {
    const h = diagnosticBackend('none');
    expect((await h.backend.instantiateByKey!({ componentKey: 'chapter-key' })).id).toBe('probe:1');
    expect(h.removed()).toBe(0);
  });
});

describe('buildChapterShell · 插件脚本结构回归', () => {
  // 执行实际生成的插件脚本；不把 written:true 当结构正确。
  function chapterHarness(nested = true, named = true) {
    let seq = 0;
    class Node {
      id = `node:${++seq}`;
      children: Node[] = [];
      parent: Node | null = null;
      x = 0; y = 0; width = 100; height = 100;
      visible = true; fills: unknown[] = []; strokes: unknown[] = [];
      cornerRadius = 0; clipsContent = false; layoutMode = 'NONE';
      private positioning = 'AUTO';
      get layoutPositioning() { return this.positioning; }
      set layoutPositioning(value: string) {
        if (value === 'ABSOLUTE' && (!this.parent?.layoutMode || this.parent.layoutMode === 'NONE')) {
          throw new Error('in set_layoutPositioning: Can only set layoutPositioning = ABSOLUTE if the parent node has layoutMode !== NONE');
        }
        this.positioning = value;
      }
      primaryAxisSizingMode = 'FIXED'; counterAxisSizingMode = 'FIXED';
      paddingLeft = 0; paddingRight = 0; paddingTop = 0; paddingBottom = 0;
      itemSpacing = 0; fontWeight = 400; fontName = { family: 'Project Font', style: 'Regular' };
      characters = '';
      constructor(public name: string, public type = 'FRAME') {}
      resize(w: number, h: number) { this.width = w; this.height = h; }
      appendChild(child: Node) {
        if (child.parent) child.parent.children = child.parent.children.filter((n) => n !== child);
        this.children = [...this.children, child]; child.parent = this;
      }
      insertChild(index: number, child: Node) {
        this.appendChild(child); this.children.pop(); this.children.splice(index, 0, child);
      }
      findAll(predicate: (n: Node) => boolean): Node[] {
        return this.children.flatMap((n) => [...(predicate(n) ? [n] : []), ...n.findAll(predicate)]);
      }
      clone(): Node {
        if (this.name === 'Text') throw new Error('must not clone business column');
        const copy = new Node(this.name, this.type);
        Object.assign(copy, this, { id: copy.id, children: [], parent: null });
        for (const child of [...this.children]) copy.appendChild(child.clone());
        // Figma clone() 插入源节点同级；重挂后仍保留 positioning。
        this.parent?.appendChild(copy);
        return copy;
      }
    }
    const page = new Node('Page', 'PAGE');
    const source = new Node('卡片'); source.resize(4694, 2500);
    source.layoutMode = nested ? 'VERTICAL' : 'HORIZONTAL';
    source.paddingLeft = source.paddingRight = 100;
    source.paddingTop = source.paddingBottom = 80;
    source.cornerRadius = 32; source.fills = [{ type: 'SOLID' }];
    page.appendChild(source);
    const title = new Node('标题'); const text = new Node('#Name', 'TEXT');
    text.characters = '章节占位'; title.appendChild(text);
    const state = new Node('状态占位', 'TEXT'); state.characters = '状态占位'; state.resize(4494, 115);
    if (nested) { source.appendChild(title); source.appendChild(state); }
    const host = nested ? new Node('sect') : source;
    host.layoutMode = 'HORIZONTAL'; host.itemSpacing = 120;
    if (nested) source.appendChild(host);
    const stage = new Node(named ? '舞台' : '图片区'); stage.resize(2400, 1500);
    const main = new Node('主图占位', 'RECTANGLE'); main.resize(2200, 1300);
    main.x = 20; main.y = 30; stage.appendChild(main);
    const bubbles = new Node('气泡'); const master = new Node('标号/母版'); master.visible = false;
    master.appendChild(new Node('#Number', 'TEXT')); bubbles.appendChild(master); stage.appendChild(bubbles);
    const column = new Node(named ? 'Text' : '说明栏'); column.resize(1974, 2000); column.x = 2520;
    column.layoutMode = 'VERTICAL'; column.appendChild(new Node('业务簇'));
    host.appendChild(stage); host.appendChild(column);
    const figma = {
      currentPage: page,
      getNodeByIdAsync: async (id: string) => [page, ...page.findAll(() => true)].find((n) => n.id === id),
      createFrame: () => new Node('Frame'), createRectangle: () => new Node('Rectangle', 'RECTANGLE'),
      createText: () => new Node('Text', 'TEXT'), loadFontAsync: async () => {}
    };
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    const client = { callTool: async ({ arguments: args }: { arguments: { code: string } }) => {
      const result = await new AsyncFunction('figma', args.code)(figma);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result }) }] };
    } } as unknown as Client;
    return { backend: buildFigmaConsoleBackend(client), page, source, title, host, stage, column, Node };
  }

  it('完整4694卡片：保留标题/状态/sect/舞台/母版；仅掏空右列、替换主图', async () => {
    const h = chapterHarness();
    await h.backend.buildChapterShell!({ sourceId: h.source.id, titleSourceId: h.title.id });
    const out = h.page.children[1]!;
    expect(out.width).toBe(4694);
    expect(out.cornerRadius).toBe(32);
    expect(out.paddingLeft).toBe(100);
    expect(out.fills).toEqual(h.source.fills);
    expect(out.children.map((n) => n.name)).toEqual(['标题', '状态占位', 'sect']);
    const sect = out.children[2]!;
    expect(sect.layoutMode).toBe('HORIZONTAL'); expect(sect.itemSpacing).toBe(120);
    expect(sect.children.map((n) => n.name)).toEqual(['舞台', 'Text']);
    const stage = sect.children[0]!;
    expect([stage.width, stage.height]).toEqual([2400, 1500]);
    const image = stage.children[0]!;
    expect([image.width, image.height, image.x, image.y]).toEqual([2200, 1300, 20, 30]);
    expect(stage.findAll((n) => n.name === '标号/母版')[0]!.visible).toBe(false);
    expect(sect.children[1]!.children).toEqual([]);
    expect(sect.children[1]!.width).toBe(1974);
    expect(out.findAll((n) => n.name === '#Name')).toHaveLength(1);
    expect(out.findAll((n) => n.type === 'TEXT').every((n) => n.fontName.family === 'Noto Sans SC')).toBe(true);
    expect(h.source.children.map((n) => n.name)).toEqual(['标题', '状态占位', 'sect']);
    expect(h.column.children).toHaveLength(1);
  });

  it.each([true, false])('ABSOLUTE 气泡重挂自由布局舞台不触发插件约束（nested=%s）', async (nested) => {
    const h = chapterHarness(nested);
    h.stage.layoutMode = 'HORIZONTAL';
    const bubble = h.stage.children.find((n) => n.name === '气泡')!;
    bubble.layoutPositioning = 'ABSOLUTE';
    bubble.x = 37; bubble.y = 59;
    // 另一个 ABSOLUTE 节点仍在自动布局父级，必须保留定位方式。
    h.stage.layoutPositioning = 'ABSOLUTE';
    await h.backend.buildChapterShell!({ sourceId: h.source.id });
    const out = h.page.children[1]!;
    const stage = out.findAll((n) => n.name === '舞台')[0]!;
    const copy = stage.children.find((n) => n.name === '气泡')!;
    expect(stage.layoutMode).toBe('NONE');
    expect(stage.layoutPositioning).toBe('ABSOLUTE');
    expect([copy.x, copy.y]).toEqual([37, 59]);
    expect(h.stage.layoutMode).toBe('HORIZONTAL');
    expect(bubble.layoutPositioning).toBe('ABSOLUTE');
    expect(bubble.parent).toBe(h.stage);
  });

  it('插件 mock 拒绝在 NONE/无父级下设置 ABSOLUTE，允许自动布局父级', () => {
    const h = chapterHarness();
    const node = new h.Node('定位');
    expect(() => { node.layoutPositioning = 'ABSOLUTE'; }).toThrow(/parent node has layoutMode !== NONE/);
    h.stage.appendChild(node);
    expect(() => { node.layoutPositioning = 'ABSOLUTE'; }).toThrow(/parent node has layoutMode !== NONE/);
    h.host.appendChild(node);
    expect(() => { node.layoutPositioning = 'ABSOLUTE'; }).not.toThrow();
  });

  it('明确直接左右列仍保留舞台与气泡', async () => {
    const h = chapterHarness(false);
    await h.backend.buildChapterShell!({ sourceId: h.source.id });
    expect(h.page.children[1]!.children.map((n) => n.name)).toEqual(['舞台', 'Text']);
    expect(h.page.children[1]!.findAll((n) => n.name === '气泡')).toHaveLength(1);
  });

  it('直接两列另传外置标题：仍进左列，不挤成第三列', async () => {
    const h = chapterHarness(false);
    h.page.appendChild(h.title);
    await h.backend.buildChapterShell!({ sourceId: h.source.id, titleSourceId: h.title.id });
    const out = h.page.children[2]!;
    expect(out.children.map((n) => n.name)).toEqual(['左列', 'Text']);
    expect(out.children[0]!.children.map((n) => n.name)).toEqual(['标题', '舞台']);
    expect(out.findAll((n) => n.name === '#Name')).toHaveLength(1);
  });

  it('旧无槽位直接左右列沿用左列+空说明栏', async () => {
    const h = chapterHarness(false, false);
    await h.backend.buildChapterShell!({ sourceId: h.source.id });
    const out = h.page.children[1]!;
    expect(out.children.map((n) => n.name)).toEqual(['左列', 'Text']);
    expect(out.width).toBe(4494);
  });

  it('重复或不完整槽位明确失败，不生成横条', async () => {
    const h = chapterHarness();
    h.host.appendChild(new h.Node('Text'));
    await expect(h.backend.buildChapterShell!({ sourceId: h.source.id })).rejects.toThrow(/ambiguous or incomplete/);
    expect(h.page.children).toHaveLength(1);
    h.host.children.pop(); h.stage.name = '未知图';
    await expect(h.backend.buildChapterShell!({ sourceId: h.source.id })).rejects.toThrow(/ambiguous or incomplete/);
  });
});

const group: FakeNode = { id: 'g1', name: 'Group 2360', type: 'GROUP', data: {} };
const comp = (id: string, name: string, key?: string | null): FakeNode => ({
  id,
  name,
  type: 'COMPONENT',
  key,
  data: {}
});

describe('createComponentFromNode', () => {
  it('GROUP → COMPONENT，改名，id 变', async () => {
    const h = harness([group]);
    const n = await h.backend.createComponentFromNode!({ nodeId: 'g1', name: '惊魂 / 章节' });
    expect(n.type).toBe('COMPONENT');
    expect(n.name).toBe('惊魂 / 章节');
    expect(n.id).not.toBe('g1');
  });

  it('已是 COMPONENT 时只改名，id 不变', async () => {
    const h = harness([comp('c1', '模板')]);
    const n = await h.backend.createComponentFromNode!({ nodeId: 'c1', name: '1:14 / 顶部' });
    expect(n.id).toBe('c1');
    expect(n.name).toBe('1:14 / 顶部');
  });

  it('TEXT 拒绝转换', async () => {
    const h = harness([{ id: 't1', name: '标题', type: 'TEXT', data: {} }]);
    await expect(h.backend.createComponentFromNode!({ nodeId: 't1' })).rejects.toThrow(
      /unsupported type TEXT/
    );
  });
});

describe('detachInstance', () => {
  it('返回新 FRAME，id 与实例不同', async () => {
    const h = harness([{ id: 'i1', name: '标签=策划', type: 'INSTANCE', data: {} }]);
    const n = await h.backend.detachInstance!('i1');
    expect(n.type).toBe('FRAME');
    expect(n.id).not.toBe('i1');
  });
});

describe('combineAsVariants', () => {
  it('两个组件合成组件集', async () => {
    const h = harness([comp('a', '标签=策划'), comp('b', '标签=美术')]);
    const set = await h.backend.combineAsVariants!({
      componentIds: ['a', 'b'],
      parentId: 'page:1',
      name: '标签'
    });
    expect(set.name).toBe('标签');
    expect(set.type).toBe('OTHER');
  });

  it('少于两个组件拒绝', async () => {
    const h = harness([comp('a', '标签=策划')]);
    await expect(
      h.backend.combineAsVariants!({ componentIds: ['a'], parentId: 'page:1' })
    ).rejects.toThrow(/need at least 2/);
  });
});

describe('setPluginData', () => {
  it('写入并可用 null 清除', async () => {
    const h = harness([{ id: 'n1', name: '章节', type: 'FRAME', data: {} }]);
    await h.backend.setPluginData!([{ nodeId: 'n1', key: 'part', value: 'chapter' }]);
    expect(h.byId.get('n1')!.data['gisop/part']).toBe('chapter');
    await h.backend.setPluginData!([{ nodeId: 'n1', key: 'part', value: null }]);
    expect(h.byId.get('n1')!.data['gisop/part']).toBe('');
  });
});

describe('renameNode / readComponentKey', () => {
  it('改名', async () => {
    const h = harness([{ id: 'n1', name: '旧', type: 'FRAME', data: {} }]);
    await h.backend.renameNode!('n1', '新');
    expect(h.byId.get('n1')!.name).toBe('新');
  });

  it('组件有 key 时返回 key', async () => {
    const h = harness([comp('c1', '顶部', 'abc123')]);
    expect(await h.backend.readComponentKey!('c1')).toBe('abc123');
  });

  it('无 key / 非组件都返回 null 而不抛错', async () => {
    const h = harness([comp('c1', '顶部'), { id: 'f1', name: 'Frame', type: 'FRAME', data: {} }]);
    expect(await h.backend.readComponentKey!('c1')).toBeNull();
    expect(await h.backend.readComponentKey!('f1')).toBeNull();
    expect(await h.backend.readComponentKey!('nope')).toBeNull();
  });
});

describe('importComponentByKey', () => {
  it('已发布 key 取件成功', async () => {
    const h = harness([comp('c1', 'smoke publish test', 'f695a2')]);
    const n = await h.backend.importComponentByKey!('f695a2');
    expect(n.name).toBe('smoke publish test');
  });

  it('未发布 key 抛错（真机文案）', async () => {
    const h = harness([comp('c1', '模板', '6abec3')], { importFails: true });
    await expect(h.backend.importComponentByKey!('6abec3')).rejects.toThrow(
      /Could not find a published component/
    );
  });
});
