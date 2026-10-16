## Context

模板 `配图` 结构（2026-10-16 实测，节点 `615:5144`）：

```
配图 GROUP            1231×237  layoutSizingH=FILL  layoutSizingV=FIXED   ← 说明块 VERTICAL auto-layout 的子节点
  配图占位 RECTANGLE   1231×237  fills=[SOLID]  constraints=MIN/MIN
  配图占位文案 TEXT     620×64    constraints=CENTER/CENTER  textAutoResize=TRUNCATE
```

现有主图路径 `rasterizeNodeToImageFill` 整节点导出、`FILL` 贴到固定尺寸主图占位，不裁剪、不改尺寸。

已知平台限制：
- `imageTransform` 在插件沙箱内写入可读回但不生效（反馈 §五）
- 单次 `figma_execute` 上限 30s；`loadFontAsync` 连续调用会被节流（见 `engine-font-load-dedupe`）

## Goals / Non-Goals

**Goals:**
- AI 可通过 `assetMap` 为任意一条 `配图：` 指定「源节点 + 区域」
- 引擎确定性裁剪，贴图不变形，占位尺寸跟随图片比例
- 每张配图 1 次 RTT

**Non-Goals:**
- 跨文件取图（插件只能访问当前文件；需要时由 AI 先把源复制到目标文件）
- `image`（URL / data URI）类型的配图资产
- 修改主图占位尺寸（主图仍是固定 1920×1080 画框，气泡坐标依赖它）
- 增量渲染

## Decisions

### D1：配图键 `NN/C/K`，K 跨 `####` 连续计数
簇是气泡编号单位，设计师和 AI 都以"第几簇第几张图"指认；K 若按 `####` 分组重置，AI 需要额外知道分组结构，易错。
- 备选：用 `配图：` 描述文本做键——描述可重复、可改写，不稳定，否决。
- 备选：全章节连续编号——簇增删后全章编号漂移，否决。

### D2：`crop` 挂在 `figma_node` 上，坐标相对源节点左上角
AI 截图时天然以源 Frame 为参照（如设计稿 1920×1080 画板上的 `(1724,888,169,169)`），无需换算绝对坐标。主图键也可用 `crop`，复用同一实现。

### D3：新增 `fillFigurePlaceholder`，单次 execute 完成全流程
render 在组装说明块后已扫描过一次，直接把 `配图` GROUP、`配图占位` RECTANGLE、`配图占位文案` TEXT 的 id 传入（`groupId` / `rectId` / `hintId`），插件端不再按名字查找。

插件端步骤：
1. 取源节点、GROUP、RECTANGLE
2. 若有 `crop`：建临时 FRAME（`clipsContent=true`，尺寸 = crop 宽高，放在当前页远离可视区域），`src.clone()` 放入并置于 `(-x, -y)`；否则直接导出源节点
3. `exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } })`，随后删除临时 FRAME（`finally` 保证删除）
4. `figma.createImage(bytes)`，RECTANGLE.fills = `[{ type: 'IMAGE', scaleMode: 'FILL', imageHash }]`
5. 尺寸：`w = min(cropW, maxWidth)`，`h = round(cropH × w / cropW)`；GROUP 先设 `layoutSizingHorizontal='FIXED'`，再 `rect.resize(w, h)`
6. 删除 `配图占位文案` TEXT
7. 返回 `{ width, height }`

与现有 `rasterizeNodeToImageFill` 并存：主图仍走旧方法；主图带 `crop` 时改走临时 FRAME 导出但不改占位尺寸（复用同一插件端裁剪片段）。
- 备选：拆成 `exportRegion` + `setImageFillFromBytes` 两个方法——要把 PNG 字节经 MCP 回传再上送，体积大且多一次 RTT，否决。

### D4：`maxWidth` 由 render 传入
render 从 `说明块` 宽度读取（当前 1231），不在 backend 写死，模板宽度变化时不需改 backend。

### D5：填充放在说明块组装完成之后
`appendBulletsInOrder` 返回的 `images[]` 增加簇内序号 `ordinal`；说明块写完正文/描述后，对有资产的配图逐个调用 `fillFigurePlaceholder`。有资产的配图跳过写 `配图占位：xxx`（反正要删）。
`fillCluster` 走的两条路径（扁平原位 / `####` 槽位）共用这一逻辑；扁平无配图路径不受影响。

### D6：未匹配键软告警
渲染前比对 IR：章节键须对应存在的章节；配图键须对应存在的 `(章, 簇, 第K张)`。不匹配 → `W_ASSET_KEY_UNMATCHED`（含键名），继续渲染。

### D7：单张失败不中断整篇
`fillFigurePlaceholder` 抛错（源节点不存在、导出失败）时记录软告警 `W_FIGURE_FILL_FAILED`（含键名、nodeId、原始错误），该占位保留描述文案，继续下一张。理由：配图是增强项，一张图失败不应让整篇回滚（反馈 §六 #4：错误信息要带 nodeId）。

## Risks / Trade-offs

- [GROUP 在 auto-layout 中从 FILL 改 FIXED 后宽度表现] → 真机验证任务覆盖；若 GROUP 不随子节点收缩，退而直接 `group.resize` 后再校正子节点
- [大区域 `exportAsync` 耗时] → 每张单独一次 execute，scale 默认 1；实测单张 1920×1080 导出应远低于 30s，真机任务测量
- [源节点 clone 会触发组件实例化副作用] → clone 后立即导出并在 `finally` 删除，不留残留；真机任务检查页面无残留节点
- [配图很窄很高（50×636 竖条）] → 按规则 w=50、h=636，不放大；可接受
