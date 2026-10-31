## Why

多部件渲染靠「克隆部件、继承样式」省掉整套样式配置，但克隆也把模板自身的不良样式一起带进产物，而且**没有任何渲染期归一化**：

- 正文 `正文/规则` 层继承模板的 `textAlignHorizontal = CENTER`，M1 一次性产出 **102 条居中正文**，逐条手工改
- 主图 `主图占位` 带 `dashPattern: [12,12]`，`applyAsset` 只换 fill、不清描边，置图后虚线框压在截图上，手工清 6 条

这两条都是「产物正确性」问题，但都落在 `warnings: []` 里——渲染认为自己是成功的。样式继承的初衷是「模板即样式源」，前提是模板样式本身是成品态；真机模板不是。

## What Changes

- 渲染写入正文条目时，显式归一化段落属性：`textAlignHorizontal = LEFT`（正文/规则）、`textAutoResize = HEIGHT`（允许换行增高），不再依赖克隆继承
- 配图占位文案（`配图占位文案`）保持居中——它是压在灰板上的说明文字，居中才是模板意图
- 置图（`applyAsset` / `fillImages` / 同步的 `fills` 批次）成功后，SHALL 清空目标矩形的 `strokes` 与 `dashPattern`，不只换 fill
- 归一化只针对「引擎写入内容的层」；模板里未被写入的装饰层不动
- 归一化冲突可见：若模板层显式带了非 LEFT 对齐且该层是正文载体，渲染 SHALL 记软告警 `W_TEXT_ALIGN_NORMALIZED`（一条聚合，不是 102 条）

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `template-render`: 新增「写入层的样式归一化」要求（正文对齐）与「置图清描边」要求
- `render-reconcile-parts`: 同步填图批次同样须清描边

## Impact

- `packages/figma-mcp-server/src/v2/render/parts/index.ts`：簇填充与 `applyAsset` 调用点
- `packages/figma-mcp-server/src/v2/render.ts`：legacy `fillCluster` / `fillImages` 同规则对齐
- `packages/figma-mcp-server/src/v2/reconcile/plan.ts`：同步 `fills` 批次同样清描边
- `packages/figma-mcp-server/src/v2/figma-client.ts`：`setTextAlign` / `setTextAutoResize` 已存在，可能需要 `clearStrokes` 一类能力（后端已有 `clearFills`，确认是否复用 `setNodePaint({stroke:null})`）
- 测试：`tests/v2/render-parts-*.spec.ts` 断言写入调用序列；真机回归用 M1
- 文档：`packages/skill/references/template-1-14.md` 补「归一化清单」
