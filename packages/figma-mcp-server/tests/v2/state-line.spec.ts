/**
 * 状态行识别。
 *
 * Spec: markdown-v2-contract「状态行语法」
 * Change: openspec/changes/cluster-order-and-state-block
 */

import { describe, it, expect } from 'vitest';
import { parseStateLine, stateBoldLength, isLegacyStatePrefix } from '../../src/v2/state-line.js';

describe('parseStateLine', () => {
  it('只有名字的状态行整行命中', () => {
    expect(parseStateLine('默认状态')).toEqual({ name: '默认状态', nameEnd: 4 });
  });

  it('带出现条件的状态行只取冒号前', () => {
    expect(parseStateLine('冷却状态：技能释放后进入，冷却结束恢复默认')).toEqual({
      name: '冷却状态',
      nameEnd: 4
    });
  });

  it('半角冒号同样识别', () => {
    expect(parseStateLine('hover状态: 鼠标移入时')?.name).toBe('hover状态');
  });

  it('冒号前的空白不计入状态名', () => {
    expect(parseStateLine('选中状态 ：点击后')).toEqual({ name: '选中状态', nameEnd: 4 });
  });

  it('普通句子不命中', () => {
    expect(parseStateLine('进入战斗状态后顶部显示血条')).toBeNull();
    expect(parseStateLine('点击卡片后进入详情')).toBeNull();
  });

  it('head 超过 10 字不命中', () => {
    expect(parseStateLine('角色死亡后进入观战模式状态')).toBeNull();
  });

  it('head 少于 3 字不命中', () => {
    expect(parseStateLine('状态：xxx')).toBeNull();
  });

  it('head 含标点不命中', () => {
    expect(parseStateLine('死亡后，观战状态')).toBeNull();
  });

  it('配图行与旧的动效需求前缀行不命中', () => {
    expect(parseStateLine('配图：冷却状态')).toBeNull();
    expect(parseStateLine('配图卡片选中状态')).toBeNull();
    expect(parseStateLine('动效需求：进入冷却状态时播放')).toBeNull();
  });

  it('直接书写的动效句不命中', () => {
    expect(parseStateLine('进入选中状态时，卡片放大回弹，先快后慢')).toBeNull();
    expect(parseStateLine('冷却中，按钮遮罩顺时针匀速转出')).toBeNull();
  });

  it('旧前缀写法不命中', () => {
    expect(parseStateLine('状态·默认：无描边')).toBeNull();
  });
});

describe('stateBoldLength', () => {
  it('状态行返回状态名长度，否则 0', () => {
    expect(stateBoldLength('锁定状态：未解锁该地图时')).toBe(4);
    expect(stateBoldLength('默认无描边')).toBe(0);
  });
});

describe('isLegacyStatePrefix', () => {
  it('识别旧前缀', () => {
    expect(isLegacyStatePrefix('状态·默认：无描边')).toBe(true);
    expect(isLegacyStatePrefix('状态｜默认：无描边')).toBe(true);
    expect(isLegacyStatePrefix('默认状态')).toBe(false);
  });
});
