## Context

模板契约的铁律之一是「样式不进配置：字体/颜色/间距/标号形状靠克隆继承」（`template-contract` 要求「模板铁律」）。这条让模板包只需声明 4 个 key + 8 项能力，代价是**模板里的一切样式都被当成有意的**。

真机模板不是成品：

- `正文/规则` 的段落对齐是 `CENTER`（多半来自原稿排版），渲染写入正文后仍居中 → M1 102 条
- `主图占位` 带 `dashPattern: [12,12]`（占位态提示），`applyAsset` 只做 `fills = IMAGE`，虚线描边留在截图上 → 6 条

相关现有能力：

```
figma-client.ts  setTextAlign?({ horizontal, vertical })        已存在，用于占位文案居中
figma-client.ts  setTextAutoResize?({ mode })                   已存在，用于占位文案换行
figma-client.ts  clearFills?(ids)                               已存在，清图片
render/parts     applyAsset(backend, mainImage, asset)          只换 fill
```

没有「清描边」的专用能力，`setNodePaint({ stroke })` 是否支持 `null` 需确认。

## Goals / Non-Goals

**Goals:**

- 引擎写入内容的层，样式由引擎决定，不由模板继承决定
- 模板特有的占位视觉（灰板、虚线、居中说明文字）保留在「没内容」的槽上
- 归一化对产物是确定性的：同一 md + 同一模板两次渲染，属性完全一致

**Non-Goals:**

- 不做全量样式配置（不新增字体 / 字号 / 行高 / 颜色字段）
- 不改模板部件本身（编译侧不动）；改模板是更贵的路径，这里是兜底
- 不动装饰层（背景、分割线、标号形状）
- 不做「样式漂移检测」，那是 `template-contract` 的指纹范畴

## Decisions

### D1：按「谁写了内容」决定归一化范围

| 层 | 引擎是否写内容 | 归一化 |
|---|---|---|
| `正文/规则` | 是（条目文本） | 左对齐 + `HEIGHT` |
| `配图占位文案` | 是（`配图占位：<desc>`） | 居中（现状已由 `centerHint` 处理，保持） |
| `正文`（簇标题） | 是 | 不动对齐（标题居中是模板意图） |
| `配图占位` 矩形 | 是（填图） | 填图后清描边 |
| `主图占位` 矩形 | 是（填图） | 同上 |
| 其余 | 否 | 不动 |

替代方案：全产物扫一遍、把所有 TEXT 设 LEFT。否决——会把标题、标号、说明文字一起改坏。

### D2：归一化在「写入的同一批操作」里，不额外开一轮

`setMultipleTextContents` 已经批量写文本。段落对齐若单独一轮 102 次调用，就是 102 次往返，真机直接超时（历史经验：一次 exec 完成，见 `groupFigure`）。

所以：正文写入 SHALL 走一个批量能力（`setTextContentsWithStyle` 或复用现有批量入口的参数扩展），一次调用同时写 `characters` / `textAlignHorizontal` / `textAutoResize`。

替代方案：文本写完后再批量 `setTextAlign`。否决——两轮扫描 + 两轮写入，M1 规模下不可接受。

### D3：置图清描边并入 fill 调用

`applyAsset` 改成一次 `setNodePaint({ fills: IMAGE, strokes: [], dashPattern: null })` 语义的调用；若后端不支持一次给，则在同一个 exec 里连做。

反向失败处理：清描边失败 SHALL 只告警（图已经贴上，产物可用），不整轮回滚。

### D4：告警聚合，不逐条刷屏

`W_TEXT_ALIGN_NORMALIZED` 一条，message 带「N 条正文层对齐被归一化为 LEFT（模板原为 CENTER）」。理由：102 条告警会把真问题埋掉，这次人工排查的成本已经证明「告警量」本身是可用性问题。

### D5：不引入能力开关

不做 `capabilities.textAlign` 之类的枚举。理由：模板契约铁律第 4 条「结构差异才进契约；新差异不能表达就拒绝，不临时加能力」。正文左对齐是产品共识，不是项目差异。

## Risks / Trade-offs

- [某些项目正文本来就该居中] → 不支持；若真出现，走「模板包加能力」的正规流程，先不改契约
- [批量写样式的能力不存在，需要新增后端能力] → 优先找现有批量入口的参数扩展面；新增后端能力要同步补 `figmaConsoleBackend` 与测试
- [清描边影响「带边框截图」的设计意图] → 只清 `配图占位` / `主图占位` 两个占位层，其它层不碰
- [`HEIGHT` 自适应会让正文高度变化，章节总高需重算] → 已有 `refreshChapterGeometry`，在填完后统一跑；需断言顺序在样式归一化之后
- [同步侧同样清描边，可能覆盖人工加的描边] → 同步只在 `figure` 的 fills 批次里清，且该批次已要求图 hash 与 stamp 一致（即引擎自己的图）

## Migration Plan

1. 先确认后端能否一次写「文本 + 对齐 + 自适应」；不能则加能力
2. 渲染路径改（parts + legacy），跑单测
3. 同步 fills 批次补清描边
4. 真机 M1 全量渲染，断言：`正文/规则` 中无 CENTER、`主图占位` 无 `dashPattern`、手工修补清单减少 108 项
5. 回滚：归一化是可删除的独立调用，回退即恢复继承行为

## Open Questions

- `setNodePaint` 传 `stroke: undefined` 是「不改」还是「清空」？（决定是否要新增 `clearStrokes`）
- 正文左对齐后，条目换行缩进是否跟随模板的 `paragraphIndent` / `paragraphSpacing`？当前不动，观察一轮
