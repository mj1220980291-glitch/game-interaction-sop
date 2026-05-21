## Why

上一个 change（`v2-add-cluster-subgroup-headings`）为 v2 Markdown 引入了 `####` 子分类语法，parser 已能正确产出 `Cluster.groups[]`，但 render 层采用的是"扁平化备胎"——把所有 groups 的 bullets 拍平、在具名分组前插入 `▸ 小标题` 文本行，喂给现有的单块说明块渲染逻辑。

这意味着：**每个簇在 Figma 里仍然只有一个说明块**，`▸ 基础信息` 只是普通 bullet 文字，没有独立的视觉层级。读者扫读时分组意图不够明显，设计评审效率仍然低。

本 change 目标：**把备胎替换成真正的深度渲染**——每个 group 对应一个完整独立的说明块克隆（含气泡编号文本位、说明文本、角色标签）；有 title 的 group 在说明块顶部插入一个小标题 TEXT 节点；角色标签 FRAME 仅保留在第 1 个 group 的说明块中，其余 group 的角色标签 FRAME 整体删除（不重复展示）。

## What Changes

- `render.ts` 的 `fillCluster` 重构为按 `cluster.groups` 分组迭代：
  - **group = 1 且 title = null**（旧格式）：**完全等同 v2 旧版**，字节级一致，向后兼容
  - **group = 1 且 title 非 null**：克隆 1 个说明块，顶部插入小标题 TEXT
  - **group ≥ 2**：每个 group 克隆 1 个说明块，第 1 块复用源块，第 2..N 块通过 `cloneNodeSafe` 派生；各块顶部按需插入小标题 TEXT
- 小标题 TEXT 节点：复用模板内"子标号"节点的字号样式，`characters = group.title`，定位在说明文本之上 4px（FRAME-local）
- 角色标签 FRAME：只有第 1 个 group 的说明块保留并做 keep-first 删除；2..N 块的角色标签 FRAME 整体删除
- 配图占位（`optionalImagePlaceholder` GROUP）：`配图：xxx` bullet 只存在于某个 group 的 bullets 中；只有那个 group 的说明块检测到 `isImageBullet` 才保留占位，其余 group 的占位删除
- `flattenGroups` 备胎函数从 render.ts 中**移除**（不再需要）
- 新增 mcp-adapter 侧测试：用 spy 验证 2-group 簇调用 `cloneNode` 恰好 1 次（第 1 个 group 复用源块，第 2 个 group 才克隆）；0-group / 1-group+null 路径调用次数与旧版一致
- **BREAKING（内部）**：`flattenGroups` 函数消失，任何直接 import 它的测试需同步删除

## Capabilities

### New Capabilities
（无独立新 capability——本 change 是对已有 `figma-template-1-14-rendering` 能力的深化实现。）

### Modified Capabilities
- `figma-template-1-14-rendering`：`fillCluster` 新增"说明块按 group 数量克隆"与"小标题 TEXT 节点插入"两条渲染要求，替换上一个 change 留下的"扁平化备胎"占位说明。

## Impact

- **代码**
  - `packages/engine/src/v2/render.ts`：`fillCluster` 函数重构（约 +80 / -30 行），移除 `flattenGroups`，新增 `fillClusterGroup` 子函数
  - `packages/engine/src/v2/figma-client.ts`：新增 `cloneClusterBlock` helper，封装"克隆说明块 + 返回关键子节点 ID 集合"逻辑（对应 task 3.1）
  - `packages/mcp-adapter/tests/figma-console-backend.spec.ts`：新增 2 个 spy 断言
- **不影响**：parser、ir、mcp-adapter 业务逻辑；`####` 语法与 IR 结构在上一个 change 里已稳定
- **向后兼容**：1-group + null title 路径渲染产物与 v2 旧版字节级一致
