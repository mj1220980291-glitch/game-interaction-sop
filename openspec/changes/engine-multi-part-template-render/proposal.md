## Why

模板契约与编译两个变更已交付：探针能体检任意项目模板，编译能把人工粘进库文件的部件切成 4 个已发布组件并登记 key。**但渲染仍走旧路径**——整份克隆 `1:14` 母版，再按 `1:14` 的图层名找槽位。

这条路径对项目模板失效：`798:17608` 的章节叫 `Group 2360`、簇叫 `Frame 1245`，`template-map.ts` 里的名字一个都对不上。同时部件里还带着编译当时那份原稿的文案、截图实例与簇，直接拼起来就是「旧内容 + 新内容」叠着。

结论：渲染改为「按 key 导入 4 部件 → detach → append 拼装」，槽位**在编译期统一命名**（部件是我们自己的产物，改名零成本），渲染只认统一名字。这样设计原则不动：设计师原名原样不改、源模板只读、能克隆解决的（包括命名）绝不进配置。

开工前必须先清三条债务，否则新路径做不稳：

| # | 债务 | 后果 |
|---|---|---|
| 1 | 部件带着原稿内容（文案 / 截图实例 / 全部簇） | 渲染结果残留旧内容 |
| 2 | `badgeSlot=container` 有容器，但标号落点没算 | 图上没有标号，或标号堆在原点 |
| 3 | `md-contract.md` 仍未生成 | 写手不知道这套模板允许写什么，渲染期只能报错返工 |

## What Changes

- **统一槽位命名**：新增一份权威槽位命名表（`top` / `chapter` / `cluster` 内部各槽位），编译期把检测到的槽位节点改名为统一名；渲染只按统一名取值，找不到就拒绝，不猜结构。
- **新增渲染主路径**：有模板包（4 个 `components` key）时，`render_v2_markdown_to_figma` 走「导入 → detach → append」：新建文档根帧 → 依次摆 `顶部` / 各 `章节` / `结尾` → 章节内挂 `簇`。无模板包的项目**完全回落旧路径**。
- **清空部件原稿内容**：导入 detach 后，按槽位清掉残留簇、标题文案、图片填充与提示文案、残留标号；保留样式、结构与一份隐藏母版。
- **落地 8 项能力**：`overview` / `badgeSlot` / `numberBadge` / `roleAnnotation` / `figure` / `column` 为开关或取值分叉；`clusterGroups` 与 `hiddenPool` 为函数级分叉（`slot-run` vs `inline-subtitle`/`none`；`reuse` vs `ignore`/`absent`）。
- **标号摆位**：容器内克隆标号母版并编号，坐标取 8 宫格网格，`assetMap` 给了坐标则覆盖。
- **生成 `md-contract.md`**：编译 `verify` 报告附带契约正文（同一模板包重复生成结果一致），新增只读阶段 `phase: "contract"` 供已登记项目重新生成；写盘由调用方完成。
- **渲染前冲突校验**：md 与能力冲突（总览 / `####` / `@职能` / 配图 / 标号）在建画布前报硬错误，不静默丢弃。

**本变更不做**：

- 不做插件跨文件自动搬运（人工粘贴这一步仍在）。
- 不做一项目多套模板。
- 不改样式配置：颜色 / 间距 / 标号形状仍靠克隆继承，字体仍是编译期固定常量。
- 不新增第 9 项能力：现有 8 项表达不了的差异一律拒绝并记录。

## Capabilities

### New Capabilities

- `template-render`：多部件渲染（导入 / detach / 拼装 / 布局 / 清空原稿 / 8 项能力分叉 / 标号摆位 / 冲突校验 / 旧路径回落）。

### Modified Capabilities

- `template-contract`：新增「统一槽位命名」——归一化模板内部槽位名是契约的一部分。
- `template-compile`：新增槽位命名归一化、标号母版收口、`md-contract` 产出。
- `engine-mcp-server`：`figma_compile_template` 增加 `phase: "contract"`，`verify` 报告含 `mdContract`。

## Impact

- `packages/figma-mcp-server/src/v2/template-slots.ts`（新增）：统一槽位命名表（唯一真源）
- `packages/figma-mcp-server/src/v2/compile/normalize-slots.ts`（新增）：结构检测 → 改名 → 缺口
- `packages/figma-mcp-server/src/v2/compile/badge-container.ts`：补 `标号/母版` 收口
- `packages/figma-mcp-server/src/v2/compile/md-contract.ts`（新增）：契约正文生成
- `packages/figma-mcp-server/src/v2/render/parts/`（新增）：拼装 / 章节 / 簇 / 池 / 标号 / 配图 / 布局
- `packages/figma-mcp-server/src/v2/render.ts`：按模板包分派新旧路径
- `packages/figma-mcp-server/src/v2/figma-client.ts`：`FigmaBackend` 增加 `createFrame` / `resizeNode`
- `packages/figma-mcp-server/src/server/figmaConsoleBackend.ts`：实现上述两个方法
- `packages/figma-mcp-server/src/server/createServer.ts`：`phase: "contract"`
- `packages/skill/references/template-contract.md`：补「统一槽位命名」一节
- `packages/skill/references/template-compile.md`：补 `md-contract` 产出说明
- 已接入的 `蛋仔派对` 需重编重发一次（槽位改名 + 标号母版）；`官方1.14` 槽位名本就统一，仅补标号母版时可选择重编
- 项目源模板**仍只读**：所有改名只发生在库文件里的部件上
