import { describe, it, expect } from 'vitest';
import type { FigmaBackend, FigmaNodeType, NodeInfo } from '../../src/v2/figma-client.js';
import { intake } from '../../src/v2/compile/intake.js';

function backend(info: Record<string, { name: string; type: FigmaNodeType; w: number; h: number }>) {
  return {
    async getNodeInfo(id: string) {
      const hit = info[id];
      if (!hit) throw new Error(`node ${id} not found`);
      return {
        id,
        name: hit.name,
        type: hit.type,
        absoluteBoundingBox: { x: 0, y: 0, width: hit.w, height: hit.h }
      } as NodeInfo;
    }
  } as unknown as FigmaBackend;
}

const staged = { top: 's-top', chapter: 's-ch', cluster: 's-cl' };
const expected = {
  top: { name: '标题', width: 2205, height: 321 },
  chapter: { name: 'Group 2363', width: 2209, height: 6240 },
  cluster: { name: 'Frame 1244', width: 932, height: 1093 }
};

const good = {
  's-top': { name: '标题', type: 'GROUP' as FigmaNodeType, w: 2205, h: 321 },
  's-ch': { name: 'Group 2363', type: 'GROUP' as FigmaNodeType, w: 2209, h: 6240 },
  's-cl': { name: 'Frame 1244', type: 'FRAME' as FigmaNodeType, w: 932, h: 1093 },
  bubble: { name: '气泡', type: 'FRAME' as FigmaNodeType, w: 1920, h: 1080 }
};

describe('intake 进门检查', () => {
  it('齐全且尺寸吻合 → 通过', async () => {
    const r = await intake({ backend: backend(good), staged, expected });
    expect(r.ok).toBe(true);
    expect(r.checks.filter((c) => c.ok)).toHaveLength(3);
    expect(r.gaps).toHaveLength(0);
  });

  it('尺寸对不上 → 拒绝，并说清差在哪', async () => {
    const bad = { ...good, 's-ch': { name: 'Group 2363', type: 'FRAME' as FigmaNodeType, w: 1200, h: 675 } };
    await expect(intake({ backend: backend(bad), staged, expected })).rejects.toThrow(/尺寸对不上/);
  });

  it('漏粘一块 → 拒绝', async () => {
    await expect(
      intake({ backend: backend(good), staged: { top: 's-top', cluster: 's-cl' }, expected })
    ).rejects.toThrow(/缺「章节」/);
  });

  it('粘了文本节点 → 拒绝', async () => {
    const bad = { ...good, 's-top': { name: '标题', type: 'TEXT' as FigmaNodeType, w: 2205, h: 321 } };
    await expect(intake({ backend: backend(bad), staged, expected })).rejects.toThrow(/不能转成组件/);
  });

  it('名字不同只提醒，不拦', async () => {
    const renamed = { ...good, 's-top': { name: '标题 副本', type: 'GROUP' as FigmaNodeType, w: 2205, h: 321 } };
    const r = await intake({ backend: backend(renamed), staged, expected });
    expect(r.ok).toBe(true);
    expect(r.gaps[0]!.what).toContain('标题 副本');
  });

  it('标号容器必须是 FRAME', async () => {
    const bad = { ...good, bubble: { name: '气泡', type: 'GROUP' as FigmaNodeType, w: 1920, h: 1080 } };
    await expect(
      intake({ backend: backend(bad), staged, expected, badgeContainerSourceId: 'bubble' })
    ).rejects.toThrow(/标号容器应是 FRAME/);
  });

  it('节点不存在 → 拒绝', async () => {
    await expect(
      intake({ backend: backend(good), staged: { ...staged, top: 'nope' }, expected })
    ).rejects.toThrow(/找不到/);
  });
});
