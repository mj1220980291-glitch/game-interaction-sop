# Tasks

> 约定：每组任务结束跑 `npm run build` + `npm test`，全绿再进下一组。真机动作（重编 / 发布 / 冒烟）统一放最后一组，且只在「SOP 校验沙盒」里跑 import 冒烟。

## 1. 统一槽位命名（契约基础）

- [x] 1.1 新增 `src/v2/template-slots.ts`：4 部件槽位名常量 + 类型 + 兼容前缀（`Frame 4273*`）
- [x] 1.2 单测：命名表与 `template-map.ts` 中 `1:14` 既有名字一致（防止两套名字漂移）
- [x] 1.3 更新 `packages/skill/references/template-contract.md`：新增「统一槽位命名」一节（表 + 兼容读法 + 改名不改外观）
- [x] 1.4 跑 `npm run build` + `npm test`

## 2. 编译期槽位归一化（债务：命名）

- [x] 2.1 新增 `src/v2/compile/normalize-slots.ts`：复用 `probe/tree` + `probe/detect` 定位槽位 → 改名
- [x] 2.2 唯一候选规则 + 幂等（已是统一名不产生改名动作）
- [x] 2.3 关键槽位缺失 → `V2_COMPILE_SLOT_UNMAPPED`（错误信息含 `部件.槽位`）
- [x] 2.4 非关键槽位缺失 → `gaps` + 能力降级
- [x] 2.5 接入 `compile/index.ts`：位置在收编之后、产物能力重算之前
- [x] 2.6 单测：`798` 式命名（`Group 2360` / `Frame 1245`）归一成功；`1:14` 式命名零改动；重复编译幂等
- [x] 2.7 单测：改名不产生样式 / 坐标写入调用；源文件零写入
- [x] 2.8 跑 `npm run build` + `npm test`

## 3. 标号母版收口（债务：标号）

- [x] 3.1 `compile/badge-container.ts` 扩展：容器内收口出唯一隐藏 `标号/母版`（多余标号删除）
- [x] 3.2 散落标号场景：从给定 `1:14` 标号来源克隆母版
- [x] 3.3 母版缺 `#Number` 文本 → `gaps` 且能力不得谎报可摆位
- [x] 3.4 单测：8 标号收成 1 母版；母版隐藏；`#Number` 可写
- [x] 3.5 跑 `npm run build` + `npm test`

## 4. 渲染骨架（导入 → detach → 拼装）

- [x] 4.1 `FigmaBackend` 增加可选 `createFrame` / `resizeNode`；`figmaConsoleBackend` 实现
- [x] 4.2 新增 `src/v2/render/parts/compose.ts`：导入 → detach → 重新解析槽位 → 挂根帧 → 两遍布局
- [x] 4.3 `render.ts` 入口分派：包内三 key 齐全走 parts，否则 legacy；stderr 打印 `render mode`
- [x] 4.4 后端缺方法 → `V2_RENDER_LAYOUT_UNSUPPORTED`（零写入画布）
- [x] 4.5 单测：两遍布局（章节增高后无重叠）；隐藏母版克隆后强制可见；footer 缺省
- [x] 4.6 单测：无包走 legacy（断言零次 `importComponentByKey`）
- [x] 4.7 跑 `npm run build` + `npm test`

## 5. 清空原稿 + 章节 / 簇填充（债务：残留内容）

- [x] 5.1 新增 `render/parts/reset.ts`：按部件清空（表格见 design D3），批量删除
- [x] 5.2 章节填充：`#Name`、主图 / 图资产、簇 append 到 `Text`
- [x] 5.3 簇填充：编号、标题、内容行、职能、配图
- [x] 5.4 单测：带原稿部件渲染后无残留文本 / 填充 / 簇
- [x] 5.5 单测：章节 / 簇数量与 md 一致（含 0 簇、超多簇边界）
- [x] 5.6 跑 `npm run build` + `npm test`

## 6. 8 项能力落地（含两条函数级分叉）

- [x] 6.1 `clusterGroups`：`slot-run` / `inline-subtitle` / `none` 三条分支（`none` 在建画布前拒绝）
- [x] 6.2 `hiddenPool`：`allocateSlots(want, visible, hidden)` + `reuse` / `ignore` / `absent` 三策略
- [x] 6.3 `numberBadge`：`text` / `instance` / `none`
- [x] 6.4 `roleAnnotation`：`component-variant` / `inline-suffix` / `none`
- [x] 6.5 `overview`：`two-frames` / `single-block` / `none`
- [x] 6.6 `figure`：按 `配图` 槽位填充；`none` → `W_FIGURE_DROPPED`
- [x] 6.7 `column`：`right` / `bottom` 按测量坐标排布（无写死常量）
- [x] 6.8 单测：两条分叉的每条策略各一组用例（含隐藏槽不足 / 有盈余）
- [x] 6.9 跑 `npm run build` + `npm test`

## 7. 标号摆位

- [x] 7.1 `render/parts/badge.ts`：母版解析（`标号/母版` → 首个 `标号/*`）→ 克隆 → 编号 → 摆位 → 可见
- [x] 7.2 网格默认值 + `assetMap['NN/C/K']` 坐标覆盖
- [x] 7.3 无母版 → `V2_RENDER_BADGE_MASTER_MISSING`；`badgeSlot` 非 `container` → 缺口告警
- [x] 7.4 单测：3 簇 → 3 标号 / 编号正确 / 坐标等于网格前 3 点；资产覆盖生效
- [x] 7.5 跑 `npm run build` + `npm test`

## 8. md-contract 与冲突校验（债务：契约文本）

- [x] 8.1 新增 `compile/md-contract.ts`：能力 + 槽位 → 10 节正文（确定性）
- [x] 8.2 `verify` 报告返回 `mdContract: { path, content }`；`template.json` 写 `mdContract` 相对路径
- [x] 8.3 `figma_compile_template` 增 `phase: "contract"`（只读、不连 Figma）
- [x] 8.4 渲染前冲突校验：总览 / `####` / `@职能` 硬错误；配图 / 标号 / 编号软告警
- [x] 8.5 单测：同包两次生成逐字节一致；`clusterGroups=none` 的禁用清单含 `####`
- [x] 8.6 单测：三条硬错误各自零写入画布
- [x] 8.7 更新 `packages/skill/references/template-compile.md` 与 `phase4-figma.md`（契约产出与消费）
- [x] 8.8 跑 `npm run build` + `npm test`

## 9. 回归与等价性

- [x] 9.1 新增 `render-parts-equivalence.spec.ts`：同一 md + assetMap 跑 legacy 与 parts，比对名称 / 文本 / 层级 / 数量
- [x] 9.2 允许差异清单写入测试注释（逐条说明原因），无未列差异
- [x] 9.3 全量回归：`npm run build`（全 workspace）+ `npm test`（含 figma-mcp-server 全量）
- [x] 9.4 更新 `openspec/HANDOFF.md`（新路径、槽位命名、迁移状态）

## 10. 真机迁移（人工参与）

- [x] 10.1 沙盒验证 `官方1.14`：渲染样例 md，新旧路径逐节点比对
- [ ] 10.2 重编 `蛋仔派对`：`compile`（含标号来源）→ 人工发布 → `verify`（沙盒文件）
- [x] 10.3 回填 `~/.game-interaction-sop/templates/蛋仔派对.json`（新 key + capabilities）
- [ ] 10.4 用 `蛋仔派对` 包渲染样例 md，人工验收：无残留、标号在图区、分组按 `none` 报错
- [ ] 10.5 生成并落盘两份 `md-contract.md`，抽查禁写清单

