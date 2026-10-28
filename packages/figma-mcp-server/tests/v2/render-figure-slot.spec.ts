/**
 * 配图槽判定：名字统一是「配图」，类型不必跟官方一致。
 *
 * 官方 `1:14` 是「GROUP 内含配图占位」，蛋仔这类项目把一个裸矩形留在簇里。
 *
 * Spec: template-render「配图」；归一化只统一槽位名，不强制类型。
 */

import { describe, it, expect } from 'vitest';
import { isFigureSlot } from '../../src/v2/render.js';
import type { NodeInfo } from '../../src/v2/figma-client.js';

const slot = (type: NodeInfo['type'], name = '配图'): NodeInfo => ({ id: 'x', name, type });

describe('isFigureSlot', () => {
  it('GROUP / 裸 RECTANGLE / FRAME 命名「配图」都算槽', () => {
    expect(isFigureSlot(slot('GROUP'))).toBe(true);
    expect(isFigureSlot(slot('RECTANGLE'))).toBe(true);
    expect(isFigureSlot(slot('FRAME'))).toBe(true);
  });

  it('名字不对就不算', () => {
    expect(isFigureSlot(slot('RECTANGLE', '配图占位'))).toBe(false);
    expect(isFigureSlot(slot('RECTANGLE', 'image 37982'))).toBe(false);
  });

  it('文本节点即使同名也不算', () => {
    expect(isFigureSlot(slot('TEXT'))).toBe(false);
  });
});
