## 1. Interface 定义

- [x] 1.1 在 `packages/figma-mcp-server/src/v2/figma-client.ts` 新增 `ScanSubtreeResult` interface（`{ nodes: NodeInfo[]; truncated: boolean }`）
- [x] 1.2 在 `FigmaBackend` interface 新增 `scanSubtree(rootId: string, maxNodes?: number): Promise<ScanSubtreeResult>` 方法签名

## 2. Backend 实现

- [x] 2.1 在 `packages/figma-mcp-server/src/server/figmaConsoleBackend.ts` 实现 `scanSubtree`
- [x] 2.2 plugin script 内：`await figma.getNodeByIdAsync(rootId)` 取根节点，然后用同步 `n.children` 递归 walk，每个节点 push `await serNode(n)`，节点计数超 maxNodes 时 `break` 并置 `truncated=true`
- [x] 2.3 函数签名：`exec(client, script, 25000)`（budget 与原 scanByTypes 一致）
- [x] 2.4 返回值解析：结果结构为 `{ nodes: [...], truncated: boolean }` → 映射为 `ScanSubtreeResult`

## 3. render.ts 调用点替换

- [x] 3.1 改 `scanAllDescendants()` 调用方（`fillCluster` 开头）：换成 `backend.scanSubtree(clusterNode.id)`；truncated 时 fallback + warn
- [x] 3.2 改 `indexCloneByName()` 内部的 BFS：换成先 `scanSubtree` 取全树，再在结果数组上做 `find` 按名匹配；truncated 时 fallback
- [x] 3.3 改 `findSeedImageGroup()` 内部：换成 `scanSubtree(sectionRootId)` + `find`；truncated 时 fallback
- [x] 3.4 保留原 `scanAllDescendants` 函数体不删（fallback 路径使用）

## 4. 测试

- [x] 4.1 新建 mock backend 测试：`scanSubtree` 正常路径返回完整 nodes 且 `truncated=false`
- [x] 4.2 新建 mock backend 测试：超 maxNodes 时 `truncated=true`，nodes 长度 ≤ maxNodes
- [x] 4.3 新建 mock backend 测试：rootId 不存在时返回 `{ nodes: [], truncated: false }`
- [x] 4.4 `pnpm test` 全绿（含原有 parser/render 测试无回归）

## 5. 验证 + 提交

- [ ] 5.1 用 `选秀环节_交互文档.md` 做 e2e 冒烟，记录渲染总时间（对比 Change 1 后的基线）
- [ ] 5.2 确认 Figma 里节点文本正确（无空白块、无脏文本）
- [ ] 5.3 `git commit` + `git push`
