## ADDED Requirements

### Requirement: 批量文本写入按字体去重加载

`setMultipleTextContents` 在单次 `figma_execute` 内 SHALL 对所有目标 TEXT 的字体按 `family + style` 去重，每种字体 SHALL 只调用一次 `figma.loadFontAsync`，全部加载完成后再写入 `characters`。节点不存在或非 TEXT 的条目 SHALL 静默跳过（与原行为一致）。

理由：Figma 对短时间内连续的 `loadFontAsync` 调用节流（实测第 7 次起每次约 1000ms），逐节点加载会使数十条文本的批量写入超过插件 30s 单次执行上限。

#### Scenario: 同字体大批量写入不超时

- **WHEN** 一次 `setMultipleTextContents` 写入 47 个均为同一字体的 TEXT
- **THEN** 插件端 SHALL 只调用 1 次 `loadFontAsync`，该次执行 SHALL 在 30s 上限内完成

#### Scenario: 混合字体

- **WHEN** 批量中的 TEXT 共涉及 3 种不同字体（含单个 TEXT 内的混合字体）
- **THEN** 插件端 SHALL 恰好调用 3 次 `loadFontAsync`，再写入全部 `characters`

#### Scenario: 无效节点跳过

- **WHEN** 批量中某个 `nodeId` 不存在或不是 TEXT
- **THEN** 该条 SHALL 被跳过，其余条目正常写入，不抛错
