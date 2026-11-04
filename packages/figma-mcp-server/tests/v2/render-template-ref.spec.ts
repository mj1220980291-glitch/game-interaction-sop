/**
 * E1 / E2 — 模板寻址的入参必须真实生效，报错必须指向真原因。
 *
 * 真机：显式传 `template: {fileKey:"UYCJ…", nodeId:"1:14"}`，引擎无视入参，
 * 回落成「在**目标文件**里找 1:14」，报 `V2_TARGET_FILE_UNREACHABLE`，文案还写
 * 「这里失败通常是模板包没配好，而不是目标文件有问题」。
 *
 * 现在的规则：
 *   - 显式 template.fileKey ≠ target.fileKey：先探模板文件。
 *     探不到 → V2_TEMPLATE_FILE_UNREACHABLE（直指 Desktop Bridge / 插件没连）；
 *     探得到 → V2_TEMPLATE_OTHER_FILE（Figma 不能跨文件克隆，给 componentKey 出路）。
 *   - 只给 template.fileKey、没给 target.fileKey：按模板文件定向并告警。
 *   - 库引用模式（componentKey）不报 packMissing，也不被机器上残留的坏 pack 挡住。
 */

import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderV2MarkdownToFigma } from '../../src/v2/render.js';
import { makeBackend } from './helpers/mock-backend.js';
import type { FigmaBackend } from '../../src/v2/figma-client.js';

const MD = `# 模板寻址

跟进UI：测试
需求组：测试
易协作链接：#待补充
最后更新时间：2026.11.03

## 设计总览

### 功能背景

背景。

### 核心交互

交互。

## 01. 战斗界面

### 血条
@GUI

- a
`;

const TEMPLATE_FILE = 'UYCJok3MXTWITMfeJSqEF6';
const TARGET_FILE = 'target-file-key';

describe('E1 显式 template.fileKey/nodeId', () => {
  it('模板文件没连 Bridge：报 V2_TEMPLATE_FILE_UNREACHABLE，不再回落「目标文件里找 1:14」', async () => {
    const target = makeBackend();
    const backend: FigmaBackend = {
      ...target.backend,
      withFileKey(key) {
        if (key === TEMPLATE_FILE) {
          return {
            ...target.backend,
            async getNodeInfo(id: string) {
              throw new Error(`figma_execute: no file connected for ${id}`);
            }
          } as FigmaBackend;
        }
        return target.backend;
      }
    };

    const r = await renderV2MarkdownToFigma(
      {
        markdown: MD,
        target: { fileKey: TARGET_FILE },
        template: { fileKey: TEMPLATE_FILE, nodeId: '1:14' }
      },
      backend
    );

    expect(r.ok).toBe(false);
    expect(r.errors[0]?.code).toBe('V2_TEMPLATE_FILE_UNREACHABLE');
    expect(r.errors[0]?.message).toContain('Desktop Bridge');
    expect(r.errors[0]?.message).toContain(TEMPLATE_FILE);
  });

  it('模板文件可访问但和 target 不是同一个文件：报 V2_TEMPLATE_OTHER_FILE 并指向 componentKey', async () => {
    const target = makeBackend();
    const backend: FigmaBackend = {
      ...target.backend,
      withFileKey(key) {
        if (key === TEMPLATE_FILE) {
          // 模板文件里节点可访问：返回一个容器，证明「连上了、只是跨文件」。
          return {
            ...target.backend,
            async getNodeInfo() {
              return { id: '1:14', name: '模板', type: 'FRAME', childIds: ['a'] };
            }
          } as FigmaBackend;
        }
        return target.backend;
      }
    };

    const r = await renderV2MarkdownToFigma(
      {
        markdown: MD,
        target: { fileKey: TARGET_FILE },
        template: { fileKey: TEMPLATE_FILE, nodeId: '1:14' }
      },
      backend
    );

    expect(r.ok).toBe(false);
    expect(r.errors[0]?.code).toBe('V2_TEMPLATE_OTHER_FILE');
    expect(r.errors[0]?.message).toContain('componentKey');
  });

  it('只给 template.fileKey 时按模板文件定向写入（旧行为是写进活动文件）', async () => {
    const m = makeBackend();
    let boundTo = '';
    const backend: FigmaBackend = {
      ...m.backend,
      withFileKey(key) {
        boundTo = key;
        return m.backend;
      }
    };

    const r = await renderV2MarkdownToFigma(
      { markdown: MD, template: { fileKey: 'own-template-file', nodeId: '1:14' } },
      backend
    );

    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(boundTo).toBe('own-template-file');
    expect(r.warnings.some((w) => w.code === 'V2_W_TARGET_FROM_TEMPLATE')).toBe(true);
  });
});

describe('E2 componentKey 可用时不报 packMissing', () => {
  let dir = '';
  let badPack = '';

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'gisop-e2-'));
    badPack = join(dir, 'template.json');
    writeFileSync(badPack, JSON.stringify({ schema_version: 2, components: {} }));
  });

  afterAll(() => {
    delete process.env.GISOP_TEMPLATE_PACK;
    rmSync(dir, { recursive: true, force: true });
  });

  it('机器上残留一份坏 pack 也不挡库引用模式，返回体不带 packMissing', async () => {
    process.env.GISOP_TEMPLATE_PACK = badPack;
    const m = makeBackend();

    const r = await renderV2MarkdownToFigma(
      { markdown: MD, template: { componentKey: 'library-key' } },
      m.backend
    );

    // 这个 mock 后端没有 instantiateByKey：失败点是「库引用不支持」，
    // 而不是「模板包配错」——后者正是 E2 抱怨的噪音。
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.code).toBe('V2_LIBRARY_UNSUPPORTED');
    expect('packMissing' in r).toBe(false);
    expect('packCandidates' in r).toBe(false);
  });
});
