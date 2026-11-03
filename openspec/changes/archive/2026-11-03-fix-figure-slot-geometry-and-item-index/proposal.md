## Why

真机反馈（2026-11-02，`kiroro主串联`）暴露两个静默缺陷：① create 模式下同一簇第 2 张起配图槽被压坏并越框（灰板贴顶、占位文案压成 1~6px、rect y 累加溢出组框），`warnings` 全空、`figuresPlaced` 仍报成功；② 带 `####` 的簇同步时报 `V2_RECONCILE_RUNTIME_ERROR: scratch node not found for {"s":0,"c":0,"i":7,"part":"item"}`，dryRun 通过、真跑崩。

两者同源：配图槽克隆后引擎从不归一几何，缺资产分支与填图分支不对称；而几何/文案坏掉的槽又会让条目清单少算，叠加 parts 侧「条目索引含 `####` 标题、打标清单不含」的错位，最终越界。

## What Changes

- 配图槽克隆后统一几何归一：矩形回到组内原点、文案贴在矩形下方、组高 = 槽高 + 间距 + 文案高，并解除克隆继承的 auto-layout 拉伸；缺资产与已填图两条分支走同一套归一。
- 归一后仍不满足几何不变式时发软告警 `V2_W_FIGURE_SLOT_GEOMETRY`（带簇路径与实测尺寸），不再静默。
- parts 同步的条目清单与打标清单对齐：`####` 子标题不再计入条目序号（它由分组结构承载，不随条目移动）。
- scratch 解析失败时改报可读错误（含 `s/c/i` 与簇路径、条数上限），不再抛 `scratch node not found` 裸 runtime error。
- 补回归用例：单簇 1/2/3 张配图（含缺资产混合）的几何断言；单簇 8+ 条目的 parts 同步不报错。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `template-render`: 新增「配图槽几何归一」要求——克隆出的配图槽在渲染结束时必须满足「子节点落在组框内 + 组高随内容」的不变式，违反时软告警。
- `render-reconcile-parts`: 条目序号（`ref.i`）与打标条目清单必须同源，`####` 子标题不占条目序号；scratch 解析失败返回可读错误码。

## Impact

- `packages/figma-mcp-server/src/v2/render.ts`（`appendBulletsInOrder` / `finishBlockFigures`）
- `packages/figma-mcp-server/src/v2/render/parts/index.ts`（占位灰板 / 文案归一）
- `packages/figma-mcp-server/src/server/figmaConsoleBackend.ts`（新增一次性归一方法）
- `packages/figma-mcp-server/src/v2/reconcile/plan.ts`、`layout.ts`、`index.ts`（条目序号与错误码）
- 测试：`tests/v2/render-figure-slot.spec.ts`、`tests/v2/render-figure-assets.spec.ts`、`tests/v2/parts-reconcile-units.spec.ts`
- 引擎行为变化：已安装方需重跑 `npm run install-mcp`（或重启 MCP）才生效
