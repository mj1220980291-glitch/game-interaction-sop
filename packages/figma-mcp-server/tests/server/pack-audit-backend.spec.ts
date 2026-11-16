/**
 * 后端侧两件事：
 *
 *   1. 库组件 key 失效 → `V2_TEMPLATE_KEY_STALE`（以前和「没连插件」「节点找不到」
 *      混在一起，看的人不知道去重取 key）
 *   2. `auditTextContrast` 把插件侧的聚合结果原样带回（祖先链遍历在插件里做）
 *
 * Spec: template-render「基线包 key 失效 SHALL 用专属错误码」等
 */

import { describe, it, expect } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getBridgeState, setBridgeState } from '../../src/server/bridgeState.js';
import { buildFigmaConsoleBackend } from '../../src/server/figmaConsoleBackend.js';

function clientReturning(payload: unknown): Client {
  return {
    async callTool() {
      return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
    }
  } as unknown as Client;
}

describe('readPaints 实例后代解析', () => {
  async function read(ids: string[], nodes: Record<string, unknown>) {
    const calls: string[] = [];
    const figma = {
      mixed: Symbol('mixed'),
      getNodeByIdAsync(id: string) {
        calls.push(id);
        // The live failing API never resolves. Never call it for instance IDs.
        if (id.startsWith('I')) return new Promise(() => {});
        return Promise.resolve(nodes[id] ?? null);
      }
    };
    const client = { async callTool(request: { arguments: { code: string; fileKey: string } }) {
      expect(request.arguments.fileKey).toBe('LIB');
      const result = await new Function('figma', `return (async () => {${request.arguments.code}})()`)(figma);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result }) }] };
    } } as unknown as Client;
    const rows = await buildFigmaConsoleBackend(client, 'LIB').readPaints(ids);
    return { rows, calls };
  }

  const solid = (r: number, visible = true) => ({ type: 'SOLID', color: { r, g: r, b: r }, visible });

  it('完整与嵌套实例 ID 只查根，树内精确匹配真实颜色', async () => {
    const a = { id: 'I1:2;3:4', fills: [solid(0.96)], strokes: [solid(0.75)] };
    const b = { id: 'I1:2;3:5;3:4', fills: [solid(0)], strokes: [] };
    const got = await read([a.id, b.id], { '1:2': { id: '1:2', children: [a, { id: 'branch', children: [b] }] } });
    expect(got.rows).toEqual([{ nodeId: a.id, fill: '#F5F5F5', stroke: '#BFBFBF' }, { nodeId: b.id, fill: '#000000' }]);
    expect(got.calls).toEqual(['1:2', '1:2']);
  });

  it('普通 ID 保留直查，mixed 与隐藏/非 SOLID 不泄漏 Symbol', async () => {
    const got = await read(['plain', 'mixed'], {
      plain: { id: 'plain', fills: [{ type: 'IMAGE' }, solid(0, false), solid(1)], strokes: [] },
      mixed: { id: 'mixed', fills: Symbol('mixed'), strokes: [solid(0, false)] }
    });
    expect(got.rows).toEqual([{ nodeId: 'plain', fill: '#FFFFFF' }, { nodeId: 'mixed' }]);
    expect(JSON.stringify(got.rows)).not.toContain('Symbol');
    expect(got.calls).toEqual(['plain', 'mixed']);
  });

  it('缺失根/后代/普通节点保持跳过且不直查后代', async () => {
    const got = await read(['Iabsent;child', 'Iroot;absent', 'absent'], { root: { id: 'root', children: [] } });
    expect(got.rows).toEqual([]);
    expect(got.calls).toEqual(['absent', 'root', 'absent']);
  });

  it('预算内最后节点仍可读，超预算保留操作/文件与原错', async () => {
    const children = Array.from({ length: 19999 }, (_, i) => ({ id: `Iroot;${i}`, fills: [] }));
    expect((await read(['Iroot;19998'], { root: { id: 'root', children } })).rows).toEqual([{ nodeId: 'Iroot;19998' }]);
    children.push({ id: 'Iroot;19999', fills: [] });
    await expect(read(['Iroot;19999'], { root: { id: 'root', children } })).rejects.toThrow(
      '[readPaints nodes=Iroot;19999 file=LIB] readPaints: instance traversal budget exceeded: Iroot;19999'
    );
  });
});

describe('共享桥最近执行证据', () => {
  it('启动 false 后内部成功执行刷新快照', async () => {
    setBridgeState({ pluginConnected: false, lastRoundtripMs: undefined });
    await buildFigmaConsoleBackend(clientReturning({ success: true, result: 1 })).healthCheck!();
    expect(getBridgeState().pluginConnected).toBe(true);
    expect(getBridgeState().lastRoundtripMs).toEqual(expect.any(Number));
  });

  it('导入脚本连接措辞不抹掉健康桥证据', async () => {
    setBridgeState({ pluginConnected: true, lastRoundtripMs: 2 });
    const backend = buildFigmaConsoleBackend(clientReturning({
      _mcp: 'figma-console-mcp', success: false,
      error: 'Error: Unable to establish connection to Figma after 10 seconds. Please check your internet connection.'
    }));
    await expect(backend.getNodeInfo('0:0')).rejects.toThrow('Unable to establish connection');
    expect(getBridgeState().pluginConnected).toBe(true);
    expect(getBridgeState().lastRoundtripMs).toBe(2);
  });

  it('明确桥不可连接才置 false', async () => {
    setBridgeState({ pluginConnected: true, holderPid: undefined, fallback: false });
    await expect(buildFigmaConsoleBackend(clientReturning({ success: false,
      error: 'Cannot connect to Figma Desktop' })).healthCheck!()).rejects.toThrow('Cannot connect');
    expect(getBridgeState().pluginConnected).toBe(false);
  });

  it('无 _mcp 的 error envelope 不成为节点数据', async () => {
    const backend = buildFigmaConsoleBackend(clientReturning({ error: 'No active file' }));
    await expect(backend.getNodeInfo('0:0')).rejects.toThrow('No active file');
  });

  it('MCP isError 即使含成功字段也必须失败', async () => {
    const client = { async callTool() { return { isError: true,
      content: [{ type: 'text', text: JSON.stringify({ success: true, result: 1 }) }] }; }
    } as unknown as Client;
    await expect(buildFigmaConsoleBackend(client).healthCheck!()).rejects.toThrow('figma_execute failed');
  });

  it('空回执不能通过 healthCheck，也不能伪造已连接', async () => {
    setBridgeState({ pluginConnected: false });
    const client = { async callTool() { return { content: [] }; } } as unknown as Client;
    await expect(buildFigmaConsoleBackend(client).healthCheck!()).rejects.toThrow('unexpected result');
    expect(getBridgeState().pluginConnected).toBe(false);
  });
});

describe('库组件 key 失效', () => {
  it('import 失败时给出 V2_TEMPLATE_KEY_STALE 与重取路径', async () => {
    const backend = buildFigmaConsoleBackend(
      clientReturning({
        _mcp: 'figma-console-mcp',
        success: false,
        error: 'Could not find component with key 961732772f617d5c934c1465041e6b08dcc3b0bc'
      })
    );

    await expect(
      backend.instantiateByKey({ componentKey: '961732772f617d5c934c1465041e6b08dcc3b0bc' })
    ).rejects.toMatchObject({
      code: 'V2_TEMPLATE_KEY_STALE',
      details: { componentKey: '961732772f617d5c934c1465041e6b08dcc3b0bc' }
    });

    let message = '';
    try {
      await backend.instantiateByKey({ componentKey: 'k-1', name: '官方1.14 / 章节' });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('phase="verify"');
    expect(message).toContain('k-1');
  });
});

describe('正文对比度体检（后端透传）', () => {
  it('把插件聚合结果带回', async () => {
    const rows = [
      {
        rootId: '1526:1',
        rootName: '界面说明1',
        checked: 12,
        lowContrast: 12,
        skipped: 3,
        skipReasons: ['instance-internal'],
        samples: [{ textId: 't1', textFill: '#EEEEEE', bgFill: '#FFFFFF', ratio: 1.1 }]
      }
    ];
    const backend = buildFigmaConsoleBackend(
      clientReturning({ _mcp: 'figma-console-mcp', success: true, result: rows })
    );

    const got = await backend.auditTextContrast({ rootIds: ['1526:1'], minRatio: 3 });
    expect(got).toHaveLength(1);
    expect(got[0].lowContrast).toBe(12);
    expect(got[0].samples?.[0].bgFill).toBe('#FFFFFF');
  });

  it('后端不返回结果时给空数组（不抛）', async () => {
    const backend = buildFigmaConsoleBackend(
      clientReturning({ _mcp: 'figma-console-mcp', success: true, result: null })
    );
    expect(await backend.auditTextContrast({ rootIds: ['x'] })).toEqual([]);
  });
});
