## Why

`figma-mcp-server` 包内的旧版 parser（`packages/figma-mcp-server/src/v2/parser.ts`）不识别 `####` 子标题行，会将其作为普通文本 bullet 吞入 `SemanticCluster.bullets[]`。结果导致两个问题：①渲染到 Figma 时 bullet 列表里出现字面量 `"#### 基础信息"` 等脏文本；②额外的假 bullet 使 while-loop clone 次数增加，配合其他 RTT 热点在含 `####` 文档上必然触发 30s 超时。

## What Changes

- `packages/figma-mcp-server/src/v2/parser.ts`：在 cluster body 行扫描逻辑里增加对 `####` 行的检测，遇到 `####` 开头的行直接 skip（不推入 `bullets` 数组）
- 添加 `STRIP_H4` 常量（默认 `true`），为后续 Change B（统一 parser）保留无痛切换路径——将来切换到 engine parser 时只需把此 flag 翻为 `preserve`，不用再改 parser 逻辑一次
- `packages/figma-mcp-server/tests/` 补充 fixture 和测试用例：含 `####` 的 Markdown 经过此 parser 后，bullets 数组不含 `####` 字面量

## Capabilities

### New Capabilities

- `mcp-server-parser-h4-compat`: figma-mcp-server 本地 parser 对 `####` 行的处理行为——strip 模式下跳过、不推入 bullets；含配置开关供未来迁移。

### Modified Capabilities

（无：engine 包的 parser 及 IR 不变；render.ts 不变；Figma 模板不变）

## Impact

- **代码**：仅 `packages/figma-mcp-server/src/v2/parser.ts`（约 5-10 行改动）+ 对应测试文件
- **行为**：含 `####` 的交互文档渲染后 bullet 文本干净（不再出现 `#### xxx` 字面量）；bullet clone 次数略降，配合后续 Change 2/3 共同解决超时问题
- **下游兼容**：不影响 engine 包、不影响 Markdown 格式规范、不影响已保存的 `.md` 文件
- **Breaking**：无
