## Why

模板 `1:14` 的 `气泡` FRAME 里有两个种子节点：`标号/2`（id 1:114，排第一）和 `标号/1`（id 1:118，排第二）。渲染代码用 `find(name.startsWith('标号/'))` 取**第一个**，拿到 `标号/2` 作为 clone 源，而 `标号/1` 从未被处理，成为永久孤儿 —— 它停留在模板默认位置，始终显示数字"1"，与渲染写入的 ① 重叠，导致每个 section 都多出一个 ① 孤儿气泡。

## What Changes

- 在 `renderSection` 开始处理 cluster 循环之前，将 bubbleFrame 里所有多余的种子节点删掉（仅保留第一个），确保 frame 里有且仅有 1 个种子可用于 reuse / clone

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `figma-template-1-14-rendering`：多余气泡种子必须在 cluster 循环前被删除

## Impact

- 代码：`packages/figma-mcp-server/src/v2/render.ts` 中 `renderSection` 函数，在 cluster 循环前加 trim 逻辑
- 测试：更新 `render-multi-section.spec.ts`，mock 里加入第二个种子 `标号/2`，验证孤儿被正确删除
