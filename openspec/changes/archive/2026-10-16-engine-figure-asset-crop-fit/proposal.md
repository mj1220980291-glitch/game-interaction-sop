## Why

`engine-inline-multi-figure` 之后，引擎能按 bullet 原位渲染多个 `配图` 占位，但占位里放不进图：

1. **配图没有资产入口**：`assetMap` 只按章节键（`"01"`）指定主图，簇内配图无法指定来源，AI 从设计稿截好的局部图只能由设计师手贴。
2. **配图框尺寸写死**：模板 `配图` GROUP 固定 1231×237（≈5.19:1），而设计师实际用的局部图宽高比从 0.08（竖条）到 2.27 不等，`FILL` 进固定框必然变形，`CROP` 则裁掉大半（`引擎开发反馈.md` §五）。
3. **区域裁剪没有可靠实现**：`imageTransform` 在插件沙箱内被静默忽略，只能"临时 Frame + clone + exportAsync"绕行，引擎未内置。
4. 贴图成功后 `配图占位：xxx，待补充` 文案仍残留（反馈 §六 #5）。

## What Changes

- **`assetMap` 新增配图键**：`"NN/C/K"` = 第 NN 章第 C 簇的第 K 张配图（C、K 从 1 起，K 按簇内全部 `配图：` bullet 的文档顺序计，跨 `####` 连续计数）。章节键 `"NN"` 含义不变。
- **`figma_node` 资产新增可选 `crop: { x, y, width, height }`**：相对源节点左上角的区域；缺省取整个节点。主图键同样可用。
- **新增 backend 能力 `fillFigurePlaceholder`**：单次 `figma_execute` 内完成「临时 Frame（clipsContent）+ clone 源节点并偏移 + `exportAsync` PNG + 移除临时节点 + 贴为 `FILL` 图片 + 按图片比例调整占位尺寸 + 删除占位文案」。不使用 `imageTransform`。
- **占位尺寸按图片比例**：宽 = min(裁剪宽, 说明栏宽 1231)，高按比例；不再固定 237。
- **结果与告警**：`summary` 新增 `figuresPlaced`；`assetMap` 中匹配不到任何配图/章节的键产生软告警 `W_ASSET_KEY_UNMATCHED`，不阻断渲染。
- **Phase 3 skill**：资产确认环节增加"配图资产"步骤——AI 在设计稿中为每条 `配图：` 定位源节点与区域、截图给用户确认，再写入 `assetMap`。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `figma-template-1-14-rendering`：新增「配图资产按键填充且占位尺寸按图片比例」；修改「配图占位双向判定」（资产来源从章节级改为配图键级，填充后删除占位文案）。
- `engine-mcp-server`：`render_v2_markdown_to_figma` 的 `assetMap` schema 扩展（配图键、`crop`）。
- `skill-sop-workflow`：Phase 3 新增配图资产定位与确认流程。

## Impact

- `packages/figma-mcp-server/src/v2/figma-client.ts` — 新增 `fillFigurePlaceholder` 接口
- `packages/figma-mcp-server/src/server/figmaConsoleBackend.ts` — 插件端实现
- `packages/figma-mcp-server/src/v2/render.ts` — 配图键解析、配图序号跟踪、填充调用、告警、summary
- `packages/figma-mcp-server/src/server/createServer.ts` — `assetMap` JSON schema 与工具描述
- `packages/figma-mcp-server/tests/` — mock backend 增加该方法；新增渲染测试
- `packages/skill/phases/phase3-asset.md`、`phase4-figma.md` — 配图资产流程与调用示例
- **不影响**：parser、IR、Markdown 契约（配图来源不写进 Markdown）
- **约束**：源节点必须位于渲染目标文件内（插件只能访问当前文件）；跨文件来源不在本次范围
