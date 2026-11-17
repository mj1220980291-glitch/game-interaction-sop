/**
 * 能力契约 —— 模板能力的唯一事实来源。
 *
 * 背景（2026-11-16）：8 项能力原先在 10 个文件、约 36 处分支各自解释，
 * 于是出现「契约说不用写 @职能，解析器却强制」这类矛盾。这里把每个取值的
 * 「解析要求 / 契约文案 / 渲染行为」集中成一张表，消费者只读表。
 *
 * 约束：
 *   1. 表类型按枚举穷尽推导，枚举加值不补表 → tsc 报错；
 *   2. 消费点禁止再写 `caps.xxx === 'yyy'` 分支；
 *   3. 纯几何计算（网格坐标、等比缩放）不属于契约，留在原处。
 *
 * 迁移顺序见 openspec/changes/unify-capability-contract/tasks.md：
 * 阶段 1 只把现状等价抄进表，不改任何行为。
 */

import {
  CAPABILITY_VALUES,
  type Capabilities,
  type CapabilityKey,
  type TemplatePack
} from './template/schema.js';
import { SOFT_WARNING_CODES, type SoftWarning } from './ir.js';

export type { CapabilityKey };

type ValueOf<K extends CapabilityKey> = (typeof CAPABILITY_VALUES)[K][number];

/** markdown 解析闸门：required = 缺了报硬错；optional = 缺了不报。 */
export interface ParseRule {
  /** 是否要求 `## 设计总览`。 */
  overviewOptional: boolean;
  /** 是否要求簇首行 `@角色` 列表。 */
  roleLineOptional: boolean;
  /** 写了 `@角色` 也没有意义时（模板不表达职能）：只给一条软警告。 */
  roleLineIgnored: boolean;
}

/** 契约文案：由 `md-contract` 直接取用，不再手写三元分支。 */
export interface ContractRule {
  overview: string;
  groups: string;
  roles: string;
  figure: string;
  badge: string;
  number: string;
  column: string;
  /** 否写清单里额外的一条（没有则为 undefined）。 */
  forbid?: string;
}

/** 渲染行为：只描述「这一类取值怎么处理」，不描述几何算法。 */
export interface RenderRule {
  overviewSlots: 'two' | 'one' | 'none';
  /** insert = 插组件实例；suffix = 拼在句尾；strip = 删掉旧载体。 */
  roleBlocks: 'insert' | 'suffix' | 'strip';
  /** consume = 消费 `配图：` 条目；drop = 丢弃并告警。 */
  figureSlots: 'consume' | 'drop';
  /** clusters = 每簇一个标号；none = 不自动生成。 */
  badgeCount: 'clusters' | 'none';
  /** keep = 保留隐藏备用池；delete = 清掉。 */
  hiddenPool: 'keep' | 'delete';
  /** allow = 允许 `####`；inline = 允许但渲染成句首；reject = 拒绝。 */
  subgroup: 'allow' | 'inline' | 'reject';
}

export interface CapabilityRule {
  parse?: Partial<ParseRule>;
  contract?: Partial<ContractRule>;
  render?: Partial<RenderRule>;
}

type RuleTable = {
  [K in CapabilityKey]: Record<ValueOf<K>, CapabilityRule>;
};

/**
 * 现状基线（阶段 1）：逐条抄自各消费点，**包含已知 bug**。
 * `roleAnnotation.none` 的 `roleLineOptional: false` 是当前解析器的实际行为，
 * 与契约文案矛盾；阶段 2 修成 true 并补软警告。
 */
export const CAPABILITY_RULES: RuleTable = {
  overview: {
    'two-frames': {
      parse: { overviewOptional: false },
      contract: {
        overview: '`## 设计总览` 下写 `### 功能背景` 与 `### 核心交互` 两段，各一段正文。'
      },
      render: { overviewSlots: 'two' }
    },
    'single-block': {
      parse: { overviewOptional: false },
      contract: {
        overview: '`## 设计总览` 下只写一段（模板只有单块总览，第二段会被隐藏）。'
      },
      render: { overviewSlots: 'one' }
    },
    none: {
      parse: { overviewOptional: true },
      contract: {
        overview: '不写总览（模板没有总览区）。',
        forbid: '不要写 `## 设计总览`（模板没有总览区，写了会拒绝渲染）'
      },
      render: { overviewSlots: 'none' }
    }
  },

  clusterGroups: {
    'slot-run': {
      contract: { groups: '簇内可用 `#### 分组标题` 分组，每组下接 `- ` 条目。' },
      render: { subgroup: 'allow' }
    },
    'inline-subtitle': {
      contract: { groups: '簇内不用 `####`；把分组标题写在首条条目的句首（渲染成「标题：内容」）。' },
      render: { subgroup: 'inline' }
    },
    none: {
      contract: { groups: '簇内不分组：一个 `### 簇` 直接跟 `- ` 条目。', forbid: '不要使用 `####`（模板簇内不支持分级，写了会拒绝渲染）' },
      render: { subgroup: 'reject' }
    }
  },

  badgeSlot: {
    container: {
      contract: { badge: '每个簇在图上自动生成一个标号（1、2、3…），位置按模板网格；不要手写编号。' },
      render: { badgeCount: 'clusters' }
    },
    manual: {
      contract: { badge: '模板不在图上生成标号，需要人工摆放。' },
      render: { badgeCount: 'none' }
    },
    none: {
      contract: {
        badge: '模板不在图上生成标号，需要人工摆放。',
        forbid: '不要依赖图上标号（模板没有标号容器，标号不会生成）'
      },
      render: { badgeCount: 'none' }
    }
  },

  numberBadge: {
    text: { contract: { number: '簇编号由引擎按顺序写入，不要在标题里重复写编号。' } },
    instance: { contract: { number: '簇编号由引擎按顺序写入，不要在标题里重复写编号。' } },
    none: { contract: { number: '簇不显示编号。' } }
  },

  roleAnnotation: {
    'component-variant': {
      parse: { roleLineOptional: false },
      contract: { roles: '职能写成独立一行 `@GUI @程序`（渲染为「职能标记」组件）。' },
      render: { roleBlocks: 'insert' }
    },
    'inline-suffix': {
      parse: { roleLineOptional: true },
      contract: { roles: '职能写在条目句尾，例如 `- 点击入口打开面板 @GUI`。' },
      render: { roleBlocks: 'suffix' }
    },
    none: {
      // 契约说「不写 @职能」：角色行可选；写了只给软警告（之前这里错配成 required）。
      parse: { roleLineOptional: true, roleLineIgnored: true },
      contract: { roles: '不写 `@职能`（模板不表达职能）。' },
      render: { roleBlocks: 'strip' }
    }
  },

  figure: {
    'named-group': {
      contract: { figure: '在条目位置写 `- 配图：说明文字`，渲染时按顺序放入配图槽。' },
      render: { figureSlots: 'consume' }
    },
    'first-non-text': {
      contract: { figure: '在条目位置写 `- 配图：说明文字`，渲染时按顺序放入配图槽。' },
      render: { figureSlots: 'consume' }
    },
    none: {
      contract: { figure: '不写配图条目（模板没有配图槽）。', forbid: '不要写 `配图：`（模板没有配图槽，配图会被丢弃）' },
      render: { figureSlots: 'drop' }
    }
  },

  hiddenPool: {
    reuse: { render: { hiddenPool: 'keep' } },
    ignore: { render: { hiddenPool: 'delete' } },
    // absent = 模板没有池子：隐藏节点是残留，删掉（此前误写成 keep，与实现相反）。
    absent: { render: { hiddenPool: 'delete' } }
  },

  column: {
    right: { contract: { column: '说明栏在图右侧。' } },
    bottom: { contract: { column: '说明栏在图下方。' } }
  }
};

/** 取某个能力项、某个取值的规则；缺表时抛错（由完整性测试兜底）。 */
export function ruleFor<K extends CapabilityKey>(
  key: K,
  value: ValueOf<K> | string
): CapabilityRule {
  const group = CAPABILITY_RULES[key] as Record<string, CapabilityRule>;
  const rule = group[value];
  if (!rule) {
    throw new Error(`capability-contract: 缺少规则 ${key}=${value}`);
  }
  return rule;
}

/** 按整份能力表取某能力项的规则（渲染/编译侧更常用）。 */
export function ruleOf<K extends CapabilityKey>(caps: Capabilities, key: K): CapabilityRule {
  return ruleFor(key, caps[key]);
}

/** 解析期开关的统一来源；其它闸门（分组、配图）暂由渲染侧判定。 */
export function parseOptsFor(caps: Capabilities): {
  overviewOptional?: boolean;
  roleLineOptional?: boolean;
  roleLineIgnored?: boolean;
} {
  const opts: { overviewOptional?: boolean; roleLineOptional?: boolean; roleLineIgnored?: boolean } = {};
  if (ruleOf(caps, 'overview').parse?.overviewOptional) opts.overviewOptional = true;
  const role = ruleOf(caps, 'roleAnnotation').parse;
  if (role?.roleLineOptional) opts.roleLineOptional = true;
  if (role?.roleLineIgnored) opts.roleLineIgnored = true;
  return opts;
}

/** 覆盖清单：给表驱动测试与自检用。 */
export function capabilityCoverage(): Array<{ key: CapabilityKey; value: string }> {
  return (Object.keys(CAPABILITY_VALUES) as CapabilityKey[]).flatMap((key) =>
    (CAPABILITY_VALUES[key] as readonly string[]).map((value) => ({ key, value }))
  );
}

// --- 自检 ------------------------------------------------------------------

/** 一处「表声明」与「实现实际」的不一致。 */
export interface ContractMismatch {
  key: CapabilityKey;
  value: string;
  /** 表声明的行为。 */
  expected: string;
  /** 实现（或注入的实测值）实际行为。 */
  actual: string;
}

/**
 * 实测口径：缺省取表自身。
 *
 * 测试与排查时注入「实现实际怎么看」的值，用来复现「消费点漏了分支」——
 * 表说可选、解析器却强制，正是 2026-11-16 那次自相矛盾的形状。
 */
export interface ObservedBehavior {
  parseOpts?: ReturnType<typeof parseOptsFor>;
  render?: Partial<Record<CapabilityKey, Partial<RenderRule>>>;
}

/** 每个取值都必须说得出的那一段契约文案。 */
const REQUIRED_CONTRACT_TEXT: Array<[CapabilityKey, Exclude<keyof ContractRule, 'forbid'>]> = [
  ['overview', 'overview'],
  ['clusterGroups', 'groups'],
  ['roleAnnotation', 'roles'],
  ['figure', 'figure'],
  ['badgeSlot', 'badge'],
  ['numberBadge', 'number'],
  ['column', 'column']
];

/** 表 × 实现的逐项比对；返回不一致清单（空 = 自洽）。 */
export function capabilityContractMismatches(
  caps: Capabilities,
  observed: ObservedBehavior = {}
): ContractMismatch[] {
  const out: ContractMismatch[] = [];
  const opts = observed.parseOpts ?? parseOptsFor(caps);
  const renderOf = (key: CapabilityKey): Partial<RenderRule> => ({
    ...(ruleOf(caps, key).render ?? {}),
    ...(observed.render?.[key] ?? {})
  });

  // 总览：渲染期没有槽位 ⟺ 解析期不要求写总览。
  const overviewSlots = renderOf('overview').overviewSlots;
  const overviewOptional = opts.overviewOptional === true;
  const overviewExpectedOptional = overviewSlots === 'none';
  if (overviewOptional !== overviewExpectedOptional) {
    out.push({
      key: 'overview',
      value: caps.overview,
      expected: `总览${overviewExpectedOptional ? '可选' : '必写'}（render.overviewSlots = ${overviewSlots}）`,
      actual: `解析器按${overviewOptional ? '可选' : '必写'}处理（parse.overviewOptional = ${String(
        opts.overviewOptional ?? false
      )}）`
    });
  }

  // 职能：插组件实例 ⟺ 角色行必写；句尾/删除 ⟺ 可选；删除 ⟺ 写了只警告。
  const roleBlocks = renderOf('roleAnnotation').roleBlocks;
  const roleOptional = opts.roleLineOptional === true;
  const roleExpectedOptional = roleBlocks !== 'insert';
  if (roleOptional !== roleExpectedOptional) {
    out.push({
      key: 'roleAnnotation',
      value: caps.roleAnnotation,
      expected: `@角色 行${roleExpectedOptional ? '可选' : '必写'}（render.roleBlocks = ${roleBlocks}）`,
      actual: `解析器按${roleOptional ? '可选' : '必写'}处理（parse.roleLineOptional = ${String(
        opts.roleLineOptional ?? false
      )}）`
    });
  }
  const roleIgnored = opts.roleLineIgnored === true;
  const roleExpectedIgnored = roleBlocks === 'strip';
  if (roleIgnored !== roleExpectedIgnored) {
    out.push({
      key: 'roleAnnotation',
      value: caps.roleAnnotation,
      expected: roleExpectedIgnored ? '写了 @角色 只给软警告' : '写了 @角色 照常生效',
      actual: roleIgnored ? '解析器忽略 @角色' : '解析器按 @角色 处理'
    });
  }

  // 不该写的写法（丢弃 / 拒绝）⟺ 契约里必须有对应的禁写条目。
  const forbidExpectations: Array<[CapabilityKey, boolean]> = [
    ['overview', overviewSlots === 'none'],
    ['clusterGroups', renderOf('clusterGroups').subgroup === 'reject'],
    ['figure', renderOf('figure').figureSlots === 'drop']
  ];
  for (const [key, expectForbid] of forbidExpectations) {
    const hasForbid = Boolean(ruleOf(caps, key).contract?.forbid);
    if (hasForbid !== expectForbid) {
      out.push({
        key,
        value: String(caps[key]),
        expected: expectForbid ? '契约里有禁写条目' : '契约里没有禁写条目',
        actual: hasForbid ? '契约里有禁写条目' : '契约里没有禁写条目'
      });
    }
  }

  // 文案存在性：表里声明了行为，契约就必须说得出来。
  for (const [key, field] of REQUIRED_CONTRACT_TEXT) {
    const text = ruleOf(caps, key).contract?.[field];
    if (!text || text.trim() === '') {
      out.push({
        key,
        value: String(caps[key]),
        expected: '该取值有契约文案（contract 段非空）',
        actual: '契约文案为空'
      });
    }
  }

  return out;
}

/**
 * pack 加载/渲染入口的自检：把「表 ↔ 实现」不一致折成软告警。
 *
 * 只告警、不中断、不改模板——自检不能变成新的故障源。
 */
export function checkCapabilityContract(
  pack: TemplatePack | Capabilities,
  observed: ObservedBehavior = {}
): SoftWarning[] {
  const caps = 'capabilities' in pack ? pack.capabilities : pack;
  return capabilityContractMismatches(caps, observed).map((m) => ({
    code: SOFT_WARNING_CODES.W_CAPABILITY_CONTRACT_MISMATCH,
    message:
      `能力契约自检：${m.key}=${m.value} 期望「${m.expected}」，实际「${m.actual}」。` +
      '本次按实现继续渲染；按契约写的 md 可能被拒收或产物与契约不符，检查 capability-contract.ts 与对应消费点。'
  }));
}
