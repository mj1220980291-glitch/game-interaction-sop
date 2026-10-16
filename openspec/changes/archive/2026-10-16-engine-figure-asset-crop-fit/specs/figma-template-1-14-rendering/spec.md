## ADDED Requirements

### Requirement: 配图资产按键填充且占位尺寸按图片比例

`assetMap` SHALL 支持配图键 `"NN/C/K"`：第 NN 章（两位零填充）第 C 簇（1 起）的第 K 张配图（1 起）。K SHALL 按该簇内全部 `配图：` bullet 的文档顺序计数，跨 `####` 分组连续，不重置。章节键 `"NN"` 仍表示该章主图。

配图键的值 SHALL 为 `{ type: 'figma_node', fileKey, nodeId, crop?, scale? }` 或 `{ type: 'skip' }`。`crop = { x, y, width, height }` 相对源节点左上角；缺省取整个源节点。`scale` 缺省为 1。

对每个有 `figma_node` 资产的配图，引擎 SHALL 在该说明块组装完成后调用一次 backend `fillFigurePlaceholder`，其行为 SHALL 为：

1. 若有 `crop`：建临时 FRAME（`clipsContent = true`，尺寸 = crop 宽高），将源节点 clone 放入并偏移 `(-x, -y)` 后导出；否则直接导出源节点。导出 SHALL 使用 `exportAsync` PNG，SHALL NOT 依赖 `imageTransform`
2. 临时节点 SHALL 在导出后删除，无论成功或失败
3. `配图占位` RECTANGLE 的 fills SHALL 替换为该 PNG 的 `IMAGE` / `FILL` 填充
4. 占位尺寸 SHALL 为 `w = min(源宽, maxWidth)`、`h = round(源高 × w / 源宽)`，其中 `maxWidth` 为说明块宽度；`配图` GROUP SHALL 随之改变尺寸，不再固定 237 高
5. `配图占位文案` TEXT SHALL 被删除

全部操作 SHALL 在一次 `figma_execute` 内完成。

单张填充失败（源节点不存在、导出失败等）SHALL NOT 中断渲染：该占位保留 `配图占位：xxx` 文案，结果追加软告警 `W_FIGURE_FILL_FAILED`，其 message SHALL 包含配图键、`nodeId` 与原始错误。

`assetMap` 中匹配不到任何章节或配图的键 SHALL 产生软告警 `W_ASSET_KEY_UNMATCHED`（message 含键名），不阻断渲染。

`summary.figuresPlaced` SHALL 等于成功填充的配图数。

#### Scenario: 配图键按簇内顺序匹配

- **WHEN** 01 章第 1 簇 bullets 为 `['a', '配图：A', 'b', '配图：B']`，`assetMap` 含 `"01/1/2": { type: 'figma_node', nodeId: 'X', fileKey: 'f' }`
- **THEN** 引擎 SHALL 只对描述为 B 的配图调用 `fillFigurePlaceholder`；描述为 A 的配图 SHALL 保留 `配图占位：A` 文案

#### Scenario: K 跨 #### 连续计数

- **WHEN** 第 1 簇有两个 `####`，第一组含 1 条 `配图：`，第二组含 1 条 `配图：`
- **THEN** 第二组那张配图的键 SHALL 为 `"01/1/2"`

#### Scenario: 按裁剪区域比例定尺寸

- **WHEN** 配图资产 `crop = { x: 0, y: 0, width: 1920, height: 1080 }`，说明块宽 1231
- **THEN** 该 `配图占位` SHALL 为 1231 × 692，`配图占位文案` SHALL 不存在

#### Scenario: 小图不放大

- **WHEN** 配图资产 `crop` 宽 50、高 636
- **THEN** 该 `配图占位` SHALL 为 50 × 636

#### Scenario: 单张失败不中断

- **WHEN** 某配图资产的 `nodeId` 在文件中不存在
- **THEN** 渲染 SHALL 返回 `ok: true`，`warnings` SHALL 含 `W_FIGURE_FILL_FAILED` 且 message 含该 `nodeId`，该占位 SHALL 保留描述文案

#### Scenario: 未匹配键告警

- **WHEN** `assetMap` 含 `"01/9/1"`，而 01 章只有 3 个簇
- **THEN** `warnings` SHALL 含 `W_ASSET_KEY_UNMATCHED` 且 message 含 `01/9/1`

#### Scenario: 不传配图键时行为不变

- **WHEN** `assetMap` 只含章节键或为空
- **THEN** 引擎 SHALL NOT 调用 `fillFigurePlaceholder`，配图占位与描述文案与本能力实现之前一致

## MODIFIED Requirements

### Requirement: 配图占位双向判定

引擎 SHALL 同时识别两种"是否需要配图"信号——簇 bullets 里有 `配图：…` 行，**且** `assetMap` 里有该配图的键 `"NN/C/K"`——两者均成立时配图占位被填充（见「配图资产按键填充且占位尺寸按图片比例」），填充后占位文案被删除；只有 `配图：` 行而无资产时，占位 SHALL 保留并显示 `配图占位：xxx` 文案，不抛错。

#### Scenario: bullets 有配图标记但 assetMap 无图

- **WHEN** 簇含 `- 配图：xxx`、`assetMap` 无对应配图键
- **THEN** 占位 SHALL 保留为可见的 `配图占位：xxx`，不抛错；`summary.figuresPlaced` SHALL 不计入该配图

#### Scenario: bullets 有配图标记且 assetMap 有图

- **WHEN** 簇含 `- 配图：xxx`、`assetMap` 有对应配图键且源节点有效
- **THEN** 占位 SHALL 被图片填充、尺寸按图片比例，`配图占位文案` SHALL 被删除
