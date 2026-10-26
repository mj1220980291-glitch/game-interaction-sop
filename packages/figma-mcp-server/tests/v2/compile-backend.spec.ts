import { describe, it, expect } from 'vitest';
import { harness, type FakeNode } from './helpers/compile-backend-harness.js';

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
