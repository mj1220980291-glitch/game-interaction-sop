## 1. 核心修复

- [x] 1.1 在 `render.ts` 的 `renderSection` 函数中，取到 `bubbleFrame` 之后、cluster 循环之前，加入 bubbleFrame seed trim 逻辑：`getNodeInfo(bubbleFrame.id)` → `deleteNodes(childIds.slice(1))`（如有多余）

## 2. 测试

- [x] 2.1 更新 `render-multi-section.spec.ts` 的 `makeBackend`：在 bubbleFrame 里加入第二个种子 `标号/1`（模拟真实模板结构 `[标号/2, 标号/1]`）
- [x] 2.2 新增测试：单 section，模板有 2 个种子，渲染后 bubbleFrame 气泡数量 = 该 section 簇数（不含孤儿）
- [x] 2.3 跑全量测试 `npx vitest run packages/figma-mcp-server`，141+ tests 全过（实测 142 passed）

## 3. 验证与提交

- [x] 3.1 `npx tsc -p packages/figma-mcp-server/tsconfig.json` 零错误
- [x] 3.2 端到端：用含多 section 的文档渲染，Figma 里每个 section 气泡数量正确，无孤儿 `标号/1`
