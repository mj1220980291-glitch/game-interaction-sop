## Why

真机验收发现：蛋仔的章节部件编译后仍带着原模板全部 5 个簇，共 **7235 个节点**。渲染在这棵大树里扫描 / 删除时插件被压垮，报 `deleteNodes(39): Unable to establish connection to Figma after 10 seconds`，蛋仔样例渲染无法完成。

根因不是渲染代码，而是**部件没做成空壳**：编译只是把母版克隆过来，原稿内容原样留在里面。

## What Changes

- 编译新增「空壳化」步骤（在槽位命名归一化之后）：
  - `chapter`：说明栏容器内子节点全部删除；`气泡` 里除 `标号/母版` 外的标号删除
  - `cluster`：可见 `正文/规则` 与可见 `#Title` 各保留一个，其余删除；隐藏备用池原样保留
- 删除分批执行（每次 2 个），避免单次删除过大阻塞插件
- 编译报告新增 `slimmed`（删除节点数）

**本变更不做**：不改渲染逻辑、不改契约命名、不删样式载体（图区几何、说明栏容器、标号母版、隐藏池都保留）。

## Capabilities

### Modified Capabilities

- `template-compile`：新增「部件空壳化」要求。

## Impact

- `packages/figma-mcp-server/src/v2/compile/slim-parts.ts`（新增）
- `packages/figma-mcp-server/src/v2/compile/index.ts`：归一化之后接入空壳化，报告加 `slimmed`
- `蛋仔派对` 需重编 → 发布 → 冒烟 → 回填一次
