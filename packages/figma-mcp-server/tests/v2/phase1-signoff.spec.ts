/**
 * S4 — Phase 1 完成声明：从「靠 agent 自觉」变成机器可校验的门禁。
 *
 * 规则只有四条（schema_version / unresolved_conflicts / pending_questions /
 * dimensions 四项全 true）。传了就按硬门禁处理，不传只软提醒：
 * 老调用方不该被一条新增门禁挡住，但 SOP 侧要求 Phase 2 入口先落盘再校验。
 */

import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkPhase1Signoff, emptyPhase1Signoff } from '../../src/v2/phase1-signoff.js';
import { renderV2MarkdownToFigma } from '../../src/v2/render.js';
import { buildNativeTools } from '../../src/server/createServer.js';
import { makeBackend } from './helpers/mock-backend.js';

const MD = `# 门禁

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

const validSignoff = {
  schema_version: 1,
  requirement: '门禁',
  unresolved_conflicts: [],
  pending_questions: [],
  dimensions: { params: true, diff_areas: true, business: true, conflicts: true }
};

describe('checkPhase1Signoff', () => {
  it('四个维度全 true 且两个清单为空 → ok', () => {
    const r = checkPhase1Signoff(validSignoff);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('空白模板本身是不合格的（提醒人真要填）', () => {
    expect(checkPhase1Signoff(emptyPhase1Signoff('x')).ok).toBe(false);
  });

  it('未决冲突非空 → V2_SIGNOFF_CONFLICTS_OPEN', () => {
    const r = checkPhase1Signoff({ ...validSignoff, unresolved_conflicts: ['用弹窗还是内嵌'] });
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.code)).toContain('V2_SIGNOFF_CONFLICTS_OPEN');
  });

  it('还有没问完的问题 → V2_SIGNOFF_PENDING_QUESTIONS', () => {
    const r = checkPhase1Signoff({ ...validSignoff, pending_questions: ['冷却时长'] });
    expect(r.errors.map((e) => e.code)).toContain('V2_SIGNOFF_PENDING_QUESTIONS');
  });

  it('某个维度没打勾 → V2_SIGNOFF_DIMENSIONS_INCOMPLETE 且点名是哪一项', () => {
    const r = checkPhase1Signoff({
      ...validSignoff,
      dimensions: { params: true, diff_areas: true, business: false, conflicts: true }
    });
    expect(r.errors.map((e) => e.code)).toContain('V2_SIGNOFF_DIMENSIONS_INCOMPLETE');
    expect(r.errors.map((e) => e.message).join(' ')).toContain('business');
  });

  it('schema_version 不对 → V2_SIGNOFF_INVALID', () => {
    const r = checkPhase1Signoff({ ...validSignoff, schema_version: 2 });
    expect(r.errors.map((e) => e.code)).toContain('V2_SIGNOFF_INVALID');
  });
});

describe('渲染前的门禁', () => {
  it('不传 phase1Signoff：渲染照常，但返回 V2_W_PHASE1_SIGNOFF_MISSING', async () => {
    const m = makeBackend();
    const r = await renderV2MarkdownToFigma({ markdown: MD }, m.backend);
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(r.warnings.some((w) => w.code === 'V2_W_PHASE1_SIGNOFF_MISSING')).toBe(true);
  });

  it('传了不合格的 phase1Signoff：拒绝渲染，一个节点都不写', async () => {
    const m = makeBackend();
    const before = Object.keys(m.store).length;

    const r = await renderV2MarkdownToFigma(
      {
        markdown: MD,
        phase1Signoff: { ...validSignoff, unresolved_conflicts: ['没定'] }
      },
      m.backend
    );

    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.code)).toContain('V2_SIGNOFF_CONFLICTS_OPEN');
    expect(Object.keys(m.store)).toHaveLength(before);
  });

  it('合格声明放行，且不再提醒', async () => {
    const m = makeBackend();
    const r = await renderV2MarkdownToFigma(
      { markdown: MD, phase1Signoff: validSignoff },
      m.backend
    );
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(r.warnings.some((w) => w.code === 'V2_W_PHASE1_SIGNOFF_MISSING')).toBe(false);
  });
});

describe('validate_phase1_signoff 工具', () => {
  let dir = '';

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'gisop-signoff-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const call = async (args: Record<string, unknown>) => {
    const def = buildNativeTools().find((d) => d.tool.name === 'validate_phase1_signoff');
    if (!def) throw new Error('tool missing');
    const r = await def.handler(args);
    const text = (r.content as Array<{ type: string; text?: string }>).find(
      (c) => c.type === 'text'
    )?.text;
    return JSON.parse(text ?? '{}');
  };

  it('直接校验内联对象', async () => {
    expect((await call({ signoff: validSignoff })).ok).toBe(true);
    expect((await call({ signoff: { ...validSignoff, unresolved_conflicts: [1] } })).ok).toBe(false);
  });

  it('从磁盘读声明文件', async () => {
    const path = join(dir, 'phase1-signoff.json');
    writeFileSync(path, JSON.stringify(validSignoff));
    const r = await call({ path });
    expect(r.ok).toBe(true);
    expect(r.source).toBe(path);
  });

  it('文件不存在时给出可操作的报错', async () => {
    const r = await call({ path: join(dir, 'nope.json') });
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.code).toBe('V2_SIGNOFF_FILE_MISSING');
  });
});
