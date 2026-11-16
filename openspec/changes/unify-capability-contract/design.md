## 上下文

- 引擎里 `template/schema.ts` 定义 8 项能力枚举（`CAPABILITIES`）：`overview / clusterGroups / badgeSlot / numberBadge / roleAnnotation / figure / hiddenPool / column`。
- 这些取值目前被 10 个文件、约 36 处 `=== 'x'` 分支各自解释：解析闸门（`parser.ts` + `render.ts`）、契约文案（`md-contract.ts`）、渲染行为（`render/parts/index.ts`、`geometry.ts`）、编译与归一化（`normalize-slots.ts`、`slim-parts.ts`、`compile/index.ts`）、对账（`reconcile/index.ts`）。
- 已发生的两次漏判：`roleAnnotation=inline-suffix` 有豁免、`none` 没有；`overview=none` 有豁免、其他值没有统一来源。两次都表现为「按契约写的 md 被引擎拒收」。

## 决策

### D1｜单一事实来源：`capability-contract.ts`

对每个能力项、每个取值声明三类规则：

```
interface CapabilityRule {
  md: {
    roleLine?: 'required' | 'optional' | 'forbidden';
    overview?: 'required' | 'optional' | 'forbidden';
    subgroup?: 'allowed' | 'inline' | 'forbidden';
    figureBullet?: 'allowed' | 'forbidden';
    badgeNumber?: 'auto' | 'manual' | 'none';
  };
  contract: { role?: string; overview?: string; groups?: string; figure?: string; badge?: string; number?: string; column?: string };
  render: { overviewSlots?: 'two' | 'one' | 'none'; roleBlocks?: 'insert' | 'suffix' | 'strip'; figureSlots?: 'consume' | 'drop'; badgeCount?: 'clusters' | 'none'; hiddenPool?: 'keep' | 'delete' | 'absent' };
}
```

表本身：

```
const RULES: Record<CapabilityKey, Record<string, CapabilityRule>> = {
  roleAnnotation: { 'component-variant': …, 'inline-suffix': …, none: … },
  overview: { 'two-frames': …, 'single-block': …, none: … },
  …8 项
}
```

规则内容先按**现有行为逐条抄写**（阶段 1 以 characterization 测试锁住），再统一修复已知漏判。

### D2｜穷尽类型，加值必报错

- 表类型用 `Record<CapabilityKey, Record<CapabilityValue<K>, CapabilityRule>>`；`CapabilityValue<K>` 取自 `schema.ts` 的枚举字面量联合。
- 枚举加新取值而不补表 → `tsc` 失败；补表但漏某个消费点 → 该消费点读到 `undefined` 会在表驱动测试里暴露。
- 禁止在消费点写 `default:` 兜底分支来绕过穷尽检查。

### D3｜表驱动一致性测试（新值自动纳入）

遍历「能力项 × 取值 × 关注面」自动生成用例：

1. **契约 ⟺ 解析**：`md.roleLine === 'required'` 时，缺 `@角色` 必须报 `C2_ROLE_LINE_MISSING`；`optional/forbidden` 时不报（`forbidden` 且写了只给软警告）。
2. **契约 ⟺ 渲染**：`md.figureBullet === 'forbidden'` 时写 `配图：` 要产生丢弃告警而不是静默；`subgroup === 'forbidden'` 时必须拒绝渲染。
3. **表 ⟺ 契约文案**：`contract.*` 与实际生成的契约文本一致（快照或关键字断言）。
4. 新增取值只要补表，自动获得这四类断言，不需要人记着写用例。

### D4｜运行时自检：把错误前移到加载

在 pack 解析完成、渲染前（以及 `audit_template_pack`）执行 `checkCapabilityContract(pack)`：

- 用表推导该能力组合允许的 md 写法，与本次 md 实际使用比对；
- 与契约文本、解析器实际闸门比对；
- 不一致时产出一条软警告 `V2_W_CAPABILITY_CONTRACT_MISMATCH`，包含能力项、取值、期望与实际。
- 不崩、不自动改模板；这是诊断，不是修复。

### D5｜迁移顺序：先锁行为，再切消费点

1. 建表（等价抄写现状）+ characterization 测试；
2. 解析闸门切表，修 `roleAnnotation=none` 漏判；
3. 契约文案切表；
4. 渲染/编译/对账切表（保留纯几何计算分支）；
5. 加运行时自检；
6. 全量回归 + 文档。

每一步单独提交，测试不绿不进下一步。

### D6｜不在本次范围

- 不新增能力项或取值；
- 不改 `template.json` 形状、不改清洗流程、不动渲染视觉；
- 不把纯几何计算（例如气泡网格坐标、图片等比缩放）塞进规则表——那些是实现，不是契约。

## 迁移清单（按文件）

| 文件 | 现有分支 | 迁移后读取 |
|---|---|---|
| `v2/parser.ts` | `ParseV2Opts.overviewOptional / roleLineOptional` | `md.overview / md.roleLine` |
| `v2/render.ts:473-476` | 两个可选开关 | 同上，由表决定 |
| `v2/compile/md-contract.ts` | 8 项各一支文案 | `contract.*` 文本 |
| `v2/render/parts/index.ts` | `assertCapabilityConflicts`、总览渲染、figure 丢弃、role 载体、badgeCount | `render.*` |
| `v2/render/parts/geometry.ts` | `badgeSlot === 'none' / 'container'` | `render.badgeCount` |
| `v2/compile/normalize-slots.ts` | `clusterGroups`、`figure` | `md.subgroup` / `render.figureSlots` |
| `v2/compile/slim-parts.ts` | `overview === 'none'`、`figure === 'none'` | `render.overviewSlots / figureSlots` |
| `v2/compile/index.ts` | `clusterGroups === 'slot-run'` | `md.subgroup` |
| `v2/reconcile/index.ts` | `roleAnnotation === 'inline-suffix'` | `render.roleBlocks` |

## 风险

| 风险 | 缓解 |
|---|---|
| 抄写现状时把 bug 一起抄进去 | 先锁 characterization，再单独一步改 `none` 漏判，改动可区分 |
| 表变成"另一个散落点" | 表是唯一来源；消费点只读字段，不写判断；用穷尽类型与表驱动测试约束 |
| 运行时自检噪音 | 只报不一致，不报"模板没用到某能力"；单条去重 |
| 迁移面大 | 分 5 个提交，每步全量串行回归；任一步不绿立刻停 |

## 验证

- 表驱动测试覆盖 8 项能力全部取值；新增取值（测试内新增一个假取值）应导致类型错误与测试失败，而不是静默通过
- `roleAnnotation=none` 模板：不写 `@角色` 可渲染；写了不报错（软警告）
- `overview=none`、`figure=none`、`clusterGroups=none` 行为与现状一致
- 新用户沙盒与两套基线包回归：`sandbox:newuser` diff 一致
- `tsc` + 全量串行测试全绿；CHANGELOG/HANDOFF/spec 同步
