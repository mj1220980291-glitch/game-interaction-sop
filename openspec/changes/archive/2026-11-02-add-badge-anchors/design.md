## Context

`render_v2_markdown_to_figma` 的标号（①②③…）位置原本写死在模板网格里：`DEFAULT_BUBBLE_GRID` / `geometry.bubbleGrid` 按簇序号给坐标，与主图上真实控件无关。`023751e` 引入了 `badgeAnchors`（`"NN/C"` → 主图归一化 `{x,y}`），legacy 与 parts 两条渲染路径都接上了，但只覆盖「新建文档」：

- `reconcileV2` 在 `plan.hasWrites === false` 时直接 `return ok()`，md 没改 → 锚点被忽略
- 同步重摆只发生在 `hit.clusterChanged` 的章节，且 `placeBadges` 对 `known` 里的已有标号一律 `already ?? clone`，不动坐标

而 skill 文档（`phase3-asset.md` 第 5 步 / `phase4-figma.md` 参数说明）已经承诺「只改标号位置时走同步模式」。结果是最常见的用法——首轮渲染后觉得某几个标号位置偏了——走不通。

## Goals / Non-Goals

**Goals:**

- 只改锚点、md 一字不动时，同步真的会移动标号
- 给了锚点的簇，即使标号已存在也按锚点移动；没给锚点的簇保持原位（不覆盖设计师手拖）
- 部分锚点时同步不刷屏告警
- 补 OpenSpec 记录（change + 主 spec + CHANGELOG）

**Non-Goals:**

- 不改 `badgeAnchors` 的坐标语义（仍是主图归一化 0–1）
- 不改 legacy 渲染路径行为（全新文档本来就每次按锚点摆）
- 不做锚点的自动识别（从截图推控件位置）

## Decisions

### D1 · 同步触发条件加一条「有锚点」

```ts
const anchorsOnly = !!input.badgeAnchors && Object.keys(input.badgeAnchors).length > 0 && !plan.hasWrites;
if (input.dryRun || (!plan.hasWrites && !anchorsOnly)) return ok();
```

不改 `plan.hasWrites` 的定义（它描述 md 差异），只在入口多一条放行条件。这样 `changes` / `preserved` 的报告语义不变——用户看到 `changes:[]` 是正常的（md 确实没改）。

替代方案：把锚点差异塞进 `plan.changes`。否决：`changes` 的契约是 md 差异，混进画布差异会让审计与报告口径变乱。

### D2 · 重摆已有标号只在「该簇给了锚点」时发生

`placeBadges` 里：

```
let bubble = already;
if (bubble) {
  if (anchor) { move(badgePosition(..., anchor)) }
} else { clone → move(anchor or grid) }
```

没锚点的已有标号保持画布坐标——这是 `render-reconcile-parts` 里「设计师拖过标号，坐标不被覆盖」那条的延续。

### D3 · 锚点专用重摆循环 + 静默缺锚

同步主循环仍按 `changedSections` 处理簇集合变化；之后追加一段：遍历 `ir.sections`，跳过已处理章节，只对「至少有一个锚点」的章节调 `relayoutBadges(..., keepCount = clusterCount, warnMissing = false)`。

- `keepCount = clusterCount` → 所有标号都当「已存在」，只移动不克隆
- `warnMissing = false` → 用户只改 2 个标号时，不会为另外 8 个簇刷 8 条 `V2_W_BADGE_ANCHOR_MISSING`
- 全新渲染（`renderFromParts`）仍走 `warnMissing = true`，缺锚点照样提示

### D4 · 告警契约

`V2_W_BADGE_ANCHOR_MISSING` / `V2_W_BADGE_ANCHOR_OUT_OF_RANGE` 的触发面不变；同步的锚点专用循环不产生 MISSING。

## Risks / Trade-offs

- [同步里多了一次全章节遍历] → 只在 `input.badgeAnchors` 存在时执行，且 `relayoutBadges` 内部对 `badgeSlot !== 'container'` 直接返回，开销可忽略
- [用户以为「同步失败」：md 没改但画布变了，`changes` 仍为空] → 报告里 `changes:[]` 与「标号已按锚点重摆」并列说明，写进 phase4 文档
- [锚点错位导致标号压字] → 属 Phase 4 截图核对职责（`phase4-figma.md`「同一张截图顺带核对标号」），本次不动

## Migration Plan

不传 `badgeAnchors` 的老调用方零影响；老文档首次带锚点同步会重摆标号，属预期。
