import { describe, it, expect } from 'vitest';
import type { FigmaBackend, PluginDataEntry } from '../../src/v2/figma-client.js';
import {
  applyPluginDataAnchors,
  createInvisibleAnchorSpec,
  mergeAnchorSpecs,
  nameAnchorSpec
} from '../../src/v2/compile/anchor.js';

function fakeBackend() {
  const writes: PluginDataEntry[] = [];
  const backend = {
    async setPluginData(entries: PluginDataEntry[]) {
      writes.push(...entries);
    },
    async createInvisibleAnchor({ parentId, role }: { parentId: string; role: string }) {
      return { id: `anchor:${role}`, name: `#anchor:${role}`, type: 'FRAME' as const, parentId };
    }
  } as unknown as FigmaBackend;
  return { backend, writes };
}

describe('anchor', () => {
  it('plugin data 优先：写 role:<role>，不写配置', async () => {
    const h = fakeBackend();
    const r = await applyPluginDataAnchors({
      backend: h.backend,
      entries: [{ role: 'clusterTitle', nodeId: 'n1' }]
    });
    expect(h.writes).toEqual([{ nodeId: 'n1', key: 'role:clusterTitle', value: 'clusterTitle' }]);
    expect(r.applied).toHaveLength(1);
    expect(r.anchors).toEqual({});
  });

  it('空输入不打任何东西', async () => {
    const h = fakeBackend();
    const r = await applyPluginDataAnchors({ backend: h.backend, entries: [] });
    expect(h.writes).toHaveLength(0);
    expect(r.applied).toHaveLength(0);
  });

  it('后端不支持 setPluginData → 明确报错，不静默降级', async () => {
    await expect(
      applyPluginDataAnchors({ backend: {} as FigmaBackend, entries: [{ role: 'figure', nodeId: 'n1' }] })
    ).rejects.toThrow(/setPluginData/);
  });

  it('不可见锚点：建节点并给出 invisible-frame 配置', async () => {
    const h = fakeBackend();
    const r = await createInvisibleAnchorSpec({ backend: h.backend, parentId: 'p1', role: 'badgeSlot' });
    expect(r.nodeId).toBe('anchor:badgeSlot');
    expect(r.spec).toEqual({ kind: 'invisible-frame', value: '#anchor:badgeSlot' });
  });

  it('降级配置里不含已用 plugin data 的槽位', () => {
    const merged = mergeAnchorSpecs(
      {
        clusterTitle: nameAnchorSpec('#Title_Main'),
        figure: { kind: 'invisible-frame', value: '#anchor:figure' }
      },
      [{ role: 'figure', nodeId: 'n2' }]
    );
    expect(merged).toEqual({ clusterTitle: { kind: 'name', value: '#Title_Main' } });
  });
});
