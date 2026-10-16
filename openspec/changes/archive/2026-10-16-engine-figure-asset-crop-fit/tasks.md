## 1. Backend 能力

- [x] 1.1 `figma-client.ts`：新增可选方法 `fillFigurePlaceholder({ sourceNodeId, groupId, crop?, scale?, maxWidth }) → { width, height }`，并补接口注释（不用 `imageTransform` 的理由）——实现时增加 `rectId` / `hintId` 参数，由 render 传入（见 design D3）
- [x] 1.2 `figmaConsoleBackend.ts`：插件端实现 D3 七步，临时 FRAME 在 `finally` 中删除；错误信息含 `sourceNodeId` / `groupId`
- [x] 1.3 `figmaConsoleBackend.ts`：主图带 `crop` 时复用同一裁剪片段（`rasterizeNodeToImageFill` 增加可选 `crop`），不改主图占位尺寸
- [x] 1.4 单测：用假 MCP client + 模拟 `figma` 全局执行插件脚本，断言裁剪偏移、尺寸计算（1920×1080→1231×692；50×636 不放大）、文案删除、失败时临时节点被删除

## 2. 渲染器

- [x] 2.1 `render.ts`：`AssetSpec` 的 `figma_node` 增加 `crop?` / `scale?`；新增配图键解析（`NN/C/K`）
- [x] 2.2 渲染前比对 IR，未匹配键产生 `W_ASSET_KEY_UNMATCHED`
- [x] 2.3 `appendBulletsInOrder` 返回的 `images[]` 增加簇内序号 `ordinal`（跨 `####` 连续）
- [x] 2.4 说明块组装完成后，对有资产的配图调用 `fillFigurePlaceholder`（`maxWidth` 读说明块宽度）；有资产的配图不写占位文案；失败记 `W_FIGURE_FILL_FAILED` 并补写占位文案
- [x] 2.5 `summary` 增加 `figuresPlaced`；主图 `figma_node` 透传 `crop`
- [x] 2.6 mock backend 实现 `fillFigurePlaceholder`（记录调用、按规则改 RECTANGLE 尺寸、删文案）

## 3. 渲染测试

- [x] 3.1 新增 `tests/v2/render-figure-assets.spec.ts`：覆盖 spec 7 个场景（键匹配 / K 跨 #### / 比例尺寸 / 小图不放大 / 单张失败 / 未匹配键 / 无配图键时行为不变）
- [x] 3.2 现有测试全部通过（含调用序列基线）

## 4. MCP 工具与 skill

- [x] 4.1 `createServer.ts`：`assetMap` JSON schema 支持配图键与 `crop` / `scale`（`width`/`height` `exclusiveMinimum: 0`）；更新工具描述——服务端无运行时 schema 校验，另加 handler 侧 `crop`/`scale` 检查返回 `INVALID_INPUT`
- [x] 4.2 `tests/server.spec.ts`：schema 接受配图键、拒绝非法 `crop`
- [x] 4.3 `phase3-asset.md`：新增配图资产步骤（编键 → 定位 → 截图清单 → 用户确认 → 写 assetMap）与 `asset_map` 示例
- [x] 4.4 `phase4-figma.md`：调用示例加入配图键；说明 `W_FIGURE_FILL_FAILED` / `W_ASSET_KEY_UNMATCHED` 的处理话术

## 5. 校验

- [x] 5.1 `npm test` / `npm run build` 通过
- [x] 5.2 用户重启引擎 MCP 后真机验证：用 HUD 文档 + 设计稿节点为 2–3 张配图指定区域渲染，确认尺寸、无变形、文案删除、页面无临时节点残留、单张导出耗时
- [x] 5.3 `openspec validate engine-figure-asset-crop-fit` 通过
