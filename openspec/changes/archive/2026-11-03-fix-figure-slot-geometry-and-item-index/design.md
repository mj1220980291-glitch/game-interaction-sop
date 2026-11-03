## Context

真机反馈（2026-11-02，`kiroro主串联` `32LjMNqRsQOFEwbx3k3iQ3` / 页 `4216:41110`，pack `官方1.14`，`clusterGroups: slot-run`）两条缺陷。

**缺陷 A · 配图槽几何**
`appendBulletsInOrder`（`v2/render.ts:2024`）每遇到一条 `配图：` 就 `cloneNode` 克隆模板的配图 GROUP。克隆只保证子节点相对坐标不变，不保证 auto-layout 结算结果；绘制占位灰板的分支（`v2/render/parts/index.ts:744-776`）只做 `setNodePaint` + `centerHint`，**从不归一尺寸**。全仓唯一调尺寸的地方是 `fillFigurePlaceholder`（`server/figmaConsoleBackend.ts:1546-1555`，`layoutSizingHorizontal = FIXED` + `rect.resize` + 清描边），它只在**有资产**时执行。于是「有图正常 / 缺图塌」——实测第 2、3 张槽：`rect.y` 累加到 814/906/1511/1987，`rect.h` 27/52/37，`配图占位文案` 压成 1~6px 或整体缺失，`group.h` 只剩 27。

**缺陷 B · 条目序号错位**
parts 打标侧的条目清单 `clusterItems`（`render/parts/stamp-parts.ts:85-94`）只收 `正文/规则` + `配图`，**不含 `#Title` 子标题**；而计划侧的 `expectedItems`（`reconcile/layout.ts:69`）把 `####` 标题算成一条 `subtitle`，且 parts 只排除了 `role`（`reconcile/plan.ts:599`）。`ref.i` 按「含标题」的序号生成，`scratchPartsId`（`reconcile/index.ts:469-491`）却按「不含标题」的布局数组取值：布局 7 条 vs md 9 条，`i:7` 越界 → `scratch node not found`。dryRun 不解析 ref，所以通过。

两条同源：坏掉的配图槽（文案缺失）还会让 `collectClusterLayout` 的 `hintOf` 对账失配，把槽判成 `loose` 不计入条目，进一步放大错位。

## Goals / Non-Goals

**Goals:**

- 同一簇 N 张配图（N ≥ 1，含缺资产混合）渲染后，每个 `配图` 槽都满足：`rect.x = 0`、`rect.h > 0`、`hint.h ≥ 单行高`、`group.h = rect.h + gap + hint.h`，所有子节点 bbox 落在组框内。
- 缺资产与已填图两条分支共用同一套几何归一逻辑。
- 归一后仍不满足不变式 → 软告警 `V2_W_FIGURE_SLOT_GEOMETRY`（含簇路径、实测尺寸），不再静默。
- parts 同步的 `ref.i` 与打标条目清单同源；`####` 子标题不占条目序号。
- scratch 解析越界时报可读错误（`V2_RECONCILE_ITEM_OUT_OF_RANGE` + `s/c/i` + 两侧条数），而非裸 runtime error。

**Non-Goals:**

- 不做 `imageTransform` 矩阵裁剪（沙箱静默失效，见旧反馈），配图宽高比策略不变。
- 不支持「配图原位插入到它所说明的那条规则下面」与「一簇声明任意多的语义槽位」——当前模板仍是每簇一个可复制槽位模型，N 张按顺序追加。
- 不解决 parts 同步「md 新增一个 `####` 分组」的建组问题（现状不支持，另开 change）。
- 不改模板包与 Figma 组件结构（收件方无需重编模板）。

## Decisions

### D1 · 归一放进一次 exec 的后端方法，而不是多次 RPC 拼

新增后端方法 `normalizeFigureSlot({ groupId, rectId, hintId, sourceGroupId? })`，在**一次** exec 内完成：读源槽/当前槽的相对几何 → 写子节点坐标与尺寸 → resize 组。

理由：老坑（`HANDOFF` 坑 20）明确「换矩形 → 包 GROUP → 摆文案」分三次 RPC 会读到未结算坐标，文案必错位。既有 `fillFigurePlaceholder`、`groupFigure` 都是这个口径。

备选：在引擎侧用 `moveNode` / `resizeNode` 逐条调 —— 慢且不可靠（每次都要读模型结算后的坐标），弃。

### D2 · 几何真值来自「源槽」，不猜间距

归一参数 `gap` 与子节点布局从**克隆源槽**读：`gap = hint.y - (rect.y + rect.h)`（下限 0、上限 64，缺省 16）；`rect` 的目标宽高沿用源槽；`hint` 宽 = `rect.w`、`autoResize = HEIGHT`。

理由：模板才是标准答案，写死 gap 会在不同项目 pack 上错位（官方1.14 / 蛋仔几何不同）。

### D3 · auto-layout 存在时优先让布局引擎算，只在必要时降级为手动坐标

- 组是 `FRAME` 且 `layoutMode !== 'NONE'`：给两个子节点设 `layoutGrow = 0`、`layoutSizingHorizontal = 'FIXED'`，`hint` 宽设为 `rect.w`，纵向位置交给 auto-layout。
- 组是 `GROUP` 或 `layoutMode === 'NONE'`：显式写 `rect.x/y = 0`、`hint.y = rect.h + gap`，并 `group.resize(w, rect.h + gap + hint.h)`。

理由：强拆 auto-layout 会改变模板视觉；但纯 GROUP 无法自算，必须手写。

### D4 · 归一后读回校验，失败只告警不中断

同一次 exec 返回 `{ groupW, groupH, rectH, hintH, hintY }`，引擎侧比对不变式；不满足则 `W_FIGURE_SLOT_GEOMETRY`。渲染继续（缺图时占位文案可读性优先于几何完美）。

理由：几何异常不该让整篇渲染失败，但也绝不能再零告警。

### D5 · parts 侧条目序号排除 `subtitle`

`expectedItems` 新增 `includeSubtitles`（默认 `true`），parts 传 `false`：`expectedItems(cl, { includeRoles: false, includeSubtitles: false })`。

理由：parts 的 `#Title` 由分组结构生成、打标不记为条目、也不随条目移动；让序号同源是把两侧对齐的最小改动，而不是给打标补 subtitle（补了会与「模板结构层」的打标口径冲突，且同步不支持建组）。

备选：`scratchPartsId` 里按类型过滤错位 —— 治标，`changes` 文案里的 `#N` 仍会漂移，弃。

### D6 · 越界错误码分流

`scratchPartsId` 返回 `undefined` 时抛 `V2_RECONCILE_ITEM_OUT_OF_RANGE`，message 带 `s/c/i`、`wantCount`、`layoutCount`；`renderScratch` 的 parts 分支把该错误包进 `errors[]` 时保留 `details`。

理由：反馈第 4 条同类诉求（错误信息要带 nodeId）。可读错误码能直接把人指向「条目清单不一致」，而不是猜容量。

## Risks / Trade-offs

- [归一改变模板原有外貌（如组宽被收窄到 rect 宽）] → 只用源槽的宽高做真值；源槽宽 > rect 宽时保留组宽，rect 居中（与 `fillFigurePlaceholder` 现有居中逻辑一致）。
- [auto-layout 组里 `hint` 宽被强设为 `rect.w` 后换行变多、组变高] → 这是期望行为（文案可读优先）；截图审计能看出异常。
- [parts 排除 subtitle 后，`changes` 里的路径编号 `#N` 与旧文档记录不一致] → 仅是日志可读性；快照按 stamp 归属，不依赖该编号。
- [同步「md 新增 `####` 分组」仍不支持] → 明确列为 Non-Goal；本轮只保证既有分组内的条目增删不再崩。
- [归一不修根因（克隆继承 auto-layout 结算）] → 归一后读回校验 + 软告警作为兜底，真机验收覆盖 1/2/3 张与缺资产混合。

## Migration Plan

1. 引擎版本升 `0.3.2`；skill 无行为变更，不需要重装 skill。
2. 已渲染的旧文档：重跑一次渲染即被归一；只做同步不受影响（归一发生在 create/render 路径）。
3. 回滚：还原 `figmaConsoleBackend.ts` 新方法与两处调用点，`W_FIGURE_SLOT_GEOMETRY` 随之消失；无数据结构变更，无需迁移脚本。

## Open Questions

- 真机验收时若有簇在「模板槽位本身 auto-layout 且 HUG」下仍塌，是否需要退化为「强制拆 auto-layout 重建组」——待 M1/M2 重渲观察后再定。
