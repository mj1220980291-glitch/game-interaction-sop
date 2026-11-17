## 1. 立表与基线（不改行为）

- [x] 1.1 新建 `packages/figma-mcp-server/src/v2/capability-contract.ts`：定义 `CapabilityRule`、`RULES`（8 项 × 全部取值），规则内容按现有 36 处分支逐条抄写
- [x] 1.2 导出 `ruleFor(caps, key)` 等只读访问器；消费点禁止直接读枚举再分支（本阶段仅新增，不改消费者）
- [x] 1.3 补 characterization 测试：完整性（每个取值有规则、无多余键、必要规则段非空）、解析等价（roleAnnotation / overview）、契约文案等价（8 项 × 全部取值）
- [x] 1.4 `npx tsc` + 全量串行测试全绿：88 文件 / 743 测试（基线 737 + 新增 6），本阶段未改任何行为

## 2. 解析闸门切表 + 修 none 漏判

- [x] 2.1 `parser.ts`：`ParseV2Opts` 保持布尔开关（消费方按表推导）；新增 `roleLineIgnored` 供 `none` 使用。分组/配图闸门仍在渲染侧，阶段 4 读表
- [x] 2.2 `render.ts:471-476` 改为 `parseOptsFor(packCaps ?? DEFAULT_CAPABILITIES)`，不再手写两个 `===` 开关
- [x] 2.3 修复 `roleAnnotation=none`：`@角色` 行可选；写了只给 `V2_W_ROLE_LINE_IGNORED` 软警告
- [x] 2.4 回归：none 不写 / 写了、component-variant 缺行、inline-suffix 句尾全部通过；全量串行 88 文件 / 744 测试

## 3. 契约文案切表

- [x] 3.1 `md-contract.ts` 的 8 段文案改为 `contract.*` 读取，删除手写三元分支；禁写清单也由表拼装（槽位实测冲突时回落兜底文案）
- [x] 3.2 断言：`capability-contract.spec` 遍历 8 项 × 全取值，要求生成契约包含表中声明文案；`compile-md-contract.spec` 9 条原用例全过（文本未变）
- [x] 3.3 `roleAnnotation=none` 契约（不写 @职能）与解析（可选）已一致；最小骨架的角色行改用 `render.roleBlocks === 'insert'` 判定

## 4. 渲染 / 编译 / 对账切表

- [x] 4.1 `render/parts/index.ts`：`assertCapabilityConflicts`、总览渲染、figure 丢弃告警、role 载体处理、badgeCount 读 `render.*`
- [x] 4.2 `render/parts/geometry.ts`：标号数量与摆放条件读表（`placeBadges` 的「是否摆放」与 `readBadges` 的自检口径）
- [x] 4.3 `compile/normalize-slots.ts`、`slim-parts.ts`、`compile/index.ts`：分组/配图/总览判定读表
- [x] 4.4 `reconcile/index.ts`：`inlineRoles` 由 `render.roleBlocks === 'suffix'` 推导
- [x] 4.5 纯几何计算（气泡网格、图片等比缩放）保持原样，不塞进表
- [x] 4.6 记录表缺字段的四处判定（本阶段保留原写法，零行为变化）：`numberBadge = none` 删簇编号（表只有 `contract` 段）、`readBadges` 的 `none` 早退（`manual` 仍照读画布，`badgeCount` 合并了两者）、`findFigure` 的 `named-group` 名字探测（`figureSlots` 只有 consume/drop）、`resetHiddenPool`（表值当时写成 `absent → keep`，与实现相反）。补字段前需先改 design / delta spec；其中 `resetHiddenPool` 已在 5.4 修表并切表，剩下三项待补字段
- [x] 4.7 `tsc` + 全量串行：88 文件 / 744 测试

## 5. 运行时自检

- [x] 5.1 新增 `checkCapabilityContract(pack)`：按表比对允许写法、契约文本与解析闸门（`capabilityContractMismatches` 逐项给出能力项/取值/期望/实际；`ObservedBehavior` 供注入实测口径）
- [x] 5.2 接入 pack 加载路径（`render.ts` 解析之后，失败路径也带出）与 `audit_template_pack`，不一致产出 `V2_W_CAPABILITY_CONTRACT_MISMATCH`（含能力项/取值/期望/实际），不中断
- [x] 5.3 用例：`capability-contract.spec` 三个（现网全取值零告警、注入解析漏分支、注入渲染漏分支）；`capability-selfcheck.spec` 两个（正常 pack 零告警且渲染成功、表上抹掉一段契约文案后只出警告且渲染继续）
- [x] 5.4 修掉阶段 4 留下的表值矛盾：`hiddenPool.absent` 改为 `delete`（与 spec `template-render`「不存在池子」及实现一致），`resetHiddenPool` 改读表（行为不变）

## 6. 表驱动一致性测试

- [x] 6.1 遍历「能力 × 取值 × 关注面」生成用例：`tests/v2/capability-matrix.spec.ts`（44 条）—— `parse`（契约可选 ⟺ 解析器接受缺省写法）、`render`（枚举名 ⟺ 渲染规则，且规则 ⟺ 契约文案/禁写清单/最小骨架）、`text`（文案非空且逐字出现在 `buildMdContract` 输出）
- [x] 6.2 覆盖清单输出：`REQUIRED_COVERAGE` 按「能力 → 取值 → 关注面」显式登记；清单与枚举双向比对（缺登记 / 已删除都失败），并断言每个关注面都有实现函数；新增取值漏登记时由 `coverageIssues` 报出
- [x] 6.3 机制自证：临时给 `CAPABILITY_VALUES.column` 加 `hanging` 而不补表 → `tsc` 报 `TS2741`（`capability-contract.ts` 缺 `hanging`），已实测后回退；补表即通过，矩阵按 `REQUIRED_COVERAGE` 自动纳入（未登记则覆盖测试失败）
- [x] 6.4 全量串行：90 文件 / 795 测试

## 7. 回归与文档

- [x] 7.1 `npx tsc -p tsconfig.json` + `npx vitest run --no-file-parallelism` 全绿：90 文件 / 795 测试（基线 88 / 744）
- [x] 7.2 `npm run sandbox:newuser` 与基线报告 diff 一致：`docs/pilot/reports/20261117-165621.{md,json}` vs 基线 `20261112-144031`，8 步全 pass、断言 27 条逐条相同
- [ ] 7.3 真机：旧稿清洗模板（`roleAnnotation=none`）不写 `@角色` 跑通渲染；官方 1.14 与蛋仔各跑一次同步零变更
  - 阻塞项：运行中的 worker 不会自动加载新 `dist`，需用户重启 MCP；另需确认两项真机的目标文件/page 与 md（旧稿清洗 pack 的三个发布 key 只在回执里留了前缀 `e2112768…` / `ad871654…` / `a5231020…`，仓库内无完整值）
- [ ] 7.4 CHANGELOG / HANDOFF / spec 同步；归档时把 delta 合入正式 specs（待 7.3 结论，归档动作不在本节自动做）
