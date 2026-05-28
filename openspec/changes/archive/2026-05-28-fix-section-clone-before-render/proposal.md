## Why

`renderInner` 在渲染 section 1 之后才 clone masterSectionGroup 用于 section 2、3……，导致所有后续 section 的 clone 都携带 section 1 的填充内容（气泡节点 + 说明块）进入渲染流程，产生两类可见 bug：右栏说明块出现重复编号、主图气泡与前一 section 相同。

## What Changes

- 将 `renderInner` 中 section 的「克隆」与「渲染」拆成两个独立阶段：先批量克隆所有 section node（此时 masterSectionGroup 仍为空白模板），再依次渲染各 section
- section 1 仍复用 masterSectionGroup 本身；section 2-N 的 clone 源均为尚未填充的 masterSectionGroup
- 不改变任何外部 API、IR 结构或模板节点命名约定

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `figma-template-1-14-rendering`: 渲染正确性要求新增——多 section 文档中，第 2 个及以后 section 的气泡与说明块必须与前一 section 完全独立（无残留节点）

## Impact

- 代码：`packages/figma-mcp-server/src/v2/render.ts` 中 `renderInner` 函数，section 循环重构
- 测试：现有 render 单元测试需覆盖多 section 场景（≥2 sections），验证 bubble 数量与 cluster 数量一致
- 无 API、依赖、IR 变更
