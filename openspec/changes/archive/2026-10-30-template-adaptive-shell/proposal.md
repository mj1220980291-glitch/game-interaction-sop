## Why

蛋仔的章节部件产物根框是 `2209×6240` 固定高（`layoutMode = NONE`），内容只有 250 高也照样留 6240，渲染只能事后量子级再 `resizeNode` 压一遍（`chapter.fit`）。真机看就是一大片空白，多行文本时还会压错。

改查发现自适应链是**造壳时断的**，不是模板没有：

```
源模板 蛋仔 796:12489
Frame 76  VERTICAL, gap 60, HUG           ← 章与章之间自动排
└─ Group 2363  GROUP 2209×6240           ← 高度 = 最大子级（GROUP 自动包边）
   ├─ 界面图示 GROUP（截图 + 标号）
   └─ Frame 1243 VERTICAL gap30 HUG      ← 说明栏自己 HUG
```
`buildChapterShell` 把 GROUP 拆平、子级提到根上，根框变成一个死数，链就断了。官方1.14 之所以自适应，是它里面那层 `界面说明1` GROUP 还在；它的簇根本来就是 `VERTICAL HUG`（`17:1583`），所以簇高度一直是对的。

## What Changes

- 编译新增「自适应外壳」步骤（空壳化之后）：
  - `chapter`：根框设 `HORIZONTAL` 自动布局 + 高度 HUG；`paddingTop` / `itemSpacing` 由现有坐标反推（**几何零改动**）；`气泡` 等舞台子级设绝对定位
  - `cluster`：根框设 `VERTICAL` 自动布局 + 高度 HUG（单子级场景，补 `paddingTop`）
  - 已是自动布局的部件直接跳过（幂等）；推不出参数就记缺口，不改半截
- `NodeInfo` 暴露 `layoutMode`；后端新增 `setAutoLayout`（同时收 `itemSpacing` / `padding` / `absoluteChildIds`，避免开自动布局那一瞬间重排）
- 渲染根帧改成纵向自动布局：部件 append 进来自己排、高度自己长，不再手工累加 y；部件自带 HUG 链时跳过 `chapter.fit`

**本变更不做**：不改宽度（跨模板宽度不一致，HUG 宽度只会重排版面）、不动样式、不读也不改项目源模板、不为单套模板写特判。这一轮只重编蛋仔；官方1.14 现有链完好，不专门重编。

## Capabilities

### Modified Capabilities

- `template-compile`：新增「自适应外壳」要求。
- `template-render`：新增「布局交给自动布局」要求。

## Impact

- `packages/figma-mcp-server/src/v2/compile/adaptive-layout.ts`（新增）
- `packages/figma-mcp-server/src/v2/compile/index.ts`：空壳化之后接入，报告加 `adaptive`
- `packages/figma-mcp-server/src/v2/figma-client.ts` / `src/server/figmaConsoleBackend.ts`：`layoutMode` 序列化 + `setAutoLayout`
- `packages/figma-mcp-server/src/v2/render/parts/index.ts`：根帧自动布局、跳过 `chapter.fit`
- `蛋仔派对` 需重编 → 发布 → 冒烟 → 回填一次
