## Why

M1/M2 渲染出的两篇文档都固定在 `(0,0)`，直接压在设计稿上，每次都要手工挪（M1 → y=3300，M2 → y=22261，且必须自己算下一个空位）。渲染工具没有任何位置参数。

另两条体验问题同属「调用面」：

- 报错 message 里塞整段 selection / 节点 dump，关键结论被淹没，得翻很久
- 连接抖动无重试：`figma_get_status` 显示已连接，`render` 报 `Cannot connect`，**第三次**才成功。同步侧早已有 `reconcileWithRetry`（`render.ts:412`），创建路径没有

## What Changes

- 渲染入参新增 `position: { x, y }`（默认 `(0,0)`，保持兼容）
- 新增 `autoPlace: 'below' | 'right'`：按目标页面现有子节点的包围盒把新文档放到空位；计算失败时回退 `(0,0)` 并记软告警 `W_AUTOPLACE_FALLBACK`
- 创建路径新增瞬时错误整轮重试（对齐 `reconcileWithRetry` 的策略：仅瞬时连接错误、整轮重跑、默认 1 次重试、5s 间隔）
- 错误对象结构化：`message` 收敛为一句结论（≤ 200 字符），明细移入 `details`（节点列表、原始异常栈摘要），工具返回按 `code` / `message` / `details` 三段输出
- `warnings` 中同类节点级信息聚合（`(n 处)` 后缀），不逐节点刷

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `template-render`: 新增「文档落点」与「创建路径瞬时重试」要求
- `engine-mcp-server`: 渲染工具的入参新增落点参数，错误返回结构改为三段式

## Impact

- `packages/figma-mcp-server/src/v2/render.ts`：`RenderInput` 加字段；`renderV2MarkdownToFigma` 外层加 retry 包装；`bindTargetFile` 之后的错误归一
- `packages/figma-mcp-server/src/v2/render/parts/index.ts:198-220`：`createFrame` 传 `x` / `y`；`autoPlace` 用页面子树包围盒计算
- `packages/figma-mcp-server/src/v2/figma-client.ts`：`createFrame` 入参加可选 `x` / `y`（若后端已支持则复用）
- `packages/figma-mcp-server/src/server/createServer.ts`：工具 schema 加 `position` / `autoPlace`；错误序列化改为三段式
- 测试：`tests/v2/render-parts-*.spec.ts` 落点断言；新增 retry 单测（沿用 `reconcileWithRetry` 的注入 `sleep` 手法）
- 文档：`packages/skill/phases/phase4-figma.md` 补落点参数用法；`引擎问题反馈.md` P1-8 / P2-9 / P2-10 标注对应 change
