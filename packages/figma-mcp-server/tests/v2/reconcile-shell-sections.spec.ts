/**
 * 章节外框（`geometry.sectionShell`）下的同步快照。
 *
 * 真机（2026-10-31，`4233:58395`）：多部件文档每章各有一层「章节外框」，
 * 章节因此在各自壳里。旧逻辑只扫容器直属子级 → 4 章全被判「设计师删了」，
 * `changes` 恒为空却 `ok: true`。
 *
 * Spec: render-reconcile-parts「多部件文档渲染后携带标记」
 */

import { describe, it, expect } from 'vitest';
import { Tree } from '../../src/v2/reconcile/tree.js';
import { buildSnapshot } from '../../src/v2/reconcile/snapshot.js';
import type { StampedNodeRaw } from '../../src/v2/figma-client.js';

function node(
  id: string,
  name: string,
  parentId: string | null,
  children: string[],
  stamp: object | null,
  type: StampedNodeRaw['type'] = 'FRAME'
): StampedNodeRaw {
  return {
    id,
    name,
    type,
    parentId,
    childIds: children,
    characters: type === 'TEXT' ? '' : null,
    stamp: stamp ? JSON.stringify(stamp) : null
  } as StampedNodeRaw;
}

const DOC_STAMP = {
  kind: 'doc',
  v: 1,
  header: {},
  overview: {},
  sections: [{ id: 's1', text: '登录命名界面' }],
  structure: 'parts',
  parts: { structure: 'parts', packHash: 'h', components: {} }
};

function shellTree(): Tree {
  const nodes: StampedNodeRaw[] = [
    node('root', '文档', null, ['shell1', 'top'], DOC_STAMP),
    node('top', '顶部', 'root', [], { kind: 'slot', role: 'template' }),
    // 每章一层壳，壳本身是结构层（标 template）
    node('shell1', '章节外框', 'root', ['chap1'], { kind: 'slot', role: 'template' }),
    node('chap1', '界面说明1', 'shell1', ['col1', 'name1'], {
      kind: 'section',
      sid: 's1',
      name: '登录命名界面',
      clusters: []
    }),
    node('name1', '#Name', 'chap1', [], { kind: 'slot', role: 'section.name' }, 'TEXT'),
    node('col1', 'Text', 'chap1', [], { kind: 'slot', role: 'column' })
  ];
  return new Tree({ nodes, pageId: 'p' } as never, 'root');
}

describe('章节外框下的快照', () => {
  it('章节在壳里也能认出来，且不算 foreign', () => {
    const snap = buildSnapshot(shellTree());

    expect(snap.sections).toHaveLength(1);
    expect(snap.sections[0]?.W).toBe('登录命名界面');
    expect(snap.foreign.map((f) => f.id)).not.toContain('shell1');
  });

  it('没有章节标记的壳也不会吞掉章节', () => {
    const tree = shellTree();
    // 壳没被打标（老产物升级上来的情况）
    const shell = tree.get('shell1')!;
    shell.parsed = undefined;
    shell.stamp = null;

    const snap = buildSnapshot(tree);
    expect(snap.sections).toHaveLength(1);
  });
});
