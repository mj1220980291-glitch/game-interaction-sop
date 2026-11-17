/**
 * 能力矩阵：能力 × 取值 × 关注面 的遍历式一致性测试。
 *
 * 关注面三面：
 *   - `parse`  ：契约说可选 ⟺ 解析器接受缺省写法（只对有解析闸门的能力项）
 *   - `render` ：枚举取值 ⟺ 渲染规则，且规则与生成的契约文案 / 最小骨架一致
 *   - `text`   ：契约文案非空，且逐字出现在 `buildMdContract` 的输出里
 *
 * 新增能力取值必须在本文件 `REQUIRED_COVERAGE` 登记关注面，否则覆盖测试失败；
 * 只在枚举加值而不补表则 `tsc` 失败（阶段 1 的穷尽 `RuleTable` 类型）。
 *
 * Spec: openspec/changes/unify-capability-contract/specs/capability-contract/spec.md
 */

import { describe, it, expect } from 'vitest';
import {
  capabilityCoverage,
  parseOptsFor,
  ruleFor
} from '../../src/v2/capability-contract.js';
import {
  CAPABILITY_VALUES,
  DEFAULT_CAPABILITIES,
  parseTemplatePack,
  type Capabilities,
  type CapabilityKey
} from '../../src/v2/template/schema.js';
import { parseV2 } from '../../src/v2/parser.js';
import { buildMdContract } from '../../src/v2/compile/md-contract.js';

type Face = 'parse' | 'render' | 'text';

/**
 * 覆盖清单：每个能力项、每个取值必须被哪些关注面断言。
 * 这是唯一需要人工维护的清单——漏登记就是漏测试。
 */
const REQUIRED_COVERAGE: Record<CapabilityKey, Record<string, Face[]>> = {
  overview: {
    'two-frames': ['parse', 'render', 'text'],
    'single-block': ['parse', 'render', 'text'],
    none: ['parse', 'render', 'text']
  },
  clusterGroups: {
    'slot-run': ['render', 'text'],
    'inline-subtitle': ['render', 'text'],
    none: ['render', 'text']
  },
  badgeSlot: {
    container: ['render', 'text'],
    manual: ['render', 'text'],
    none: ['render', 'text']
  },
  numberBadge: {
    text: ['text'],
    instance: ['text'],
    none: ['text']
  },
  roleAnnotation: {
    'component-variant': ['parse', 'render', 'text'],
    'inline-suffix': ['parse', 'render', 'text'],
    none: ['parse', 'render', 'text']
  },
  figure: {
    'named-group': ['render', 'text'],
    'first-non-text': ['render', 'text'],
    none: ['render', 'text']
  },
  hiddenPool: {
    reuse: ['render'],
    ignore: ['render'],
    absent: ['render']
  },
  column: {
    right: ['text'],
    bottom: ['text']
  }
};

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

/** 枚举名与渲染规则的语义对应（写死在测试里，表被改错时会红）。 */
const EXPECTED_RENDER: Record<string, Record<string, string>> = {
  overview: { 'two-frames': 'two', 'single-block': 'one', none: 'none' },
  clusterGroups: { 'slot-run': 'allow', 'inline-subtitle': 'inline', none: 'reject' },
  badgeSlot: { container: 'clusters', manual: 'none', none: 'none' },
  roleAnnotation: { 'component-variant': 'insert', 'inline-suffix': 'suffix', none: 'strip' },
  figure: { 'named-group': 'consume', 'first-non-text': 'consume', none: 'drop' },
  hiddenPool: { reuse: 'keep', ignore: 'delete', absent: 'delete' }
};

function capsFor(key: CapabilityKey, value: string): Capabilities {
  return { ...DEFAULT_CAPABILITIES, [key]: value } as Capabilities;
}

function contractOf(caps: Capabilities): string {
  const parsed = parseTemplatePack({
    schema_version: 1,
    project: 'capability-matrix',
    components: { top: 'k-top', chapter: 'k-chapter', cluster: 'k-cluster', footer: null },
    capabilities: caps
  });
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return buildMdContract(parsed.pack).content;
}

function verifyParse(key: CapabilityKey, value: string): void {
  const caps = capsFor(key, value);
  const rule = ruleFor(key, value);
  if (key === 'overview') {
    const r = parseV2(MD_NO_OVERVIEW, parseOptsFor(caps));
    expect(r.ok, `overview=${value} 的解析松紧与表不符`).toBe(rule.parse?.overviewOptional === true);
    return;
  }
  if (key === 'roleAnnotation') {
    const r = parseV2(MD_NO_ROLE, parseOptsFor(caps));
    expect(r.ok, `roleAnnotation=${value} 的角色行要求与表不符`).toBe(
      rule.parse?.roleLineOptional === true
    );
    if (rule.parse?.roleLineIgnored) {
      const withRole = parseV2(MD_NO_ROLE.replace('### 入口规则\n', '### 入口规则\n@GUI\n'), parseOptsFor(caps));
      expect(withRole.ok).toBe(true);
      expect(withRole.warnings.map((w) => w.code)).toContain('V2_W_ROLE_LINE_IGNORED');
    }
    return;
  }
  throw new Error(`parse 关注面不适用于 ${key}`);
}

function verifyRender(key: CapabilityKey, value: string): void {
  const rule = ruleFor(key, value);
  const expected = EXPECTED_RENDER[key]?.[value];
  expect(expected, `EXPECTED_RENDER 缺少 ${key}=${value}`).toBeDefined();

  const actual =
    key === 'overview'
      ? rule.render?.overviewSlots
      : key === 'clusterGroups'
        ? rule.render?.subgroup
        : key === 'badgeSlot'
          ? rule.render?.badgeCount
          : key === 'roleAnnotation'
            ? rule.render?.roleBlocks
            : key === 'figure'
              ? rule.render?.figureSlots
              : rule.render?.hiddenPool;
  expect(actual, `${key}=${value} 的渲染规则与语义不符`).toBe(expected);

  // 隐藏池没有书写面，其余能力的渲染规则必须能在生成的契约里找到对应说法。
  if (key === 'hiddenPool') return;
  const md = contractOf(capsFor(key, value));
  switch (key) {
    case 'overview':
      if (value === 'none') expect(md).toContain('不要写 `## 设计总览`');
      if (value === 'two-frames') {
        expect(md).toContain('### 功能背景');
        expect(md).toContain('### 核心交互');
      }
      if (value === 'single-block') expect(md).toContain('只写一段');
      expect(md.includes('不要写 `## 设计总览`')).toBe(value === 'none');
      break;
    case 'clusterGroups':
      expect(md.includes('不要使用 `####`')).toBe(value === 'none');
      if (value === 'slot-run') expect(md).toContain('`#### 分组标题`');
      if (value === 'inline-subtitle') expect(md).toContain('句首');
      break;
    case 'badgeSlot':
      expect(md.includes('自动生成一个标号')).toBe(value === 'container');
      if (value !== 'container') expect(md).toContain('不在图上生成标号');
      break;
    case 'roleAnnotation':
      expect(md.includes('\n@GUI\n')).toBe(value === 'component-variant');
      if (value === 'inline-suffix') expect(md).toContain('句尾');
      if (value === 'none') expect(md).toContain('不写 `@职能`');
      break;
    case 'figure': {
      const writesFigure = value !== 'none';
      expect(md.includes('- 配图：<说明>')).toBe(writesFigure);
      expect(md.includes('不要写 `配图：`')).toBe(!writesFigure);
      break;
    }
    default:
      throw new Error(`render 关注面不适用于 ${key}`);
  }
}

function verifyText(key: CapabilityKey, value: string): void {
  const texts = Object.values(ruleFor(key, value).contract ?? {}).filter(
    (t): t is string => typeof t === 'string' && t !== ''
  );
  expect(texts.length, `${key}=${value} 没有契约文案`).toBeGreaterThan(0);
  const md = contractOf(capsFor(key, value));
  for (const text of texts) expect(md, `${key}=${value} 的文案未出现在契约里：${text}`).toContain(text);
}

/** 枚举里有、覆盖清单没登记（或反之）的条目；新增取值漏登记时由它报出来。 */
function coverageIssues(
  values: Record<string, readonly string[]>,
  declared: Record<string, Record<string, Face[]>>
): string[] {
  const issues: string[] = [];
  for (const [key, list] of Object.entries(values)) {
    for (const value of list) {
      if (!declared[key]?.[value]?.length) issues.push(`${key}=${value}`);
    }
  }
  return issues;
}

const CASES = (Object.keys(REQUIRED_COVERAGE) as CapabilityKey[]).flatMap((key) =>
  Object.entries(REQUIRED_COVERAGE[key]).flatMap(([value, faces]) =>
    faces.map((face) => ({ key, value, face }))
  )
);

const VERIFY: Record<Face, (key: CapabilityKey, value: string) => void> = {
  parse: verifyParse,
  render: verifyRender,
  text: verifyText
};

describe('能力矩阵：能力 × 取值 × 关注面', () => {
  it.each(CASES)('$key=$value [$face]', ({ key, value, face }) => {
    VERIFY[face](key, value);
  });
});

describe('能力矩阵：覆盖清单', () => {
  it('覆盖清单与枚举一一对应：新增取值必须登记关注面', () => {
    expect(coverageIssues(CAPABILITY_VALUES, REQUIRED_COVERAGE)).toEqual([]);

    const declared = new Set(CASES.map((c) => `${c.key}=${c.value}`));
    const actual = capabilityCoverage().map((c) => `${c.key}=${c.value}`);
    expect(actual.filter((k) => !declared.has(k)), '枚举里有、清单没登记的取值').toEqual([]);
    expect([...declared].filter((k) => !actual.includes(k)), '清单里有、枚举已删的取值').toEqual([]);

    for (const c of CASES) {
      expect(VERIFY[c.face], `${c.key}=${c.value} 的 ${c.face} 面没有实现`).toBeTypeOf('function');
    }
  });

  it('机制自证：枚举多一个没登记的值 → 报缺覆盖', () => {
    expect(
      coverageIssues({ ...CAPABILITY_VALUES, column: ['right', 'bottom', 'hanging'] }, REQUIRED_COVERAGE)
    ).toEqual(['column=hanging']);
  });
});
