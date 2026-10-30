## Context

- 上一变更（`2026-10-27-template-compile-to-library`，已归档）交付了 4 部件编译、字体归一化、标号容器补齐、嵌套收编、产物能力重算、两段式发布回填。库文件 = `交互SOP模板库` / `jQf7zj33pzOGsGKO4d73OO`；沙盒 = `SOP 校验沙盒` / `0eoR7aPlpzIva8IdWATWkL`。
- 已真机接入：`蛋仔派对`（`796:12489`，4 部件 + 3 零件）、`官方1.14`（`1:14`，3 部件无结尾）。两份包都在 `~/.game-interaction-sop/templates/`。
- 现有渲染（`render.ts`）是单文件克隆 + 名字查槽：`template-map.ts` 里的 `#Name` / `主图占位` / `气泡` / `Text` / `Number` / `#Title_Main` / `#Title` / `正文/规则` / `配图` / `Frame 4273*` 全是 `1:14` 的图层名。项目模板命名完全不同，这套名字对它们无效。
- 归一化模板是我们自己的产物（库文件里的组件），**改名不碰源模板、不影响外观**，因此「统一命名」是实现成本最低、运行时最确定的分层。

### 真机与平台事实（决定本变更形状）

| 事实 | 后果 |
|---|---|
| 已发布组件只能在别的文件里 `importComponentByKeyAsync` 取到实例 | 渲染入口必须是「按 key 导入 + detach」，不能假设能读到组件内部节点 |
| detach 会换节点 id | 每次 detach 后必须重新解析槽位，不能缓存跨 detach 的 id |
| 插件 API 无「新建帧」以外的高级布局接口（无 auto-layout 设置方法） | 根帧由我们创建并显式摆放；章节 / 簇高度会随内容变化，必须两遍布局 |
| 隐藏母版克隆后仍隐藏 | 克隆出的簇 / 章节必须强制可见 |
| 图层嵌在 COMPONENT 里时不能转组件 | 本变更不转组件，只读改名 + 拼装，规避该坑 |
| 冒烟只能在沙盒文件跑（源文件 import 会因依赖成环 30s 超时） | 复用 `phase=verify` 的既有约定，不改 |

## Goals / Non-Goals

**Goals:**

- 有模板包的项目用「导入 4 部件 → detach → append」渲染；无包项目行为零变化。
- 槽位解析只认统一命名（编译期写死），运行时**不做形状猜测**。
- 8 项能力逐项在新路径落地，`clusterGroups` / `hiddenPool` 为函数级分叉。
- 三条债务清完：部件原稿清空、标号落点、`md-contract.md`。
- `1:14` 走新路径时输出与旧路径等价（结构 + 文案 + 数量），用测试锁住。
- 表达不了的差异：建画布前拒绝并给出明确错误码，不静默降级。

**Non-Goals:**

- 不做插件跨文件搬运；人工粘贴一次仍在。
- 不改 `template.json` 的样式语义：颜色 / 间距 / 标号形状仍来自克隆。
- 不新增能力项，不做一项目多套模板。
- 不改 `markdown-v2-contract` 的 md 语法本身（只加「与能力冲突时报错」的约束）。
- 不做标号的人工微调工具（引擎给出确定性网格，人工可后续拖）。

## Decisions

### D1 统一槽位命名是契约的一部分

归一化模板内部槽位使用固定名字，渲染只按名字取值。名字表集中在新增的 `template-slots.ts`，编译与渲染共用一份，避免两边各写一套字符串。

| 部件 | 槽位 | 统一名 | 类型 / 说明 |
|---|---|---|---|
| `top` | 文档标题 | `文档标题` | TEXT |
| `top` | 负责人 | `设计师名称` | TEXT |
| `top` | 需求组 | `需求组名称` | TEXT |
| `top` | 单号链接 | `易协作单号链接` | TEXT |
| `top` | 更新时间 | `更新时间` | TEXT |
| `top` | 功能背景 | `功能背景` | FRAME，内含 `#Content` TEXT |
| `top` | 核心交互 | `核心交互` | FRAME，内含 `#Content` TEXT |
| `chapter` | 章节标题 | `#Name` | TEXT |
| `chapter` | 主图 | `主图占位` | RECTANGLE（`主图占位文案` TEXT 为提示层） |
| `chapter` | 标号容器 | `气泡` | FRAME，覆盖图区 |
| `chapter` | 标号母版 | `标号/母版` | FRAME（隐藏），内含 `#Number` TEXT |
| `chapter` | 簇容器 | `Text` | FRAME |
| `cluster` | 编号载体 | `Number` | TEXT 或 INSTANCE（其内 `#Number` 可写） |
| `cluster` | 簇标题 | `#Title_Main` | TEXT |
| `cluster` | 分组槽 | `#Title` | TEXT（`slot-run` 用） |
| `cluster` | 内容行 | `正文/规则` | TEXT，可多份 |
| `cluster` | 配图槽 | `配图` | GROUP/FRAME（`配图占位` RECT + `配图占位文案` TEXT） |
| `cluster` | 职能标签帧 | `职能标记` | FRAME，子 TEXT 为 `@GUI` 等 |

兼容读法（只读、不写入）：`职能标记` 缺失时接受旧前缀 `Frame 4273*`；`标号/母版` 缺失时取 `气泡` 下第一个 `标号/*`。这样 `官方1.14` 的已发布部件无需重编即可被新路径使用。

**为什么不是「打 plugin data」**：plugin data 不跨文件传递、某些实例上下文读不到，还要在配置里兜底；名字是渲染时唯一稳定可读的信息，且改名零风险。锚点机制保持原样，留给「名字也没法统一」的极端项目。

**为什么不运行时按形状猜**：形状判定已经在探针与编译期做过一次（有缺口、有人看报告）；运行时再猜一次等于把不确定性搬到每次渲染，出错更难定位。

### D2 统一命名在编译期完成，且必须发生在发布前

顺序（`compile` 阶段）：

```
进门检查 → 建 4 部件 → 字体归一化 → 标号容器 + 标号母版收口
→ 嵌套收编 → 槽位命名归一化 → 产物能力重算 → 自动排版 → 报告
```

- 命名归一化读产物的结构规约（复用 `probe/tree.ts` + `probe/detect.ts`），只改**被判定为槽位**的节点名，绝不整树改名。
- 已经是统一名的节点不动（幂等）：`官方1.14` 重编不会产生任何名字变化。
- 关键槽位（`chapter.主图占位` / `chapter.Text` / `cluster.Number` / `cluster.#Title_Main` / `cluster.正文/规则`）一个都定不下来 → 编译拒绝（`V2_COMPILE_SLOT_UNMAPPED`），不带着半套部件去发布。
- 非关键槽位（`配图`、`#Title`、`职能标记`）缺席 → 记 `gaps`，能力值同步降级（例如无配图槽则 `figure: none`）。
- 改名只发生在库文件；源模板指纹必须前后一致（沿用既有零写入断言）。

### D3 渲染前清空部件原稿（债务 1）

部件是「克隆母版」的产物，必然带着编译当时那份原稿。每次渲染在填充前执行一次 `resetPart`：

| 部件 | 清空动作 | 保留 |
|---|---|---|
| `top` | 清空 5 个元信息 TEXT 与 2 个 `#Content` 文本 | 结构、样式、两个标题 TEXT |
| `chapter` | 删掉 `Text` 容器内**全部**子节点；清空 `#Name`；移除 `主图占位` 的 IMAGE 填充并恢复可见提示文案；删掉 `气泡` 内除母版外的所有标号 | `气泡`、`标号/母版`、图区几何 |
| `cluster` | 编号清零；`#Title_Main` 清空；内容行只留 1 条；`#Title` 槽位只留 1 个且隐藏；`配图` 复位（去填充、隐藏）；`职能标记` 全部文本隐藏 | 视觉、层次、一个最小槽位 |

清空一律「按统一名定位后删 / 改」，不整容器重建：样式载体（圆角、描边、颜色）必须留在原位。删节点用一次批量删除，避免 N 次 RTT。

### D4 拼装与布局（导入 → detach → append）

```
1. for part of [top, chapter×N, cluster×Σ, footer?]:
     importComponentByKey(key) → createInstance → detach
     （detach 换 id，之后按新 id 重新扫描槽位）
2. 测量：top.h、各 chapter.h、footer.h
3. root = createFrame(『文档』, width=top.w, height=Σh+间距)
4. 顺序 append：top → chapter… → footer，全部放在 root 的 x=0，y 依次累加
5. 填内容：每章 resetPart → 填标题 / 图 → 簇逐个 resetPart + fill → append 到章节的 `Text`
6. 二次布局：重新测量各部件高度，重排 y、resizeNode(root)
```

- 为什么两遍：簇填充会改变章节高度（非 auto-layout 的列不会自己长），一遍布局必错位。
- 为什么自建根帧：部件是独立组件实例，没有共同父级；不建根帧就只能把一堆节点散在页面上，`rootInstanceId` 与 reconcile 都失去意义。
- 后端缺 `createFrame` / `resizeNode` → 直接 `V2_RENDER_LAYOUT_UNSUPPORTED`，**不静默错排**。
- 章节内的 `Text` 若是 auto-layout 就顺序 append；不是则按测量高度设 y（Figma 里非 auto-layout 帧的子节点靠 `moveNode` 定位）。
- 每完成一个部件调用一次 `setNodeVisible(true)`：隐藏母版克隆后仍隐藏（已知坑）。

### D5 8 项能力落在哪一层

| 能力 | 编译期（归一化） | 渲染期 |
|---|---|---|
| `overview` | 无（top 是否含 `功能背景` / `核心交互`） | `two-frames` 填两栏；`single-block` 只填一栏；`none` 且 md 有总览 → 硬错误 |
| `clusterGroups` | 无（保留 `#Title` 槽位） | **函数级分叉**：`slot-run` 克隆槽位；`inline-subtitle` 写进首行加粗；`none` 且 md 有 `####` → 硬错误 |
| `badgeSlot` | 补 `气泡` + `标号/母版`，能力值重算为 `container` | `container` 按网格摆标号；`manual` / `none` 不摆并记缺口 |
| `numberBadge` | 编号载体统一命名 `Number` | `text` 直接写字符；`instance` 写其内 `#Number`，同时保留实例样式 |
| `roleAnnotation` | `职能标记` 帧统一命名 | `component-variant` 按职能切变体；`inline-suffix` 写句尾；`none` 忽略 `@` 并告警 |
| `figure` | 定位图槽并统一命名 `配图` | 统一按 `配图` 填；`none` 丢弃配图并告警 |
| `hiddenPool` | 无（隐藏备用槽原样保留） | **函数级分叉**：`reuse` 复用隐藏槽；`ignore` 先删隐藏槽再克隆可见槽；`absent` 只克隆可见槽 |
| `column` | 无 | 读值决定章节内簇的起始轴（`right` 与 `bottom` 均按测量坐标摆，无几何常量） |

实现补充（与上表的对应关系）：

- `roleAnnotation` 非 `component-variant` 时，渲染会**删掉簇部件里的职能标记帧**：那是原稿的角色残留，留着会把旧角色带进新文档；内联写法的 `@职能` 本来就在正文文本里。
- `numberBadge = none` 时删掉簇里的编号载体，不再写编号。
- `hiddenPool` 的三条策略共用「先按策略处理池子、再交给统一填充」的顺序；部件每次渲染都是新导入，所以 `reuse` 的「多余槽隐藏」只在本次渲染内生效。

### D6 `clusterGroups` 与 `hiddenPool` 的函数级分叉

**`clusterGroups`**

- `slot-run`：md 的 `####` 分组由 `#Title` 槽位承载。第 1 组复用唯一槽位，其余克隆；组内内容行落在该组之后的连续槽位里。删除多余槽位，最后统一 `relayoutCluster`。
- `inline-subtitle`：不克隆槽位；`####` 文本写进该组第一行内容的前缀（加粗），与既有 `bold` 规则共用一次批量文字写入。
- `none`：任何 `####` 都在建画布前被 `V2_RENDER_SUBGROUP_UNSUPPORTED` 拒绝。

**`hiddenPool`**（簇尾隐藏备用槽，`蛋仔派对` 现实存在）

- `reuse`：按需「解锁」隐藏槽 —— 先把隐藏槽设为可见并按其顺序复用，超出后再克隆可见槽；多余的复用槽隐藏而非删除（保留池子给下次）。
- `ignore`：先一次性删除全部隐藏备用槽（它们是原稿残留，不删会以幽灵节点混进扫描），再按需克隆可见槽。
- `absent`：没有池子，只按需克隆可见槽；多余可见槽删除。

三条分支共用一个 `allocateSlots(want, visibleSlots, hiddenSlots)` 结果结构（`reuse[] / cloneCount / hide[] / delete[]`），分叉只体现在策略参数上，便于单测逐条覆盖。

### D7 标号落点（债务 2）

容器有了但没坐标，等于没有标号。算法：

1. **母版来源**：`chapter.标号/母版`；缺失时取 `气泡` 下第一个 `标号/*` 并就地当作母版（只读兼容，不写入已发布组件）。
2. **数量与编号**：每个簇一个标号，序号 = 章节内的簇序号（1 起）。
3. **坐标**：默认取 `DEFAULT_BUBBLE_GRID[i]`（`气泡` 局部坐标，等价 1920×1080 图内坐标），i 为章节内簇序号。当前数据结构没有「标号坐标」资产类型，因此不做覆盖；需要精修时人工拖。
4. **写入**：克隆母版 → 设 `#Number` 文本 → 设 x/y → 强制可见 → 移入 `气泡`。批量：先克隆完再一次性摆位，减少 RTT。
5. **无母版**：`badgeSlot=container` 却没有可用母版 → `V2_RENDER_BADGE_MASTER_MISSING` 硬错误，提示重编（编译阶段会补母版）。`badgeSlot` 为 `manual` / `none` 时不摆标号，`gaps` 记一条。

标号是「图上的说明点」，不是文档正文顺序的一部分；它必须在图区之上，因此 `气泡` 必须在章节内的层级保持在 `主图占位` 之上（编译期已保证，渲染期不改层级）。

### D8 `md-contract.md` 生成（债务 3）

- 输入：模板包（`components` + `capabilities` + `source`）+ 统一槽位表的「该模板实际拥有哪些槽位」。
- 输出：一份人读 Markdown，固定 10 节：顶部字段 / 章节 / 簇 / 分组 / 配图 / 标号 / 职能 / 总览 / 禁写清单 / 最小骨架示例。
- 确定性：同一模板包重复生成逐字节一致（不含时间戳、不含随机 id）。
- 入口：`figma_compile_template` 的 `verify` 报告携带 `mdContract: { path, content }`；新增只读阶段 `phase: "contract"`，对已登记项目重新生成（不连 Figma，不写库）。
- 写盘：引擎只返回文本与建议路径 `<项目根>/.interaction-sop/md-contract.md`，落盘由调用方 / SOP 完成——MCP 进程不知道项目根在哪，猜路径会写错地方。
- `template.json` 的 `mdContract` 字段写相对路径，供后续渲染与 agent 定位。

### D9 渲染前冲突校验（建画布之前）

md 与能力冲突一律在建画布前失败，错误信息同时指出「哪条 md 内容」与「模板为什么不行」，并给出可执行建议（改 md / 换模板 / 重编）：

| 冲突 | 错误码 |
|---|---|
| `clusterGroups = none` 但 md 有 `####` | `V2_RENDER_SUBGROUP_UNSUPPORTED` |
| 部件缺关键槽位 | `V2_RENDER_PART_SLOT_MISSING` |
| 后端缺 `createFrame` / `resizeNode` / `reparentNode` | `V2_RENDER_LAYOUT_UNSUPPORTED` |
| `badgeSlot = container` 但容器里没有母版 | `V2_RENDER_BADGE_MASTER_MISSING` |
| `overview = none` 但 md 有总览 | 软告警 `W_OVERVIEW_SLOTS_MISSING`（不阻断；md 语法要求写总览，模板没有就省略） |
| 配图槽缺失但有配图资产 | 软告警 `W_FIGURE_DROPPED`（不阻断） |
| `badgeSlot` 非 `container` | 软告警 `W_BADGE_UNPLACED`（不阻断） |
| `roleAnnotation = none` 但 md 有 `@职能` | `@职能` 保留在正文里，不额外成图（不阻断） |

软告警与硬错误的边界：**错误只给「必然画错」的情况**；能用一句话说明「这块没画」的走告警，避免一次小缺口把整份文档拒掉。

### D10 新旧路径分派与 `1:14` 等价

- 分派条件：解析到的模板包 `components.top && components.chapter && components.cluster` 三者齐全 → 新路径；否则 → 旧路径（现状一行不改）。
- 判定发生在 `renderInner` 入口，渲染前打印一行 `render mode: parts|legacy`（`process.stderr`），真机排障能直接看出走了哪条。
- `1:14` 的模板包三 key 齐全，会走新路径；因此必须有**等价性测试**：同一份 md + 同一份 assetMap，分别用旧路径（clone `1:14`）与新路径（pack + fake backend）渲染，比较最终节点树的「名称 / 文本 / 层级 / 数量」，差异必须为零或逐条列入允许差异清单（`phase1.master` 这类实现细节不算）。
- 等价性只在测试里跑双路径，运行时不保留开关：开关会让线上行为分叉，且没人会在出问题前切回去。

### D11 失败与回滚

- 沿用既有约定：入口 `commitUndoCheckpoint('v2-render-start')`，失败时一次 `triggerUndo(1)`。
- 新路径额外记录「已创建节点」：根帧 id 一旦创建就登记，失败时优先显式 `deleteNodes([root])`（撤销点之外再兜一层，避免画布留下半成品）。
- 局部失败（某簇填充失败）不吞：整份渲染判失败，已填内容随根节点一起删除。

### D12 迁移与已发布部件

- `蛋仔派对`：必须重编（槽位改名 + 标号母版收口）。走既有 `compile → 人工发布 → verify`，产物带 `-v2` 版本后缀，新 key 覆盖旧 key；旧组件不删（`key 稳定性与重编` 已约定）。
- `官方1.14`：槽位名本就是统一名，`标号/母版` 缺失时渲染侧有兼容读法，**可以不重编**；重编仅为了把母版收口成规范形态。
- 迁移期两套包都保留 `source` 指纹：重编前后用 `expectedFingerprint` 拦住源模板漂移。

## Risks / Trade-offs

| 风险 | 影响 | 处置 |
|---|---|---|
| 编译期改名判定错（把非槽位节点改成槽位名） | 渲染填错位置 | 只改「唯一候选」；多个候选一律不改并记缺口；改名步骤单测 + 真机重编后跑产物探针 |
| 部件高度随内容变化 | 章节叠在一起或留大空白 | 两遍布局 + 布局结果断言（y 单调递增、无重叠） |
| `1:14` 新旧路径输出差异 | 现有使用方退化 | 等价性测试锁死；允许差异必须写进清单并说明原因 |
| 标号网格不符合设计审美 | 图上标号位置需人工微调 | 提供 `assetMap` 坐标覆盖；网格是「确定性默认」而非最终方案 |
| `md-contract` 文案漂移 | 写手按错规则写 | 生成结果做快照测试；正文由能力表推导，不手写文案段落 |
| 旧路径长期并存 | 双份槽位逻辑维护成本 | 旧路径只保留给「无包项目」；`template-map.ts` 冻结，新功能只进 parts 路径 |

## Migration Plan

1. 代码合并后先在 fake backend 上跑全量测试（含等价性）。
2. 沙盒真机：用 `官方1.14` 包渲染一份样例 md，与旧路径产物逐节点比对。
3. 真机重编 `蛋仔派对` → Assets 发布 → `verify`（沙盒里 import 冒烟）→ 更新 `template.json` 与 `md-contract.md`。
4. 用 `蛋仔派对` 包渲染样例 md，人工验收：内容无残留、标号在图区、分组行为符合 `clusterGroups=none`。





