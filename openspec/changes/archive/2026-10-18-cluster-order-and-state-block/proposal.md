## Why

设计反馈 §六 #6：状态类内容没有自己的表达位，`状态·xxx：` 只是普通 bullet，和规则混排在视觉上分不开；`·` 也不是中文常用写法。同时簇内 bullet 的叙述顺序没有约定，"是什么 / 怎么交互 / 有哪些状态 / 有什么反馈"穿插出现，读起来散。

## What Changes

- **BREAKING（写法）** 状态行语法改为 `- 冷却状态：技能释放后进入，冷却结束恢复默认`；简单状态只写名字 `- 默认状态`。去掉 `状态·` 前缀，不再用 `·`。冒号后写**在什么情况下出现**，不写长什么样（交给配图）。配图仍单独一行 `- 配图：xxx` 紧跟其后。
- 新增写作规则 T9「簇内叙述顺序」：① 是什么 → ② 怎么交互 → ③ 有哪些状态 → ④ 反馈（动效句放簇末）。无内容的段跳过。能写成状态的边界情况（冷却、锁定、为空）进状态段；其余边界情况紧跟触发它的交互。
- T8 动效句式由"动效需求：时机，对象播放变化，曲线/节奏"三段式改为直接书写的一句话 `[什么情况下]，[需要什么样的动效]`：去掉 `动效需求：` 前缀、不用冒号（冒号说明格式只留给状态行），先情况后动效，不倒装。与状态行明确分工：状态行只写进入/退出条件，不写动效；同一件事有状态又有动效时拆成两条。
- 引擎识别状态行：冒号前部分（无冒号则整行）以"状态"结尾且不超过 10 个字。渲染时状态名加粗，其余照旧，纵向排列。首次渲染和同步模式都生效。
- Parser 新增 2 条软提醒：状态行不连续、仍在使用旧 `状态·` 前缀。动效句无前缀、引擎不识别，其位置只靠写作规范。
- skill 文档（v2 规范、phase2 自检清单）与主 spec 同步更新示例和规则。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `markdown-v2-contract`：新增「状态行语法」「簇内叙述顺序」需求；「动效 bullet 三段式」改名并改写为「动效 bullet 直接书写且先情况后动效」；修改「同簇同义 bullet 合并」「配图 bullet 原位插入且一簇允许多张」中的 `状态·` 示例。
- `figma-template-1-14-rendering`：新增「状态行状态名加粗」需求。
- `render-reconcile`：同步模式写入状态行时同样加粗，并在状态行变为普通规则时恢复常规字重。
- `skill-sop-workflow`：phase2 自检清单新增 T9 与状态行检查项，修改 T7 / W3 条目措辞。

## Impact

- `packages/figma-mcp-server/src/v2/`：新增状态行识别模块；`parser.ts`（2 条软提醒）、`ir.ts`（警告码）、`render.ts`（bullet 写入带加粗范围）、`reconcile/plan.ts`（setText 带加粗范围）
- `packages/figma-mcp-server/src/v2/figma-client.ts`、`src/server/figmaConsoleBackend.ts`：`setMultipleTextContents` 与 `applyOps` 的 `setText` 支持可选加粗范围
- `packages/figma-mcp-server/tests/v2/`：新增状态行识别、加粗渲染、软提醒测试；`render-inline-figures.spec.ts` 中的 `状态·` 示例改写；`BASELINE_CALL_SEQUENCE` 不变（无状态行文档不多调用）
- `packages/skill/references/markdown-v2-spec.md`、`packages/skill/phases/phase2-markdown.md`
- 已交付的变色龙 5 篇不回改
