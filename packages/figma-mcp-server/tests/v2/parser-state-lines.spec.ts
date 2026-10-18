/**
 * 簇内叙述顺序（T9）与状态行写法 — parser 软提醒。
 *
 * Spec: markdown-v2-contract「状态行语法」「簇内叙述顺序」
 * Change: openspec/changes/cluster-order-and-state-block
 */

import { describe, it, expect } from 'vitest';
import { parseV2 } from '../../src/v2/parser.js';
import { SOFT_WARNING_CODES } from '../../src/v2/ir.js';

const HEAD = `# 状态行文档

跟进UI：测试
需求组：测试
易协作链接：#待补充
最后更新时间：2026.10.17

## 设计总览

### 功能背景

背景。

### 核心交互

核心交互。
`;

function parseCluster(bullets: string) {
  return parseV2(`${HEAD}
## 01. 选图界面

### 地图卡片
@程序 @GUI

${bullets}
`);
}

function codes(r: ReturnType<typeof parseV2>): string[] {
  return r.warnings.map((w) => w.code);
}

const { W_STATE_LINES_SCATTERED, W_LEGACY_STATE_PREFIX } = SOFT_WARNING_CODES;

describe('parseV2 — 状态行与叙述顺序', () => {
  it('按顺序书写时无提醒', () => {
    const r = parseCluster(`- 展示可选地图，数据由策划配表
- 点击卡片选中该地图
- 默认状态
- 配图：卡片默认态
- 选中状态：点击卡片后进入，其他卡片同时取消选中
- 配图：卡片选中态
- 选中时播放一次音效
- 进入选中状态时，卡片放大回弹，先快后慢`);
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(codes(r)).toEqual([]);
  });

  it('状态行被普通规则隔开时提醒', () => {
    const r = parseCluster(`- 默认状态
- 点击卡片选中该地图
- 选中状态：点击卡片后进入`);
    expect(r.ok).toBe(true);
    expect(codes(r)).toEqual([W_STATE_LINES_SCATTERED]);
  });

  it('配图行不算隔断', () => {
    const r = parseCluster(`- 默认状态
- 配图：卡片默认态
- 选中状态：点击卡片后进入`);
    expect(codes(r)).toEqual([]);
  });

  it('动效句写在任何位置都不提醒（顺序只靠写作规范）', () => {
    const r = parseCluster(`- 点击卡片选中该地图
- 选中卡片时，卡片放大回弹，先快后慢
- 选中时播放一次音效`);
    expect(r.ok).toBe(true);
    expect(codes(r)).toEqual([]);
  });

  it('旧 状态· 前缀提醒', () => {
    const r = parseCluster(`- 状态·默认：无描边
- 状态｜选中：青色描边`);
    expect(r.ok).toBe(true);
    expect(codes(r)).toEqual([W_LEGACY_STATE_PREFIX, W_LEGACY_STATE_PREFIX]);
  });

  it('按 #### 分组分别检查', () => {
    const r = parseCluster(`#### 选择
- 默认状态
- 点击卡片选中该地图

#### 标签
- 带 MOD 标签状态：地图由玩家上传时显示`);
    expect(codes(r)).toEqual([]);
  });
});
