/**
 * Bug A — `target.fileKey` 收进 schema、写进 SOP，却从来没被用过。
 *
 * 后果不是「参数不生效」这么轻。`TEMPLATE_NODE_ID` 是裸的 `'1:14'`，在别的文件
 * 里照样能解析到某个毫不相干的节点（生产文件里它是一个 TEXT 图层），于是引擎会
 * 安静地开始克隆它，把文档写进设计师正在编辑的文件。
 *
 * 修复见 render.ts 的 bindTargetFile：给了 fileKey 就把后端绑到那个文件并当场
 * 探一次 `1:14`；后端没有寻址能力时直接报错，绝不退回活动文件。
 */

import { describe, it, expect } from 'vitest';
import { renderV2MarkdownToFigma } from '../../src/v2/render.js';
import { makeBackend } from './helpers/mock-backend.js';
import type { FigmaBackend, NodeInfo } from '../../src/v2/figma-client.js';

const MD = `# 目标文件

跟进UI：测试
需求组：测试
易协作链接：#待补充
最后更新时间：2026.08.11

## 设计总览

### 功能背景

背景。

### 核心交互

核心交互。

## 01. 战斗界面

### 血条
@GUI

- a
`;

const TEMPLATE_FILE = 'UYCJok3MXTWITMfeJSqEF6';

describe('target.fileKey 决定写进哪个文件 (Bug A)', () => {
  it('不传 fileKey 时行为不变，且完全不碰 withFileKey', async () => {
    const { backend, store } = makeBackend();
    let withFileKeyCalls = 0;
    const spied: FigmaBackend = {
      ...backend,
      withFileKey(key) {
        withFileKeyCalls++;
        void key;
        return backend;
      }
    };

    const result = await renderV2MarkdownToFigma({ markdown: MD }, spied);

    expect(result.ok, JSON.stringify(result.errors)).toBe(true);
    expect(withFileKeyCalls).toBe(0);
    expect(store[result.rootInstanceId!]).toBeDefined();
  });

  it('传了 fileKey 时，产物落在目标文件而不是活动文件', async () => {
    // 两个 mock = 两个文件。active 代表设计师正开着的文件，target 是模板文件。
    const active = makeBackend();
    const target = makeBackend();

    const activeSizeBefore = Object.keys(active.store).length;

    const activeBackend: FigmaBackend = {
      ...active.backend,
      withFileKey(key) {
        expect(key).toBe(TEMPLATE_FILE);
        return target.backend;
      }
    };

    const result = await renderV2MarkdownToFigma(
      { markdown: MD, target: { fileKey: TEMPLATE_FILE } },
      activeBackend
    );

    expect(result.ok, JSON.stringify(result.errors)).toBe(true);
    expect(target.store[result.rootInstanceId!]).toBeDefined();
    // 活动文件一个节点都没多、没少。
    expect(Object.keys(active.store)).toHaveLength(activeSizeBefore);
  });

  it('后端无法按 fileKey 寻址时报错，而不是偷偷写进活动文件', async () => {
    const { backend, store } = makeBackend();
    const sizeBefore = Object.keys(store).length;

    const result = await renderV2MarkdownToFigma(
      { markdown: MD, target: { fileKey: TEMPLATE_FILE } },
      backend // mock 没有 withFileKey
    );

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe('V2_TARGET_FILE_UNSUPPORTED');
    expect(Object.keys(store)).toHaveLength(sizeBefore);
  });

  it('开写前探活失败就停手，不留下半张画布', async () => {
    const { backend, store } = makeBackend();
    const sizeBefore = Object.keys(store).length;
    const spied: FigmaBackend = {
      ...backend,
      async healthCheck() {
        throw new Error('Cannot connect to Figma Desktop');
      }
    };

    const result = await renderV2MarkdownToFigma({ markdown: MD }, spied);

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe('V2_BRIDGE_DOWN');
    expect(result.errors[0]?.message).toContain('Desktop Bridge');
    expect(Object.keys(store)).toHaveLength(sizeBefore);
  });

  it('后端没有 healthCheck 时照旧渲染（老后端不阻塞）', async () => {
    const { backend } = makeBackend();
    expect(backend.healthCheck).toBeUndefined();

    const result = await renderV2MarkdownToFigma({ markdown: MD }, backend);

    expect(result.ok, JSON.stringify(result.errors)).toBe(true);
  });

  it('目标文件里的 1:14 不是模板时拒绝写入', async () => {
    // 真实踩过的场景：生产文件【蛋仔城】综合设计 里 1:14 是一个 TEXT 图层。
    const strayText: NodeInfo = {
      id: '1:14',
      name: '张起、政政',
      type: 'TEXT',
      characters: '张起、政政'
    };
    let mutations = 0;
    const stub = {
      withFileKey() {
        return stub as unknown as FigmaBackend;
      },
      async getNodeInfo() {
        return strayText;
      },
      async cloneNode() {
        mutations++;
        return strayText;
      },
      async commitUndoCheckpoint() {
        mutations++;
      }
    } as unknown as FigmaBackend;

    const result = await renderV2MarkdownToFigma(
      { markdown: MD, target: { fileKey: 'some-production-file' } },
      stub
    );

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe('V2_TEMPLATE_NODE_MISMATCH');
    // 连 undo checkpoint 都不该打——绑定失败发生在任何画布动作之前。
    expect(mutations).toBe(0);
  });

  it('目标文件读不到 1:14 时给出插件未连接的提示', async () => {
    const stub = {
      withFileKey() {
        return stub as unknown as FigmaBackend;
      },
      async getNodeInfo() {
        throw new Error('figma_execute failed: file not connected');
      }
    } as unknown as FigmaBackend;

    const result = await renderV2MarkdownToFigma(
      { markdown: MD, target: { fileKey: TEMPLATE_FILE } },
      stub
    );

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe('V2_TARGET_FILE_UNREACHABLE');
    expect(result.errors[0]?.message).toContain('Desktop Bridge');
  });
});
