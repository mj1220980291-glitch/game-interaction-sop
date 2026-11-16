## 1. 立表与基线（不改行为）

- [x] 1.1 新建 `packages/figma-mcp-server/src/v2/capability-contract.ts`：定义 `CapabilityRule`、`RULES`（8 项 × 全部取值），规则内容按现有 36 处分支逐条抄写
- [x] 1.2 导出 `ruleFor(caps, key)` 等只读访问器；消费点禁止直接读枚举再分支（本阶段仅新增，不改消费者）
- [x] 1.3 补 characterization 测试：完整性（每个取值有规则、无多余键、必要规则段非空）、解析等价（roleAnnotation / overview）、契约文案等价（8 项 × 全部取值）
- [x] 1.4 `npx tsc` + 全量串行测试全绿：88 文件 / 743 测试（基线 737 + 新增 6），本阶段未改任何行为

## 2. 解析闸门切表 + 修 none 漏判

- [ ] 2.1 `parser.ts`：`overviewOptional / roleLineOptional` 改为从表推导（新增 `subgroup`/`figureBullet` 闸门同样读表）
- [ ] 2.2 `render.ts:471-476`：不再手写两个开关，统一由表生成 parse opts
- [ ] 2.3 修复 `roleAnnotation=none`：`@角色` 行可选；写了只给软警告（新增 `V2_W_ROLE_LINE_IGNORED`）
- [ ] 2.4 回归：none 不写 / 写了、component-variant 缺行、inline-suffix 句尾，四条路径各一条用例

## 3. 契约文案切表

- [ ] 3.1 `md-contract.ts` 的 8 段文案改为 `contract.*` 读取，删除手写三元分支
- [ ] 3.2 快照式断言：官方 1.14 / 蛋仔 / none 样例的契约文本关键句与表一致
- [ ] 3.3 确认 `roleAnnotation=none` 契约不再出现"不写 @职能"与解析器冲突

## 4. 渲染 / 编译 / 对账切表

- [ ] 4.1 `render/parts/index.ts`：`assertCapabilityConflicts`、总览渲染、figure 丢弃告警、role 载体处理、badgeCount 读 `render.*`
- [ ] 4.2 `render/parts/geometry.ts`：标号数量与摆放条件读表
- [ ] 4.3 `compile/normalize-slots.ts`、`slim-parts.ts`、`compile/index.ts`：分组/配图/总览判定读表
- [ ] 4.4 `reconcile/index.ts`：`inlineRoles` 由 `render.roleBlocks === 'suffix'` 推导
- [ ] 4.5 纯几何计算（气泡网格、图片等比缩放）保持原样，不塞进表

## 5. 运行时自检

- [ ] 5.1 新增 `checkCapabilityContract(pack)`：按表比对允许写法、契约文本与解析闸门
- [ ] 5.2 接入 pack 加载路径与 `audit_template_pack`，不一致产出 `V2_W_CAPABILITY_CONTRACT_MISMATCH`（含能力项/取值/期望/实际），不中断
- [ ] 5.3 用例：注入一条不一致（模拟漏分支），断言只出警告且渲染继续

## 6. 表驱动一致性测试

- [ ] 6.1 遍历「能力 × 取值 × 关注面」生成用例：契约 ⟺ 解析、契约 ⟺ 渲染、表 ⟺ 文本
- [ ] 6.2 覆盖清单输出（哪个取值被哪条断言覆盖），新增取值缺覆盖时测试失败
- [ ] 6.3 断言：临时新增一个假取值只改枚举 + 表即可通过类型检查与测试；只在枚举加值则 `tsc` 失败

## 7. 回归与文档

- [ ] 7.1 `npx tsc -p tsconfig.json` + `npx vitest run --no-file-parallelism` 全绿，测试数不少于基线
- [ ] 7.2 `npm run sandbox:newuser` 与基线报告 diff 一致
- [ ] 7.3 真机：旧稿清洗模板（`roleAnnotation=none`）不写 `@角色` 跑通渲染；官方 1.14 与蛋仔各跑一次同步零变更
- [ ] 7.4 CHANGELOG / HANDOFF / spec 同步；归档时把 delta 合入正式 specs
