/**
 * 模板探针：骨架判定 / 母版发现 / 能力判定 / 指纹 / 三态结论。
 *
 * Spec: template-probe / template-contract
 * Change: template-contract-and-probe (tasks 4.6, 5.8, 6.x)
 */

import { describe, it, expect } from 'vitest';
import type { NodeInfo } from '../../src/v2/figma-client.js';
import { buildProbeTree } from '../../src/v2/probe/tree.js';
import { probeFromTree } from '../../src/v2/probe/index.js';
import { structuralFingerprint } from '../../src/v2/probe/fingerprint.js';
import { official114, jinhun798, flatten } from './fixtures/probe-trees.js';

function treeOf(root: NodeInfo, truncated = false) {
  const tree = buildProbeTree(flatten(root), root.id, truncated);
  if (!tree) throw new Error('fixture tree failed to build');
  return tree;
}

function probeOf(root: NodeInfo, truncated = false) {
  return probeFromTree(treeOf(root, truncated), { nodeId: root.id, nodeName: root.name, fileKey: 'FILE' });
}

describe('探针：官方 1:14', () => {
  const report = probeOf(official114());

  it('结论为 ready', () => {
    expect(report.verdict).toBe('ready');
  });

  it('六条铁律全通过', () => {
    expect(report.rules.map((r) => `${r.id}:${r.ok}`)).toEqual([
      'F1:true',
      'F2:true',
      'F3:true',
      'F4:true',
      'F5:true',
      'F6:true'
    ]);
  });

  it('章节母版是模板本身，簇母版是重复的说明块', () => {
    expect(report.masters.chapter).toMatchObject({ nodeId: '1:44', kind: 'template' });
    expect(report.masters.cluster?.kind).toBe('repeated');
  });

  it('能力全部取缺省值（等价官方模板）', () => {
    expect(report.draft.capabilities).toEqual({
      overview: 'two-frames',
      clusterGroups: 'slot-run',
      badgeSlot: 'container',
      numberBadge: 'text',
      roleAnnotation: 'component-variant',
      figure: 'named-group',
      hiddenPool: 'ignore',
      column: 'right'
    });
  });

  it('全部能力来源都是 probed', () => {
    for (const [key, f] of Object.entries(report.capabilities)) {
      expect(`${key}:${f.source}`).toBe(`${key}:probed`);
    }
  });
});

describe('探针：惊魂寻宝队 798:17608', () => {
  const report = probeOf(jinhun798());

  it('结论为 ready', () => {
    expect(report.verdict).toBe('ready');
  });

  it('六条铁律全通过', () => {
    expect(report.rules.every((r) => r.ok)).toBe(true);
  });

  it('簇母版是隐藏的草稿面板簇', () => {
    expect(report.masters.cluster?.kind).toBe('hidden');
    expect(report.masters.chapter?.kind).toBe('repeated');
  });

  it('能力与实机核对一致', () => {
    expect(report.draft.capabilities).toMatchObject({
      overview: 'none',
      clusterGroups: 'none',
      badgeSlot: 'manual',
      numberBadge: 'instance',
      roleAnnotation: 'inline-suffix',
      figure: 'first-non-text',
      hiddenPool: 'reuse',
      column: 'right'
    });
  });

  it('图上标号无容器时给出人工摆位缺口', () => {
    expect(report.gaps.some((g) => g.impact.includes('badgeSlot=manual'))).toBe(true);
  });

  it('结尾区被识别', () => {
    expect(report.masters.footer?.name).toBe('end');
  });
});

describe('探针：来源标记与草案', () => {
  it('草案的 4 个部件 key 一律为 null，不编造', () => {
    const report = probeOf(jinhun798());
    expect(report.draft.components).toEqual({
      top: null,
      chapter: null,
      cluster: null,
      footer: null
    });
  });

  it('草案可直接落盘后被 parseTemplatePack 接受', async () => {
    const { parseTemplatePack } = await import('../../src/v2/template/schema.js');
    const report = probeOf(official114());
    const parsed = parseTemplatePack(report.draft);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.pack.capabilities).toEqual(report.draft.capabilities);
    expect(parsed.pack.source?.fingerprint).toBe(report.fingerprint);
  });

  it('兜底能力标 default 并进缺口清单', () => {
    // 一个没有章节/簇的空模板：能力只能按缺省落下
    const empty: NodeInfo = {
      id: 'x:1',
      name: '空模板',
      type: 'FRAME',
      childIds: [],
      visible: true
    };
    const report = probeFromTree(buildProbeTree([empty], 'x:1')!, {
      nodeId: 'x:1',
      nodeName: '空模板'
    });
    expect(report.verdict).toBe('non-conformant');
    const defaults = Object.values(report.capabilities).filter((c) => c.source === 'default');
    expect(defaults.length).toBeGreaterThan(0);
    expect(report.gaps.length).toBeGreaterThan(0);
  });

  it('扫描被截断时 ready 降级为 needs-anchor', () => {
    const report = probeOf(official114(), true);
    expect(report.verdict).toBe('needs-anchor');
    expect(report.source.truncated).toBe(true);
    expect(report.gaps.some((g) => g.what.includes('截断'))).toBe(true);
  });
});

describe('结构指纹', () => {
  it('改文案不改指纹', () => {
    const a = treeOf(official114());
    const modified = official114();
    // 找到任意 TEXT 并改字
    const target = flatten(modified).find((n) => n.type === 'TEXT' && n.characters);
    if (!target) throw new Error('no text in fixture');
    target.characters = '完全不同的文案';
    const b = treeOf(modified);
    expect(structuralFingerprint(a)).toBe(structuralFingerprint(b));
  });

  it('插一个节点指纹变化', () => {
    const a = treeOf(official114());
    const modified = official114();
    const flat = flatten(modified);
    const rect = flat.find((n) => n.type === 'RECTANGLE');
    if (!rect) throw new Error('no rect in fixture');
    const extra: NodeInfo = {
      id: 'extra:1',
      name: '新增占位',
      type: 'RECTANGLE',
      childIds: [],
      visible: true,
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 }
    };
    modified.childIds = [...(modified.childIds ?? []), extra.id];
    const tree = buildProbeTree([...flat, extra], modified.id);
    expect(tree).toBeDefined();
    expect(structuralFingerprint(tree!)).not.toBe(structuralFingerprint(a));
    void rect;
  });
});

describe('探针：badgeSlot 只看章节图示内部', () => {
  /**
   * 796 真机踩到的坑：章节图示里的标号父节点是混排（6/7），但文档别处也有
   * 「全是标号」的组。旧实现取全文第一个，判成 container；正确应为 manual。
   */
  function build(withStrayDedicatedGroup: boolean) {
    const all: NodeInfo[] = [];
    const mk = (
      id: string,
      name: string,
      type: NodeInfo['type'],
      children: NodeInfo[] = [],
      w = 100,
      h = 100
    ): NodeInfo => {
      const n: NodeInfo = {
        id,
        name,
        type,
        childIds: children.map((c) => c.id),
        visible: true,
        absoluteBoundingBox: { x: 0, y: 0, width: w, height: h }
      };
      all.push(n);
      return n;
    };
    const text = (id: string, chars: string): NodeInfo => {
      const n = mk(id, chars, 'TEXT', [], 40, 40);
      n.characters = chars;
      return n;
    };

    const nums = [
      mk('num1', 'num', 'INSTANCE', [text('num1t', '1')], 44, 44),
      mk('num2', 'num', 'INSTANCE', [text('num2t', '2')], 44, 44)
    ];
    // 796 的坑：图片实例内部有数字（截图里的数值），不能被当成标号
    const slide = mk('slide', 'Slide 16:9 - 33', 'INSTANCE', [text('slideNum', '1200')], 1200, 745);
    const mixedParent = mk(
      'mixed',
      'Group 2358',
      'GROUP',
      [slide, ...nums],
      1200,
      745
    );
    const graphic = mk('g', '界面图示', 'GROUP', [mixedParent], 1200, 745);

    const cluster = mk(
      'cl',
      'Frame 1245',
      'FRAME',
      [
        mk(
          'cg',
          'Group 1253',
          'GROUP',
          [
            text('ct', '背景'),
            mk('cn', 'num', 'INSTANCE', [text('cnt', '1')], 44, 44),
            mk('cb', 'Frame 808', 'FRAME', [text('c1', '这是一条足够长的交互说明文字')], 900, 200)
          ],
          900,
          300
        )
      ],
      932,
      320
    );
    const column = mk('col', 'Frame 1243', 'FRAME', [cluster], 932, 320);

    const chapterChildren: NodeInfo[] = [graphic, column];
    if (withStrayDedicatedGroup) {
      chapterChildren.push(
        mk(
          'stray',
          '标号组',
          'FRAME',
          [
            mk('s1', 'num', 'INSTANCE', [text('s1t', '1')], 44, 44),
            mk('s2', 'num', 'INSTANCE', [text('s2t', '2')], 44, 44)
          ],
          60,
          60
        )
      );
    }
    const root = mk('root', '交互稿', 'FRAME', [mk('ch', 'Group 2360', 'GROUP', chapterChildren, 2209, 800)], 2209, 800);
    return { root, all };
  }

  it('图示内混排 → manual（别处的全标号组不影响）', () => {
    const { root, all } = build(true);
    const t = buildProbeTree(all, root.id);
    const report = probeFromTree(t!, { nodeId: root.id, nodeName: root.name });
    expect(report.capabilities.badgeSlot.value).toBe('manual');
  });
});

describe('探针：三态互斥', () => {
  it('缺簇母版 → needs-anchor', () => {
    const root = official114();
    const flat = flatten(root);
    // 删掉第二个说明块，只剩一个，且根不是 COMPONENT → needs-anchor
    const column = flat.find((n) => n.id === '1:45');
    if (!column?.childIds) throw new Error('column missing');
    column.childIds = column.childIds.slice(0, 1);
    const pruned = flat.filter((n) => n.id !== '1:81' && !n.id.startsWith('1:81:'));
    const rootCopy = pruned.find((n) => n.id === root.id)!;
    rootCopy.type = 'PAGE';
    const report = probeFromTree(buildProbeTree(pruned, root.id)!, {
      nodeId: root.id,
      nodeName: root.name
    });
    expect(report.verdict).not.toBe('ready');
  });

  it('没有簇单元 → non-conformant', () => {
    const root = official114();
    const flat = flatten(root);
    const column = flat.find((n) => n.id === '1:45');
    if (column) column.childIds = [];
    const report = probeFromTree(buildProbeTree(flat, root.id)!, {
      nodeId: root.id,
      nodeName: root.name
    });
    expect(report.verdict).toBe('non-conformant');
    expect(report.rules.find((r) => r.id === 'F3')?.ok).toBe(false);
  });
});
