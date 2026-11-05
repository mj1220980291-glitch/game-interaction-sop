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
import { buildFigmaConsoleBackend } from '../../src/server/figmaConsoleBackend.js';

function clientReturning(payload: unknown): Client {
  return {
    async callTool() {
      return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
    }
  } as unknown as Client;
}

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
