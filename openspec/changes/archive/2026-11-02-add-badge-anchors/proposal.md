## Why

标号位置此前只由簇序号决定（模板网格），每章永远排成一条斜线，指不到具体控件；交付稿里设计师还得逐个手拖。2026-11-02 的实现（commit `023751e`）加了 `badgeAnchors` 入参，但同一提交漏了同步路径：md 没改时同步直接返回 `changes:[]`，锚点根本不生效，而 skill 文档已经承诺「只改标号位置走同步」。另外这条功能上线时没有走 OpenSpec，主 spec 与 CHANGELOG 都没有记录。

## What Changes

- 修正同步行为：传了 `badgeAnchors` 且 md 未改动时，同步 SHALL 仍按锚点重摆标号（不动文字与配图）
- 修正重摆语义：已有标号在给了锚点时就按锚点移动；没给锚点的簇保持原地（不覆盖设计师手拖的坐标）
- 同步只改部分锚点时不再逐簇刷「缺锚点」告警（传 `warnMissing=false`）
- 补齐记录：本 change 的 proposal / design / spec delta / tasks，主 spec 增补 `badgeAnchors` 与同步重摆两条要求，`CHANGELOG` 记 `v2.3.1`
- 文档：`phase4-figma.md` 明确「渲染前读 `.interaction-sop/anchors/<需求名>.json` 并并入 `badgeAnchors`」

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `engine-mcp-server`: `render_v2_markdown_to_figma` 新增可选入参 `badgeAnchors`（`"NN/C"` → 主图归一化坐标），含缺省/越界告警
- `render-reconcile-parts`: 多部件同步在 md 未改动、只改锚点时 SHALL 重摆标号；已有标号在给锚点时应移动，未给锚点的不动

## Impact

- 代码：`src/v2/reconcile/index.ts`（anchors-only 早返回与重摆循环）、`src/v2/render/parts/geometry.ts`（`placeBadges` 移动已有标号 + `warnMissing`）、`src/v2/badge-anchor.ts`（已有）
- 测试：`tests/v2/render-badge-anchor.spec.ts` 增同步重排用例
- 文档：`packages/skill/phases/phase4-figma.md`、`CHANGELOG.md`、版本号 `2.3.1`
- 兼容性：不传 `badgeAnchors` 时行为完全不变；老文档不受影响
