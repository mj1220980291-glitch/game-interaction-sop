/**
 * parts 同步的纯函数层：指纹、结构档案、条目扫描、标记兼容。
 *
 * 端到端（打标 → 手改 → 同步）需要真机，这一层只锁"决定走哪条路"的判断，
 * 因为判断错了症状最隐蔽：不是报错，而是把引擎自己的节点当成设计师手改。
 *
 * Spec: openspec/changes/parts-doc-reconcile-sync
 */

import { describe, it, expect } from 'vitest';
import { packHash, packComponents } from '../../src/v2/template/pack-hash.js';
import { parseTemplatePack, DEFAULT_CAPABILITIES } from '../../src/v2/template/schema.js';
import { LEGACY_PROFILE, PARTS_PROFILE, profileFor } from '../../src/v2/reconcile/structure.js';
import { parseStamp, type DocStamp } from '../../src/v2/reconcile/stamp.js';
import { clusterItems, visibleIds } from '../../src/v2/render/parts/stamp-parts.js';
import { expectedItems } from '../../src/v2/reconcile/layout.js';
import { parseV2 } from '../../src/v2/parser.js';
import type { NodeInfo } from '../../src/v2/figma-client.js';

const COMPONENTS = { top: 'k1', chapter: 'k2', cluster: 'k3', footer: 'k4' };

function pack(overrides: Record<string, unknown> = {}) {
  const res = parseTemplatePack({
    schema_version: 1,
    project: 'demo',
    source: { fileKey: 'f', nodeIds: ['1:1'] },
    components: COMPONENTS,
    capabilities: { ...DEFAULT_CAPABILITIES },
    anchors: {},
    mdContract: '.interaction-sop/md-contract.md',
    ...overrides
  });
  if (!res.ok) throw new Error(`pack fixture invalid: ${res.errors.join('; ')}`);
  return res.pack;
}

describe('packHash — 部件指纹', () => {
  it('同一份包稳定（与键顺序无关）', () => {
    const a = pack();
    const b = pack({ components: { footer: 'k4', cluster: 'k3', chapter: 'k2', top: 'k1' } });
    expect(packHash(a)).toBe(packHash(b));
  });

  it('部件 key 变了就不是同一份包', () => {
    expect(packHash(pack())).not.toBe(packHash(pack({ components: { ...COMPONENTS, cluster: 'k9' } })));
  });

  it('能力变了也不是同一份包', () => {
    const changed = pack({ capabilities: { ...DEFAULT_CAPABILITIES, figure: 'none' } });
    expect(packHash(pack())).not.toBe(packHash(changed));
  });

  it('components 摘要丢掉空 key', () => {
    expect(Object.keys(packComponents(pack()))).toHaveLength(4);
  });
});

describe('profileFor — 结构档案分派', () => {
  const base: DocStamp = { kind: 'doc', v: 1, header: {}, overview: {}, sections: [] };

  it('没有 structure 的老文档按 legacy 处理', () => {
    expect(profileFor(base)).toBe(LEGACY_PROFILE);
  });

  it('显式 structure=legacy 也是 legacy', () => {
    expect(profileFor({ ...base, structure: 'legacy' })).toBe(LEGACY_PROFILE);
  });

  it('带 parts 指纹的文档走 parts', () => {
    const stamp: DocStamp = { ...base, structure: 'parts', parts: { structure: 'parts', packHash: 'x', components: {} } };
    expect(profileFor(stamp)).toBe(PARTS_PROFILE);
  });

  it('只有 structure=parts（指纹缺失）也走 parts', () => {
    expect(profileFor({ ...base, structure: 'parts' })).toBe(PARTS_PROFILE);
  });
});

describe('parseStamp — 兼容旧标记', () => {
  it('读取带 parts 的 doc 标记', () => {
    const raw = JSON.stringify({
      kind: 'doc',
      v: 1,
      header: {},
      overview: {},
      sections: [],
      structure: 'parts',
      parts: { structure: 'parts', packHash: 'abc', components: { top: 'k1' } }
    });
    const parsed = parseStamp(raw);
    expect(parsed?.kind).toBe('doc');
    expect((parsed as DocStamp).parts?.packHash).toBe('abc');
  });

  it('不含新字段的旧标记照样能读', () => {
    const parsed = parseStamp(JSON.stringify({ kind: 'doc', v: 1, header: {}, overview: {}, sections: [] }));
    expect(parsed?.kind).toBe('doc');
    expect((parsed as DocStamp).structure).toBeUndefined();
  });
});

describe('clusterItems — 跳过隐藏备用池', () => {
  const node = (id: string, name: string, extra: Partial<NodeInfo> = {}): NodeInfo =>
    ({ id, name, type: 'TEXT', ...extra }) as NodeInfo;

  it('只收可见的正文/配图，按文档顺序', () => {
    const nodes = [
      node('c', '簇'),
      node('b1', '正文/规则'), 
      node('wrapper', 'Frame 808'),
      node('b2', '正文/规则'),
      node('f1', '配图', { type: 'RECTANGLE' }),
      node('hidden', '正文/规则', { visible: false })
    ];
    expect(clusterItems(nodes, 'c').map((i) => [i.id, i.t])).toEqual([
      ['b1', 'rule'],
      ['b2', 'rule'],
      ['f1', 'figure']
    ]);
  });

  it('隐藏外壳里的条目也不算', () => {
    const nodes = [
      node('c', '簇'),
      node('pool', 'Group 1', { visible: false }),
      node('inside', '正文/规则', { parentId: 'pool' } as Partial<NodeInfo>)
    ];
    expect(visibleIds(nodes).has('inside')).toBe(false);
    expect(clusterItems(nodes, 'c')).toHaveLength(0);
  });
});

describe('expectedItems — parts 不把 @职能 当文本条目', () => {
  const MD = `# t

跟进UI：a
需求组：b
易协作链接：#待补充
最后更新时间：2026.11.02

## 设计总览

### 功能背景

背景。

### 核心交互

点击。

## 01. 战斗

### 命中判定
@程序

- 普通规则
- @程序：职责描述
- 另一条规则
`;

  const cluster = () => {
    const parsed = parseV2(MD);
    return parsed.ir!.sections[0]!.clusters[0]!;
  };

  it('legacy 保留 role 条目', () => {
    expect(expectedItems(cluster()).map((i) => i.t)).toEqual(['rule', 'role', 'rule']);
  });

  it('parts 过滤 role 条目（否则幂等同步会重复插入正文）', () => {
    expect(expectedItems(cluster(), { includeRoles: false }).map((i) => i.t)).toEqual([
      'rule',
      'rule'
    ]);
  });
});

describe('expectedItems — parts 的条目序号不含 #### 子标题', () => {
  const MD = `# t

跟进UI：a
需求组：b
易协作链接：#待补充
最后更新时间：2026.11.02

## 设计总览

### 功能背景

背景。

### 核心交互

点击。

## 01. 战斗

### 命名输入框
@GUI

#### 基础行为
- 默认显示输入框
- 点击后获得焦点

#### 控件状态
- 默认状态：无描边
- 悬停状态：高亮
- 选中状态：青色描边
`;

  const cluster = () => parseV2(MD).ir!.sections[0]!.clusters[0]!;

  it('legacy 把子标题算成条目', () => {
    expect(expectedItems(cluster()).map((i) => i.t)).toEqual([
      'subtitle',
      'rule',
      'rule',
      'subtitle',
      'rule',
      'rule',
      'rule'
    ]);
  });

  it('parts 不打标子标题，序号也必须跳过它', () => {
    expect(expectedItems(cluster(), { includeSubtitles: false }).map((i) => i.t)).toEqual([
      'rule',
      'rule',
      'rule',
      'rule',
      'rule'
    ]);
  });
});
