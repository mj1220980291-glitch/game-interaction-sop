## ADDED Requirements

### Requirement: render 工具 assetMap 支持配图键与裁剪区域

`render_v2_markdown_to_figma` 的 `assetMap` 输入 schema SHALL 接受两类键：

- 章节键 `"NN"`：值为 `image` / `figma_node` / `skip`（含义不变）
- 配图键 `"NN/C/K"`：值为 `figma_node` / `skip`

`figma_node` 值 SHALL 支持可选字段 `crop: { x: number, y: number, width: number (>0), height: number (>0) }` 与 `scale: number (>0)`。工具描述 SHALL 写明配图键格式、K 的计数规则（簇内文档顺序、跨 `####` 连续）与 `crop` 坐标系（相对源节点左上角）。

源节点 SHALL 位于渲染目标文件内；工具描述 SHALL 注明这一约束。

#### Scenario: 配图键 schema 校验通过

- **WHEN** 客户端传入 `assetMap = { "01": { type: "skip" }, "01/2/1": { type: "figma_node", fileKey: "f", nodeId: "1:2", crop: { x: 10, y: 20, width: 300, height: 200 } } }`
- **THEN** 服务端 SHALL 接受该输入并把配图键原样传给渲染器

#### Scenario: crop 尺寸非法

- **WHEN** `crop.width` 为 0 或负数
- **THEN** 服务端 SHALL 以 schema 校验错误拒绝该调用
