/**
 * 模板包解析可观测性。
 *
 * 真机踩过的三连误导（M1/M2，2026-10-30）：
 *   1. pack 没配上 → `V2_TARGET_FILE_UNREACHABLE`，把目标文件当模板文件查
 *   2. 传了 template{fileKey,nodeId} → 只影响 legacy 寻址，pack 查找纹丝不动，且无提示
 *   3. 不带 target → 换成另一句 `cloneNode: source not found`
 *
 * 现在 pack 查找带轨迹，返回值带 `pack` 摘要；缺包时给候选路径与原因。
 *
 * Spec: template-render「模板解析可观测」/「模板缺失的归因文案」
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderV2MarkdownToFigma } from '../../src/v2/render.js';
import { makeBackend } from './helpers/mock-backend.js';
import type { FigmaBackend } from '../../src/v2/figma-client.js';

const VALID_MD = `# 模板包

跟进UI：测试
需求组：测试
易协作链接：#待补充
最后更新时间：2026.10.31

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

const PACK = {
  schema_version: 1,
  project: '可观测',
  components: { top: 'k-top', chapter: 'k-chapter', cluster: 'k-cluster', footer: null },
  capabilities: { figure: 'none' }
};

let dir = '';
let packPath = '';

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'gisop-pack-obs-'));
  packPath = join(dir, 'template.json');
  writeFileSync(packPath, JSON.stringify(PACK));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const PREV_PACK = process.env.GISOP_TEMPLATE_PACK;
afterEach(() => {
  if (PREV_PACK === undefined) delete process.env.GISOP_TEMPLATE_PACK;
  else process.env.GISOP_TEMPLATE_PACK = PREV_PACK;
});

describe('返回值暴露模板包摘要', () => {
  it('命中时带 path / origin / components / capabilities', async () => {
    process.env.GISOP_TEMPLATE_PACK = packPath;
    const { backend } = makeBackend();

    // 故意用坏 md 让渲染在校验阶段停下：只看返回字段，不碰画布。
    const result = await renderV2MarkdownToFigma({ markdown: '# 只有标题' }, backend);

    expect(result.ok).toBe(false);
    expect(result.pack?.path).toBe(packPath);
    expect(result.pack?.origin).toBe('env');
    expect(result.pack?.project).toBe('可观测');
    expect(result.pack?.components.chapter).toBe('k-chapter');
    expect(result.pack?.capabilities.figure).toBe('none');
    expect(result.packMissing).toBeUndefined();
    expect(result.packCandidates).toBeUndefined();
  });

  it('命中且传了 template 时告警：该入参不参与决策', async () => {
    process.env.GISOP_TEMPLATE_PACK = packPath;
    const { backend } = makeBackend();

    const result = await renderV2MarkdownToFigma(
      { markdown: VALID_MD, template: { fileKey: 'IGNORED', nodeId: '9:9' } },
      backend
    );

    expect(result.pack?.origin).toBe('env');
    expect(result.warnings.some((w) => w.code === 'V2_W_TEMPLATE_ARG_IGNORED')).toBe(true);
  });
});

describe('缺包时的错误归因', () => {
  it('显式路径是坏 JSON → V2_TEMPLATE_PACK_MISSING，列出路径与原因', async () => {
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, '{ not json');
    process.env.GISOP_TEMPLATE_PACK = bad;

    const { backend, store } = makeBackend();
    const before = Object.keys(store).length;
    const result = await renderV2MarkdownToFigma({ markdown: VALID_MD }, backend);

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe('V2_TEMPLATE_PACK_MISSING');
    // message 只留一句结论，候选清单进 details（P2-9 报错瘦身）。
    const err0 = result.errors[0] as { message: string; details?: string };
    expect(err0.message.length).toBeLessThanOrEqual(200);
    expect(err0.details).toContain(bad);
    expect(err0.details).toContain('invalid');
    expect(result.packMissing).toBe(true);
    expect(result.packCandidates?.find((c) => c.origin === 'env')?.state).toBe('invalid');
    // 建立任何画布节点之前就失败。
    expect(Object.keys(store)).toHaveLength(before);
  });

  it('显式路径缺 key → incomplete 并说明缺哪个', async () => {
    const half = join(dir, 'half.json');
    writeFileSync(
      half,
      JSON.stringify({ schema_version: 1, components: { top: 'k-top', chapter: 'k-chapter' } })
    );
    process.env.GISOP_TEMPLATE_PACK = half;

    const { backend } = makeBackend();
    const result = await renderV2MarkdownToFigma({ markdown: VALID_MD }, backend);

    expect(result.errors[0]?.code).toBe('V2_TEMPLATE_PACK_MISSING');
    const err0 = result.errors[0] as { message: string; details?: string };
    expect(err0.details).toContain('cluster');
  });

  it('查找被 off 关闭时按 legacy 渲染，且不谎报缺包原因', async () => {
    process.env.GISOP_TEMPLATE_PACK = 'off';
    const { backend } = makeBackend();

    const result = await renderV2MarkdownToFigma({ markdown: VALID_MD }, backend);

    expect(result.ok, JSON.stringify(result.errors)).toBe(true);
    expect(result.pack).toBeUndefined();
    // off 是显式关闭，不是「4 个路径都没找到」。
    expect(result.packMissing).toBeUndefined();
  });

  it('不带 target 的 cloneNode 失败归一为 V2_TEMPLATE_PACK_MISSING', async () => {
    process.env.GISOP_TEMPLATE_PACK = 'off';
    const stub = {
      async commitUndoCheckpoint() {},
      async cloneNode() {
        throw new Error('figma_execute failed: cloneNode: source not found');
      }
    } as unknown as FigmaBackend;

    const result = await renderV2MarkdownToFigma({ markdown: VALID_MD }, stub);

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe('V2_TEMPLATE_PACK_MISSING');
    expect(result.errors[0]?.message).toContain('模板包');
    expect(result.errors[0]?.message).toContain('source not found');
  });
});
