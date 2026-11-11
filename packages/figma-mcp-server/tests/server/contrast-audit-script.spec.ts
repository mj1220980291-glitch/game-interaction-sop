/**
 * 对比度体检脚本的真机回归（用假 figma 树跑**真脚本**）。
 *
 * 2026-11-06 验收打出的假阳性：正常配置下报 3 条 `V2_W_TEXT_CONTRAST_LOW`，
 * 数据一律是 `文字 #FFFFFF / 背景 #FFFFFF / 1.00:1`。根因是脚本把 TEXT 自己的
 * 填充当成了它的背景（自己比自己恒等于 1.00:1），与 geometry 在不在无关——
 * 这正好解释了「缺不缺 geometry 数值完全一样」。
 *
 * 这里不测封装，直接 `new Function('figma', …)` 执行插件脚本，避免同类错误再靠肉眼发现。
 */

import { describe, it, expect } from 'vitest';
import { buildContrastAuditScript } from '../../src/server/figmaConsoleBackend.js';

type FakeNode = {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  fills?: Array<{ type: string; color: { r: number; g: number; b: number }; opacity?: number; visible?: boolean }>;
  children?: FakeNode[];
};

const hexColor = (hex: string) => ({
  r: parseInt(hex.slice(1, 3), 16) / 255,
  g: parseInt(hex.slice(3, 5), 16) / 255,
  b: parseInt(hex.slice(5, 7), 16) / 255
});

const solid = (hex: string, opacity = 1) => [
  { type: 'SOLID', color: hexColor(hex), opacity, visible: true }
];

function runScript(
  roots: FakeNode[],
  rootIds: string[],
  min = 3,
  inherited?: string,
  bodyNames?: string[]
) {
  const byId = new Map<string, FakeNode>();
  const index = (n: FakeNode) => {
    byId.set(n.id, n);
    (n.children ?? []).forEach(index);
  };
  roots.forEach(index);
  const figma = { getNodeByIdAsync: async (id: string) => byId.get(id) ?? null };
  const code = buildContrastAuditScript(rootIds, min, inherited, bodyNames);
  // 插件脚本是函数体：末尾 `return out;`，用 async IIFE 包一层即可。
  const fn = new Function('figma', `return (async () => {${code}})();`);
  return fn(figma) as Promise<
    Array<{
      rootId: string;
      checked: number;
      lowContrast: number;
      skipped: number;
      basis?: 'body' | 'all-text';
      otherLowContrast?: number;
      skipReasons?: string[];
      samples?: Array<{
        textId: string;
        textName?: string;
        textFill: string;
        bgFill: string;
        ratio: number;
      }>;
    }>
  >;
}

/** 真机结构：文档 #1E1E1E → 章节外框 #000000 → 章节外框 #161616 → 章节(无填充) → 正文 */
function realDoc(textHex: string): FakeNode[] {
  return [
    {
      id: 'doc',
      name: '文档',
      type: 'FRAME',
      fills: solid('#1E1E1E'),
      children: [
        {
          id: 'shell0',
          name: '章节外框',
          type: 'FRAME',
          fills: solid('#000000'),
          children: [
            {
              id: 'shell1',
              name: '章节外框',
              type: 'FRAME',
              fills: solid('#161616'),
              children: [
                {
                  id: 'chapter',
                  name: '界面说明1',
                  type: 'FRAME',
                  fills: [],
                  children: [
                    { id: 'body1', name: '正文/规则', type: 'TEXT', fills: solid(textHex) },
                    { id: 'body2', name: '正文/规则', type: 'TEXT', fills: solid(textHex) }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ];
}

describe('对比度体检脚本', () => {
  it('深底白字不误报（2026-11-06 假阳性的回归）', async () => {
    const [row] = await runScript(realDoc('#FFFFFF'), ['doc']);
    expect(row.checked).toBe(2);
    expect(row.lowContrast).toBe(0);
    expect(row.samples).toEqual([]);
  });

  it('浅底浅字才报，且取的是祖先背景而不是文字自己的颜色', async () => {
    const doc = realDoc('#EEEEEE');
    // 把两层壳与根都改成白：模拟「pack 缺 geometry → 全程默认白」
    doc[0].fills = solid('#FFFFFF');
    doc[0].children![0].fills = solid('#FFFFFF');
    doc[0].children![0].children![0].fills = solid('#FFFFFF');

    const [row] = await runScript(doc, ['doc']);
    expect(row.checked).toBe(2);
    expect(row.lowContrast).toBe(2);
    expect(row.samples?.[0].textFill).toBe('#EEEEEE');
    expect(row.samples?.[0].bgFill).toBe('#FFFFFF');
    expect(row.samples?.[0].ratio).toBeLessThan(3);
    // 关键：不再是「自己比自己」
    expect(row.samples?.[0].textFill).not.toBe(row.samples?.[0].bgFill);
  });

  it('文字自己的填充不会被当成子节点背景', async () => {
    const roots: FakeNode[] = [
      {
        id: 'root',
        name: 'root',
        type: 'FRAME',
        fills: solid('#000000'),
        children: [
          {
            id: 'wrap',
            name: 'wrap',
            type: 'FRAME',
            fills: [],
            children: [{ id: 't', name: '正文', type: 'TEXT', fills: solid('#FFFFFF') }]
          }
        ]
      }
    ];
    const [row] = await runScript(roots, ['root']);
    expect(row.lowContrast).toBe(0);
    expect(row.checked).toBe(1);
  });

  it('没有实心祖先时计入 skipped，不算低对比', async () => {
    const roots: FakeNode[] = [
      {
        id: 'root',
        name: 'root',
        type: 'FRAME',
        fills: [],
        children: [{ id: 't', name: '正文', type: 'TEXT', fills: solid('#EEEEEE') }]
      }
    ];
    const [row] = await runScript(roots, ['root']);
    expect(row.lowContrast).toBe(0);
    expect(row.checked).toBe(0);
    expect(row.skipReasons).toContain('no-solid-ancestor');
  });

  it('INSTANCE 内部与隐藏节点跳过', async () => {
    const roots: FakeNode[] = [
      {
        id: 'root',
        name: 'root',
        type: 'FRAME',
        fills: solid('#FFFFFF'),
        children: [
          {
            id: 'inst',
            name: '组件实例',
            type: 'INSTANCE',
            children: [{ id: 'inner', name: '正文', type: 'TEXT', fills: solid('#FFFFFF') }]
          },
          { id: 'hidden', name: '正文', type: 'TEXT', visible: false, fills: solid('#FFFFFF') }
        ]
      }
    ];
    const [row] = await runScript(roots, ['root']);
    expect(row.lowContrast).toBe(0);
    expect(row.checked).toBe(0);
    expect(row.skipReasons).toEqual(expect.arrayContaining(['instance-internal', 'hidden']));
  });

  it('半透明 / 渐变填充不算背景', async () => {
    const roots: FakeNode[] = [
      {
        id: 'root',
        name: 'root',
        type: 'FRAME',
        fills: [
          { type: 'GRADIENT_LINEAR', color: hexColor('#000000'), visible: true },
          { type: 'SOLID', color: hexColor('#000000'), opacity: 0.2, visible: true }
        ],
        children: [{ id: 't', name: '正文', type: 'TEXT', fills: solid('#EEEEEE') }]
      }
    ];
    const [row] = await runScript(roots, ['root']);
    expect(row.checked).toBe(0);
    expect(row.skipReasons).toContain('no-solid-ancestor');
  });

  it('阈值可调', async () => {
    const doc = realDoc('#FFFFFF'); // 白字压 #161616，ratio ≈ 18
    const [rowHigh] = await runScript(doc, ['doc'], 21);
    expect(rowHigh.lowContrast).toBe(2);
    const [rowLow] = await runScript(doc, ['doc'], 3);
    expect(rowLow.lowContrast).toBe(0);
  });

  /**
   * 2026-11-06 验收用例 B 的不可达判据：审计从**章节**节点开始走，章节上方的
   * 根帧 / 章节外框不在子树里；没有 inheritedBackground 时，缺 geometry 的现场
   * （章节无底色）整章被跳过，恰好屏蔽掉 11-04 那类事故。
   */
  it('缺 geometry 的现场：靠继承背景报出真实颜色', async () => {
    // 章节自身无填充、内部也无实心容器（删掉 geometry 后的真实形状）
    const bare: FakeNode[] = [
      {
        id: 'ch1',
        name: '界面说明1',
        type: 'FRAME',
        fills: [],
        children: [{ id: 'body', name: '正文/规则', type: 'TEXT', fills: solid('#EEEEEE') }]
      }
    ];

    const [noInherit] = await runScript(bare, ['ch1']);
    expect(noInherit.lowContrast).toBe(0);
    expect(noInherit.skipReasons).toContain('no-solid-ancestor');

    const [withInherit] = await runScript(bare, ['ch1'], 3, '#FFFFFF');
    expect(withInherit.checked).toBe(1);
    expect(withInherit.lowContrast).toBe(1);
    expect(withInherit.samples?.[0]).toMatchObject({
      textFill: '#EEEEEE',
      bgFill: '#FFFFFF'
    });
    expect(withInherit.samples?.[0].ratio).toBeLessThan(1.5);
  });

  it('章节内的实心底会覆盖继承背景', async () => {
    const roots: FakeNode[] = [
      {
        id: 'ch1',
        name: '界面说明1',
        type: 'FRAME',
        fills: [],
        children: [
          {
            id: 'col',
            name: 'Text',
            type: 'FRAME',
            fills: solid('#161616'),
            children: [{ id: 'body', name: '正文/规则', type: 'TEXT', fills: solid('#EEEEEE') }]
          }
        ]
      }
    ];
    // 继承背景是白，但文字实际在 #161616 列里 → 不该报
    const [row] = await runScript(roots, ['ch1'], 3, '#FFFFFF');
    expect(row.checked).toBe(1);
    expect(row.lowContrast).toBe(0);
  });

  /**
   * 2026-11-10 验收：背景已正确，但样本取了章节标题的白字 → 报「文字 #FFFFFF /
   * 背景 #FFFFFF / 1.00:1」，而正文实际是 `#EEEEEE`。审计只统计正文层。
   */
  it('只统计正文层：标题白字不进样本', async () => {
    const roots: FakeNode[] = [
      {
        id: 'ch1',
        name: '躲藏者技能界面',
        type: 'FRAME',
        fills: [],
        children: [
          { id: 'title', name: '标题', type: 'TEXT', fills: solid('#FFFFFF') },
          { id: 'num', name: '标号/1', type: 'TEXT', fills: solid('#FFFFFF') },
          { id: 'body1', name: '正文/规则', type: 'TEXT', fills: solid('#EEEEEE') },
          { id: 'body2', name: '正文/规则', type: 'TEXT', fills: solid('#EEEEEE') }
        ]
      }
    ];

    const [row] = await runScript(roots, ['ch1'], 3, '#FFFFFF');
    expect(row.basis).toBe('body');
    expect(row.checked).toBe(2);
    expect(row.lowContrast).toBe(2);
    // 样本必须是正文，不是标题
    expect(row.samples?.every((s) => s.textFill === '#EEEEEE')).toBe(true);
    expect(row.samples?.[0].bgFill).toBe('#FFFFFF');
    expect(row.samples?.[0].ratio).toBeGreaterThan(1);
    expect(row.samples?.[0].ratio).toBeLessThan(1.2);
    expect(row.samples?.[0].textName).toBe('正文/规则');
    // 标题 / 标号同样偏低，但单列出来不混进正文计数
    expect(row.otherLowContrast).toBe(2);
  });

  it('正文层名对不上时退回全部文本，并标明口径', async () => {
    const roots: FakeNode[] = [
      {
        id: 'ch1',
        name: '界面说明1',
        type: 'FRAME',
        fills: [],
        children: [{ id: 'body', name: '说明文字', type: 'TEXT', fills: solid('#EEEEEE') }]
      }
    ];
    const [row] = await runScript(roots, ['ch1'], 3, '#FFFFFF', ['正文/规则']);
    expect(row.basis).toBe('all-text');
    expect(row.checked).toBe(1);
    expect(row.lowContrast).toBe(1);
    expect(row.samples?.[0].textFill).toBe('#EEEEEE');
  });
});
