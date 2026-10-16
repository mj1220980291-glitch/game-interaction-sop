## Why

《变色龙通用HUD规范》渲染时 `setMultipleTextContents` 单次 `figma_execute` 超过插件 30s 上限，整篇渲染失败。在目标文件实测：把 47 条 `正文/规则` 原样写回，现实现**超过 30s**；同一批节点每种字体只加载一次，**13ms** 完成。

根因：`setMultipleTextContents` 对**每个** TEXT 都调用 `figma.loadFontAsync`，即使字体相同、早已加载。Figma 在短时间连续调用后对 `loadFontAsync` 节流，第 7 次起每次稳定约 1000ms。47 条正文全是同一字体（Noto Sans SC Regular），却付出了 40+ 秒的重复加载。

这与 `engine-inline-multi-figure` 无关——触发超时的那次渲染跑的是改动前的引擎（MCP 进程启动于 2026-10-14 18:10，早于新 dist），属于独立的既有性能缺陷。

## What Changes

- `setMultipleTextContents`：单次执行内按 `family + style` 去重，每种字体只 `loadFontAsync` 一次，再统一写 `characters`。
- 不改 backend 接口、不改 render 调用序列；`setTextContent`（单节点）行为不变。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `engine-mcp-server`：新增「批量文本写入按字体去重加载」需求。

## Impact

- `packages/figma-mcp-server/src/server/figmaConsoleBackend.ts` — `setMultipleTextContents` 插件端脚本
- 需重启 figma-interaction-doc-engine MCP 进程才会生效（同时加载 `engine-inline-multi-figure` 的改动）
- **不影响**：parser、render、IR、测试 mock（mock 不模拟字体加载）
