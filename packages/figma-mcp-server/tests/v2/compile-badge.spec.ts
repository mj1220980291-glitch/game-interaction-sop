import { describe, it, expect } from 'vitest';
import type { FigmaBackend, NodeInfo, PluginDataEntry } from '../../src/v2/figma-client.js';
import { ensureBadgeContainer } from '../../src/v2/compile/badge-container.js';

function fakeBackend() {
  let seq = 0;
  const data: Record<string, Record<string, string | null>> = {};
  const calls: string[] = [];
  const backend = {
    async cloneNode({ sourceId, parentId, name }: { sourceId: string; parentId?: string; name?: string }) {
      const n: NodeInfo = { id: `clone:${++seq}`, name: name ?? sourceId, type: 'FRAME', parentId };
      calls.push(`clone:${sourceId}->${parentId}`);
      return n;
    },
    async setPluginData(entries: PluginDataEntry[]) {
      for (const e of entries) (data[e.nodeId] ??= {})[e.key] = e.value;
    }
  } as unknown as FigmaBackend;
  return { backend, data, calls };
}

describe('ensureBadgeContainer', () => {
  it('源模板自带容器时不动', async () => {
    const h = fakeBackend();
    const r = await ensureBadgeContainer({
      backend: h.backend,
      chapterComponentId: 'comp:1',
      alreadyHasContainer: true
    });
    expect(r.applied).toBe(false);
    expect(r.gaps).toHaveLength(0);
    expect(h.calls).toHaveLength(0);
  });

  it('无形态来源时只记缺口，不画东西', async () => {
    const h = fakeBackend();
    const r = await ensureBadgeContainer({ backend: h.backend, chapterComponentId: 'comp:1' });
    expect(r.applied).toBe(false);
    expect(r.gaps[0]!.impact).toContain('人工摆位');
    expect(h.calls).toHaveLength(0);
  });

  it('有来源时克隆进章节组件、命名气泡、打 role 锚点', async () => {
    const h = fakeBackend();
    const r = await ensureBadgeContainer({
      backend: h.backend,
      chapterComponentId: 'comp:1',
      containerSourceId: 'staged:bubble'
    });
    expect(r.applied).toBe(true);
    expect(h.calls[0]).toBe('clone:staged:bubble->comp:1');
    expect(h.data[r.containerId!]!['role']).toBe('badgeSlot');
    expect(r.gaps[0]!.impact).toContain('container');
  });
});
