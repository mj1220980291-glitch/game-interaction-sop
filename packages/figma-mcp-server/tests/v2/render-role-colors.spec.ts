/**
 * 职能标记上色：`@GUI` 这类句尾标记按 ROLE_COLORS 单独上色。
 *
 * Spec: template-render「职能标记」；蛋仔契约把职能写在条目句尾。
 */

import { describe, it, expect } from 'vitest';
import { roleColorRanges } from '../../src/v2/render.js';
import { ROLE_COLORS } from '../../src/v2/template-map.js';

describe('roleColorRanges', () => {
  it('句尾单个职能：区间正好盖住 token', () => {
    const text = '点击入口打开面板 @GUI';
    const ranges = roleColorRanges(text);
    expect(ranges).toEqual([{ start: 9, end: 13, color: ROLE_COLORS['@GUI'] }]);
    expect(text.slice(9, 13)).toBe('@GUI');
  });

  it('一行多个职能各自上色', () => {
    const text = '顶部弹出提示 @GUI @程序';
    const ranges = roleColorRanges(text);
    expect(ranges.map((r) => text.slice(r.start, r.end))).toEqual(['@GUI', '@程序']);
    expect(ranges.map((r) => r.color)).toEqual([ROLE_COLORS['@GUI'], ROLE_COLORS['@程序']]);
  });

  it('蛋仔的 VX / 音效 也有色值', () => {
    expect(roleColorRanges('切页签 @VX')[0]?.color).toBe(ROLE_COLORS['@VX']);
    expect(roleColorRanges('播放 @音效')[0]?.color).toBe(ROLE_COLORS['@音效']);
  });

  it('没有 token 时不产生区间', () => {
    expect(roleColorRanges('普通说明文字')).toEqual([]);
  });

  it('不误伤形近词（@GUILD 不是职能）', () => {
    const ranges = roleColorRanges('公会 @GUILD');
    expect(ranges.map((r) => '公会 @GUILD'.slice(r.start, r.end))).toEqual(['@GUI']);
  });
});
