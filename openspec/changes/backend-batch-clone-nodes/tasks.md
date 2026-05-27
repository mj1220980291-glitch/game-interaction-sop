## 1. Interface 定义

- [ ] 1.1 在 `packages/figma-mcp-server/src/v2/figma-client.ts` 新增 `batchCloneNodes(p: { sourceId: string; parentId: string; count: number }): Promise<NodeInfo[]>` 方法签名

## 2. Backend 实现

- [ ] 2.1 在 `packages/figma-mcp-server/src/server/figmaConsoleBackend.ts` 实现 `batchCloneNodes`
- [ ] 2.2 `count <= 0` 时直接返回 `[]`，不发 figma_execute
- [ ] 2.3 plugin script：`src.clone()` × N 次循环 + `parent.appendChild(clone)` + `result.push(await serNode(clone))`
- [ ] 2.4 script 内加 parent 类型检查：parent 为 GROUP 时 throw Error（沿用 cloneNodeSafe 的 GROUP 保护语义）
- [ ] 2.5 exec budget 设为 `20000`（N ≤ 15 时每次 clone ~100ms → 远低于 budget）

## 3. render.ts 调用点替换

- [ ] 3.1 替换 `fillCluster` 里的 bullet clone while-loop：计算 `needed = cluster.bullets.length - bulletTexts.length`，如 `needed > 0` 则一次 `batchCloneNodes`，结果 push 进 `bulletNodes`
- [ ] 3.2 替换 `renderSection` 里的 cluster block clone while-loop：计算 `needed = section.clusters.length - clusterNodes.length`，如 `needed > 0` 则一次 `batchCloneNodes`，结果追加到 `clusterNodes`
- [ ] 3.3 原 while-loop 代码保留为注释（便于 code review 对比），待 Change 完成后删除

## 4. 测试

- [ ] 4.1 新建 mock backend 测试：`batchCloneNodes(count=3)` 返回长度为 3 的数组
- [ ] 4.2 新建 mock backend 测试：`batchCloneNodes(count=0)` 返回空数组且 figma_execute 调用次数 = 0
- [ ] 4.3 新建集成测试：render 一个含 8 条 bullet 的 cluster（模板初始 1 个 bullet 节点），验证输出 NodeInfo 数组长度 = 8 且顺序正确
- [ ] 4.4 `pnpm test` 全绿（含 Change 1、Change 2 的测试无回归）

## 5. 验证 + 提交

- [ ] 5.1 用 `选秀环节_交互文档.md` 做 e2e 冒烟，记录渲染总时间（对比 Change 2 后基线）
- [ ] 5.2 核查 Figma 里每个 cluster 的 bullet 文本顺序与 Markdown 顺序一致
- [ ] 5.3 核查含 `####` 的 3 个 cluster（候选卡区、公共卡池、玩家浮岛）bullet 文本干净（Change 1 已修）
- [ ] 5.4 `git commit` + `git push`
