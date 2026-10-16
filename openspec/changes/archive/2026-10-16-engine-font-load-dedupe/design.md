## Context

实测数据（文件 `Agent草稿`，节点 `540:160`，47 条 `正文/规则`，全部 Noto Sans SC Regular）：

| 写法 | 耗时 |
|---|---|
| 逐节点 `getRangeAllFontNames` + `loadFontAsync` + 写入（现实现） | >30s 超时；前 6 条 ~1ms，第 7 条起 `loadFontAsync` 每次 ~1000ms |
| 每种字体只 `loadFontAsync` 一次，再批量写入 | 13ms |
| `findAll` 遍历 397 节点 | 14ms |
| 单次写 `characters` | ~1ms |

插件端 `figma_execute` 的 timeout 上限为 30s（传 60000 仍按 30s 截断）。

## Goals / Non-Goals

**Goals:** 单次 `setMultipleTextContents` 的字体加载开销 = 不同字体数 × ≤1s，与节点数无关。

**Non-Goals:**
- 不做跨 `figma_execute` 的字体缓存（插件全局状态生命周期不可控）
- 不合并 render 的 RTT（不是本次超时根因，按需另开）
- 不改 `setTextContent`（单节点，每次最多几种字体）

## Decisions

### D1：两段式——先收集去重加载，再统一写入
先遍历所有目标节点，按 `family + "\u0000" + style` 收集字体集合并逐个 `loadFontAsync`，再统一写 `characters`。
- 备选：边写边查 Set——效果相同，但两段式把"加载"与"写入"分开，便于未来对加载失败单独报错。

### D2：保留"找不到节点 / 非 TEXT 跳过"语义
与现实现一致：`getNodeByIdAsync` 为空或非 TEXT 的条目静默跳过。

## Risks / Trade-offs

- [节流规则未公开，未来可能变化] → 去重后调用次数 ≈ 字体种数，无论节流阈值如何都远低于上限
- [混合字体 TEXT（一段多字体）] → `getRangeAllFontNames` 返回全部字体，均进入集合，行为与现实现一致
