/**
 * 能力契约表：完整性 + 与解析器/契约文案的等价性。
 *
 * 阶段 1 只锁现状（不行为变化）；`roleAnnotation=none` 的已知矛盾在此显式记录，
 * 阶段 2 修表并翻转该断言。
 *
 * Spec: openspec/changes/unify-capability-contract/specs/capability-contract/spec.md
 */

import { describe, it, expect } from 'vitest';
import {
  CAPABILITY_RULES,
  capabilityContractMismatches,
  capabilityCoverage,
  checkCapabilityContract,
  parseOptsFor,
  ruleFor
} from '../../src/v2/capability-contract.js';
import { CAPABILITY_VALUES, DEFAULT_CAPABILITIES, parseTemplatePack, type Capabilities } from '../../src/v2/template/schema.js';
import { parseV2 } from '../../src/v2/parser.js';
import { buildMdContract } from '../../src/v2/compile/md-contract.js';
import { HARD_ERROR_CODES } from '../../src/v2/ir.js';

const MD_NO_ROLE = `# Demo

跟进UI：a
需求组：b
易协作链接：c
最后更新时间：2026.05.27

## 设计总览

### 功能背景

背景

### 核心交互

交互

## 01. 测试界面

### 入口规则

- 点击入口打开面板
`;

const MD_NO_OVERVIEW = `# Demo

跟进UI：a
需求组：b
易协作链接：c
最后更新时间：2026.05.27

## 01. 测试界面

### 入口规则
@GUI

- 点击入口打开面板
`;

function packWith(patch: Partial<Capabilities>) {
  const parsed = parseTemplatePack({
    schema_version: 1,
    project: 'capability-contract-test',
    components: { top: 'k-top', chapter: 'k-chapter', cluster: 'k-cluster', footer: 'k-footer' },
    capabilities: { ...DEFAULT_CAPABILITIES, ...patch }
  });
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return parsed.pack;
}

describe('capability-contract：完整性', () => {
  it('每个枚举取值都有规则，且表里没有多余键', () => {
    for (const { key, value } of capabilityCoverage()) {
      expect(() => ruleFor(key, value)).not.toThrow();
    }
    for (const key of Object.keys(CAPABILITY_VALUES) as Array<keyof typeof CAPABILITY_VALUES>) {
      const tableValues = Object.keys(CAPABILITY_RULES[key]).sort();
      const enumValues = [...CAPABILITY_VALUES[key]].sort();
      expect(tableValues).toEqual(enumValues);
    }
  });

  it('未知取值明确报错，不静默回落', () => {
    expect(() => ruleFor('roleAnnotation', 'not-a-value')).toThrow(/缺少规则/);
  });

  it('每项能力至少声明应有的规则段（防止空规则混过去）', () => {
    const need = {
      overview: ['parse', 'contract', 'render'],
      clusterGroups: ['contract', 'render'],
      badgeSlot: ['contract', 'render'],
      numberBadge: ['contract'],
      roleAnnotation: ['parse', 'contract', 'render'],
      figure: ['contract', 'render'],
      hiddenPool: ['render'],
      column: ['contract']
    } as const;
    for (const { key, value } of capabilityCoverage()) {
      const rule = ruleFor(key, value) as Record<string, unknown>;
      for (const section of need[key as keyof typeof need]) {
        const body = rule[section];
        expect(body, `${key}=${value} 缺少 ${section}`).toBeTruthy();
        expect(Object.keys(body as object).length, `${key}=${value} 的 ${section} 为空`).toBeGreaterThan(0);
      }
    }
  });
});

describe('capability-contract：解析闸门等价（现状基线）', () => {
  it('roleAnnotation 的角色行要求与解析器一致', () => {
    for (const value of CAPABILITY_VALUES.roleAnnotation) {
      const caps: Capabilities = { ...DEFAULT_CAPABILITIES, roleAnnotation: value };
      const rule = ruleFor('roleAnnotation', value);
      const r = parseV2(MD_NO_ROLE, parseOptsFor(caps));
      const requiresRoleLine = rule.parse.roleLineOptional !== true;
      if (requiresRoleLine) {
        expect(r.ok).toBe(false);
        expect(r.errors.map((e) => e.code)).toContain(HARD_ERROR_CODES.C2_ROLE_LINE_MISSING);
      } else {
        expect(r.ok).toBe(true);
      }
    }
  });

  it('roleAnnotation=none：不写角色行可解析；写了只给软警告', () => {
    const caps: Capabilities = { ...DEFAULT_CAPABILITIES, roleAnnotation: 'none', overview: 'none' };
    const noRole = parseV2(MD_NO_OVERVIEW, parseOptsFor(caps));
    expect(noRole.ok).toBe(true);

    const withRoleMd = MD_NO_OVERVIEW.replace('### 入口规则\n', '### 入口规则\n@GUI\n');
    const withRole = parseV2(withRoleMd, parseOptsFor(caps));
    expect(withRole.ok).toBe(true);
    expect(withRole.warnings.map((w) => w.code)).toContain('V2_W_ROLE_LINE_IGNORED');
  });

  it('overview 的总览要求与解析器一致', () => {
    for (const value of CAPABILITY_VALUES.overview) {
      const caps: Capabilities = { ...DEFAULT_CAPABILITIES, overview: value };
      const rule = ruleFor('overview', value);
      const r = parseV2(MD_NO_OVERVIEW, parseOptsFor(caps));
      const optional = rule.parse.overviewOptional === true;
      expect(r.ok).toBe(optional);
      if (!optional) {
        expect(r.errors.map((e) => e.code)).toContain(HARD_ERROR_CODES.O1_OVERVIEW_MISSING);
      }
    }
  });
});

describe('capability-contract：契约文案等价（现状基线）', () => {
  it('每个取值声明的文案都出现在生成的契约里', () => {
    const keys = Object.keys(CAPABILITY_VALUES) as Array<keyof typeof CAPABILITY_VALUES>;
    for (const key of keys) {
      for (const value of CAPABILITY_VALUES[key]) {
        const rule = ruleFor(key, value);
        const patch = { [key]: value } as Partial<Capabilities>;
        const { content } = buildMdContract(packWith(patch));
        for (const text of Object.values(rule.contract ?? {})) {
          if (!text) continue;
          expect(content, `${key}=${value} 缺少文案：${text}`).toContain(text);
        }
      }
    }
  });
});

describe('capability-contract：加载期自检', () => {
  it('表的现有取值自洽：8 项 × 全取值零告警', () => {
    for (const { key, value } of capabilityCoverage()) {
      const caps = { ...DEFAULT_CAPABILITIES, [key]: value } as Capabilities;
      expect(capabilityContractMismatches(caps), `${key}=${value}`).toEqual([]);
    }
    const warnings = checkCapabilityContract(packWith({}));
    expect(warnings).toEqual([]);
  });

  it('注入「解析器漏分支」：只出警告，带能力项/取值/期望/实际', () => {
    const pack = packWith({ roleAnnotation: 'none' });
    const observed = { parseOpts: { roleLineOptional: false, roleLineIgnored: true } };
    const warnings = checkCapabilityContract(pack, observed);

    expect(warnings).toHaveLength(1);
    const w = warnings[0]!;
    expect(w.code).toBe('V2_W_CAPABILITY_CONTRACT_MISMATCH');
    expect(w.message).toContain('roleAnnotation=none');
    expect(w.message).toContain('期望「@角色 行可选');
    expect(w.message).toContain('实际「解析器按必写处理');
  });

  it('注入「渲染没跟上表」：总览无槽位却仍要求写，告警不抛错', () => {
    const caps: Capabilities = { ...DEFAULT_CAPABILITIES, overview: 'two-frames' };
    const mismatches = capabilityContractMismatches(caps, {
      render: { overview: { overviewSlots: 'none' } }
    });
    expect(mismatches.length).toBeGreaterThan(0);
    expect(mismatches[0]!.key).toBe('overview');
    expect(mismatches[0]!.expected).toContain('总览可选');
    expect(mismatches[0]!.actual).toContain('必写');
  });
});

