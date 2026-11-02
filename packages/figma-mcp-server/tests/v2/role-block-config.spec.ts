/**
 * 角色块配置的解析与失败语义。
 *
 * 反馈 #2 把四种不同原因都读成「模板未配置组件集」；这里锁定分流结果。
 *
 * Spec: template-render「职能标记组件在两条渲染路径一致生效」/
 *       engine-mcp-server「角色块失败的错误码区分」
 */

import { describe, it, expect } from 'vitest';
import {
  describeRoleBlock,
  loadRoleBlocks,
  missingRoles,
  type RoleBlockRuntime
} from '../../src/v2/role-block.js';
import { parseV2 } from '../../src/v2/parser.js';
import type { DocIR } from '../../src/v2/ir.js';
import type { FigmaBackend } from '../../src/v2/figma-client.js';

const noWarn = (): void => {};

const MD = `# 角色块

跟进UI：测试
需求组：测试
易协作链接：#待补充
最后更新时间：2026.11.02

## 设计总览

### 功能背景

背景。

### 核心交互

点击。

## 01. 战斗

### 命中判定
@程序 @动效

- @程序：命中后播特效

- @动效：受击闪白
`;

function roleIr(): DocIR {
  const parsed = parseV2(MD);
  if (!parsed.ir) throw new Error(parsed.errors.map((e) => e.message).join('; '));
  return parsed.ir;
}

describe('loadRoleBlocks', () => {
  it('variantKeys 命中 → mode keys，无需读后端', async () => {
    const backend = {} as FigmaBackend;
    const result = await loadRoleBlocks(
      backend,
      {
        variantKeys: { 程序: 'key-prog', GUI: 'key-gui', 音效: 'key-audio' },
        variantPrefix: '职能标记=',
        labelTextName: '文本'
      },
      noWarn
    );
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    expect(result.source).toBe('keys');
    expect(result.runtime.variantKeys?.get('程序')).toBe('key-prog');
    expect(result.runtime.variantKeys?.get('音频')).toBe('key-audio');
  });

  it('variantKeys 全是非法角色名 → no-valid-roles', async () => {
    const result = await loadRoleBlocks(
      {} as FigmaBackend,
      { variantKeys: { 谁: 'k' }, variantPrefix: '职能标记=', labelTextName: '文本' },
      noWarn
    );
    expect(result).toEqual({ ok: false, failure: { kind: 'no-valid-roles' } });
  });

  it('组件集读不到 → not-in-target-file（带原因）', async () => {
    const backend = {
      async getNodeInfo() {
        throw new Error('Node not found: 136:9379');
      }
    } as unknown as FigmaBackend;
    const result = await loadRoleBlocks(
      backend,
      { componentSetId: '136:9379', variantPrefix: '职能标记=', labelTextName: '文本' },
      noWarn
    );
    expect(result?.ok).toBe(false);
    if (result?.ok) return;
    expect(result.failure.kind).toBe('not-in-target-file');
    if (result.failure.kind !== 'not-in-target-file') return;
    expect(result.failure.componentSetId).toBe('136:9379');
    expect(result.failure.cause).toContain('Node not found');
  });

  it('组件集在但变体名前缀不匹配 → no-variants', async () => {
    const backend = {
      async getNodeInfo() {
        return { id: 'set', name: '职能标记', type: 'COMPONENT_SET', childIds: ['v1'] };
      },
      async getNodesInfo() {
        return [{ id: 'v1', name: 'MARKER=策划', type: 'COMPONENT' }];
      }
    } as unknown as FigmaBackend;
    const result = await loadRoleBlocks(
      backend,
      { componentSetId: 'set', variantPrefix: '职能标记=', labelTextName: '文本' },
      noWarn
    );
    expect(result?.ok).toBe(false);
    if (result?.ok) return;
    expect(result.failure.kind).toBe('no-variants');
  });

  it('未配置 roleBlock → undefined', async () => {
    expect(await loadRoleBlocks({} as FigmaBackend, undefined, noWarn)).toBeUndefined();
  });
});

describe('missingRoles / describeRoleBlock', () => {
  const runtime = (roles: string[]): RoleBlockRuntime => ({
    config: { variantPrefix: '职能标记=', labelTextName: '文本' },
    variants: new Map(roles.map((r) => [r, `id-${r}`])),
    warn: noWarn
  });

  it('只报 IR 实际用到且缺失的角色', () => {
    const ir = roleIr();
    expect(missingRoles(ir, runtime(['程序']))).toEqual(['动效']);
  });

  it('回显 mode / source / roles', () => {
    const info = describeRoleBlock(
      runtime(['美术', '程序']),
      'set',
      '/home/u/.game-interaction-sop/template.json'
    );
    expect(info.mode).toBe('set');
    expect(info.source).toContain('template.json');
    expect(info.roles).toEqual(['程序', '美术']);
    expect(info.variantPrefix).toBe('职能标记=');
    expect(info.labelTextName).toBe('文本');
  });
});
