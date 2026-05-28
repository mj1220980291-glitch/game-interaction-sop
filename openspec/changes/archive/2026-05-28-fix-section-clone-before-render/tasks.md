## 1. 核心逻辑重构

- [ ] 1.1 在 `renderInner` 中把 section 循环拆为两阶段：阶段 1 批量克隆所有 section node（masterSectionGroup 仍为空白），阶段 2 依次渲染各 section
- [ ] 1.2 阶段 1 section 1 直接复用 `masterSectionGroup`，section 2-N 各调用 `cloneNodeSafe(masterSectionGroup, parentOfSections)` 并命名为 `界面说明${i+1}`
- [ ] 1.3 阶段 2 用 `sectionNodes[i]` 替代原来的 `sectionNode` 变量，确保两阶段共享同一数组

## 2. 测试

- [ ] 2.1 在 `tests/v2/render.spec.ts`（或新建 `multi-section.spec.ts`）新增测试：2 section 文档，验证 section 2 气泡 FRAME 的气泡数量等于 section 2 的簇数，不含 section 1 残留
- [ ] 2.2 新增测试：3 section 文档，各章节簇数不同（如 3/1/2），验证每个章节气泡 FRAME 内节点数量各自正确
- [ ] 2.3 新增测试：单 section 文档，验证行为与重构前完全一致（回归）
- [ ] 2.4 跑 `npx tsc -p packages/figma-mcp-server/tsconfig.json` 全量类型检查 pass

## 3. 验证与提交

- [ ] 3.1 跑 `npm test -w @game-interaction-sop/figma-mcp-server`，全量测试通过
- [ ] 3.2 端到端：用含 3 个 section 的文档渲染，确认 Figma 每个 section 气泡数量正确、无重复编号
