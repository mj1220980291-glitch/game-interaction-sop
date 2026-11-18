## 0. 开工前确认（开发对话第一步，先讨论再动手）

- [ ] 0.1 design.md「待讨论」5 项逐条拍板（块缺失隐藏 vs 占位、表格行增删策略、同部件复用、编号策略、草案确认流程）
- [ ] 0.2 确认本轮不改样式/几何；声明 schema 只上「结构 + 槽位 + 四类块 + 组件形态」
- [ ] 0.3 记录基线：`npx tsc` + 全量串行测试数（当前 90 文件 / 800 测试）

## 1. 声明 schema 与默认生成器（不改行为）

- [ ] 1.1 新增 `src/v2/template/layout-schema.ts`：`BlockDecl` / `SlotDecl` / `LayoutDecl` 类型 + `validateLayout()`（part 枚举、id 唯一、每 block 至少一类内容、槽位 name/nodeId 二选一）
- [ ] 1.2 新增 `src/v2/template/default-layout.ts`：`generateLayout(capabilities)` 把 8 项能力翻译成等价声明（字段与现有 `TOP_SLOTS` / `CLUSTER_SLOTS` / `CHAPTER_SLOTS` 一一对应）
- [ ] 1.3 用例：schema 校验（合法/非法各若干）；`generateLayout` 对 4 套现有 pack 的输出快照（官方 1.14 / 蛋仔 / 燕云 / 旧稿清洗）
- [ ] 1.4 `tsc` + 全量串行全绿，本阶段零行为变化

## 2. md 三段新内容

- [ ] 2.1 `parser.ts`：`## 需求概述`（`### 小标题` + 正文段落）、`## 修订记录`（Markdown 表格，四列校验）、`## 审核情况`（键值行）；IR 新增 `overviewNotes` / `revisions` / `review`
- [ ] 2.2 硬错误码：修订记录缺列、表格格式非法；软警告：审核键无声明槽位
- [ ] 2.3 `md-contract.ts` 增补三段写法说明（由声明生成，见 6.1；本阶段先按现有风格写死，6.1 再切）
- [ ] 2.4 用例：三段齐全 / 只缺其一 / 缺列 / 未知键 / 表格空行
- [ ] 2.5 全量串行全绿

## 3. 渲染切到声明驱动

- [ ] 3.1 新增 `src/v2/render/blocks/`：`text.ts`（槽位写文字）、`list.ts`（行模板克隆 + 顺序写）、`table.ts`（列映射 + 行增删）、`repeat.ts`（sections / clusters）、`roles.ts`（声明变体实例化）、`badge.ts`（container / instance / none）
- [ ] 3.2 `render.ts` / `render/parts/index.ts`：入口改为遍历 `layout.blocks`；删除按 `template-slots` 常量查找的旧路径（先保留旧函数用于等价性对照，阶段 4 后删）
- [ ] 3.3 等价性测试 `tests/v2/layout-equivalence.spec.ts`：同一 pack「显式声明」与「生成器生成」渲染同一 md，产物逐节点对比（名字/文字/结构/位置）
- [ ] 3.4 块级诊断：`V2_W_TEMPLATE_LAYOUT_SLOT_MISSING` / `BLOCK_HIDDEN`，单一来源；旧 `W_HEADER_SLOT_MISSING` 改作兼容别名
- [ ] 3.5 全量串行全绿（本阶段允许测试数增加，不允许旧用例语义漂移）

## 4. 同步对账切到声明标识

- [ ] 4.1 新增 `src/v2/reconcile/layout-identity.ts`：`blockId/slotId + 行序` 标识；老 stamp 名字路径归一化；歧义时保留 + `V2_W_TEMPLATE_LAYOUT_IDENTITY_AMBIGUOUS`
- [ ] 4.2 `stamp-parts.ts` / `plan.ts` / `snapshot.ts` 改用新标识；删除旧路径映射
- [ ] 4.3 用例：新文档两次同步零变更；老文档（老 stamp）同步不误删；同名多节点歧义；表格行 3→5 只新增 2 行
- [ ] 4.4 回归燕云渲染稿（`201:4247` 这类多块文档）同步零变更，且不再出现 `02/1/-` 无主条目删除

## 5. 编译期生成声明草案与校验

- [ ] 5.1 `compile/index.ts`：在归一化 / 空壳化之后调用声明生成器，产出 `layout.blocks`（`draft: true`）并写回 `templateJson`
- [ ] 5.2 结构外块的识别：跟进人 / 修订记录 / 审核 / 需求概述 按 frame 名 + 内部文本名给出候选声明（含无法识别项的 gap）
- [ ] 5.3 校验：声明槽位在部件中不存在 → gap；`table` 缺 `template` 等必失败项 → `phase=verify` 硬失败
- [ ] 5.4 用例：带四块的源模板 → 草案含四块；槽位缺失 → gap；verify 失败路径
- [ ] 5.5 全量串行全绿

## 6. 契约文案与能力表降级

- [ ] 6.1 `md-contract.ts` 改为从声明生成（含新三段），删除对 `TOP_SLOTS` 等常量的直接引用
- [ ] 6.2 `capability-contract.ts` 保留为默认声明生成器的输入；渲染/同步/契约文案不再直接读能力枚举（用 grep 断言：消费点无 `caps.<key> ===`）
- [ ] 6.3 用例：契约文案逐字节回归（现有 `compile-md-contract.spec`）+ 新三段文案
- [ ] 6.4 能力契约自检（`checkCapabilityContract`）扩展到「声明 ↔ 实现」：声明生成的槽位与渲染读取的槽位一致

## 7. 回归与真机

- [ ] 7.1 `npx tsc -p tsconfig.json` + `npx vitest run --no-file-parallelism` 全绿，测试数不少于基线
- [ ] 7.2 `npm run sandbox:newuser` 与基线报告（`docs/pilot/reports/20261117-165621.md`）断言逐条一致
- [ ] 7.3 真机四套：官方 1.14 / 蛋仔 / 旧稿清洗（`roleAnnotation=none`）/ 燕云，各「渲染 + 两次同步零变更」
- [ ] 7.4 燕云专项：跟进人 / 修订记录 / 审核情况 / 需求概述 四块渲染出来；角色标签使用 `职位=…注意` 组件集；标号用序号实例；正文列宽与源稿一致
- [ ] 7.5 老兼容：官方 1.14 的 `schema_version: 1` pack 不迁移也能渲染 + 同步零变更

## 8. 文档与归档

- [ ] 8.1 CHANGELOG / HANDOFF 更新；`openspec/specs/template-render`、`render-reconcile`、`template-contract`、`markdown-v2-contract` 正式规范合入
- [ ] 8.2 新增 `openspec/specs/template-structure-declaration/spec.md`（归档时合入）
- [ ] 8.3 归档本 change
