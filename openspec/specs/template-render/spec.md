# template-render Specification

## Purpose
TBD - created by archiving change engine-multi-part-template-render. Update Purpose after archive.
## Requirements
### Requirement: 渲染路径分派

`render_v2_markdown_to_figma` SHALL 在建立任何画布节点之前解析模板包：当且仅当 `components.top`、`components.chapter`、`components.cluster` 三者均非空时走「多部件渲染」路径；任一缺失时 SHALL 完全回落既有克隆路径。

渲染 SHALL 在 stderr 输出一行 `render mode: parts|legacy`，便于真机排障。

#### Scenario: 无模板包回落旧路径
- **WHEN** 项目没有登记模板包（或 `components` 全为 `null`）
- **THEN** 渲染 SHALL 与变更前逐节点一致，SHALL NOT 调用 `importComponentByKey`

#### Scenario: 有模板包走新路径
- **WHEN** 模板包含 `top` / `chapter` / `cluster` 三个 key
- **THEN** 渲染 SHALL 按 key 导入部件，且 SHALL NOT 克隆模板根节点

#### Scenario: 缺结尾不阻断
- **WHEN** 模板包 `components.footer` 为 `null`
- **THEN** 渲染 SHALL 正常完成，文档不含结尾区，SHALL NOT 报错

### Requirement: 部件导入与拼装

新路径 SHALL 对每个部件执行 `importComponentByKey` → `createInstance` → `detach`，并把 detach 后的节点挂到新建的文档根帧下：`top` 在前，`chapter` 按 md 顺序，`footer` 在末。

文档根帧 SHALL 由渲染创建并设为纵向自动布局（`itemSpacing` = 部件间隔、高度 HUG），部件挂入后由自动布局排布与撑高；根帧宽度 SHALL 取各部件最大宽度。

后端未实现 `setAutoLayout` 时 SHALL 回落手工排版：逐部件写 y 坐标并一次性设根帧高度，行为与变更前一致。

部件自带自适应（根 `layoutMode` 为 `HORIZONTAL` / `VERTICAL`）时，渲染 SHALL NOT 手工改写其高度。

#### Scenario: 章节增高不错位
- **WHEN** 某章节簇数量远多于模板自带槽位，填充后章节高度增大
- **THEN** 后续章节与结尾 SHALL 整体下移，且任意两部件 y 区间 SHALL NOT 重叠

#### Scenario: 根帧自动布局
- **WHEN** 后端实现了 `setAutoLayout`
- **THEN** 文档根帧 SHALL 是纵向自动布局且高度 HUG，渲染 SHALL NOT 手工累加 y

#### Scenario: 部件自带 HUG 链
- **WHEN** 章节部件根 `layoutMode = HORIZONTAL`
- **THEN** 渲染 SHALL NOT 对该章节调用 `resizeNode` 改高度

#### Scenario: 后端不支持布局
- **WHEN** 后端未实现 `createFrame` 或 `resizeNode`
- **THEN** 渲染 SHALL 返回 `V2_RENDER_LAYOUT_UNSUPPORTED`，且 SHALL NOT 在画布上留下任何节点

#### Scenario: 隐藏母版克隆后可见
- **WHEN** 被导入的部件由隐藏母版编译而来
- **THEN** 渲染 SHALL 将挂载后的节点设为可见

### Requirement: 清空部件原稿

渲染 SHALL 在填充每个部件之前清空其原稿内容，且 SHALL 保留结构、层级与样式载体。

| 部件 | SHALL 清空 | SHALL 保留 |
|---|---|---|
| `chapter` | `Text` 容器全部子节点、`#Name` 文本、`主图占位` 的图片填充、`气泡` 内除母版外的标号 | `气泡`、标号母版、图区几何 |
| `cluster` | 编号文本、`#Title_Main` 文本、多余内容行、多余分组槽、`配图` 填充、职能标签可见性 | 样式载体、一份最小槽位 |
| `top` | 5 个元信息文本、2 个 `#Content` 正文 | 标题类文本与结构 |

#### Scenario: 不残留上一份文档内容
- **WHEN** 用带有原稿的 `蛋仔派对` 部件渲染另一份 md
- **THEN** 产物中 SHALL 不含部件原稿的任何文本、截图填充或簇

### Requirement: 槽位按统一命名读取

渲染 SHALL 只按统一槽位名读取槽位，SHALL NOT 在渲染期按形状推断槽位。

关键槽位缺失时 SHALL 返回 `V2_RENDER_PART_SLOT_MISSING` 并指明部件与槽位名，SHALL NOT 用相邻节点顶替。

兼容读法 SHALL 只读、不写：`职能标记` 缺失时接受 `Frame 4273*` 前缀；`标号/母版` 缺失时取 `气泡` 下第一个 `标号/*`。

#### Scenario: 关键槽位缺失
- **WHEN** 章节部件内没有 `Text` 簇容器
- **THEN** 渲染 SHALL 在建画布前返回 `V2_RENDER_PART_SLOT_MISSING`，错误信息含 `chapter.Text`

#### Scenario: 旧命名部件仍可渲染
- **WHEN** 部件里的职能标签帧仍叫 `Frame 427319720`
- **THEN** 渲染 SHALL 正常按职能填充，且 SHALL NOT 修改该部件

### Requirement: 8 项能力在渲染期生效

渲染 SHALL 逐项按 `capabilities` 取值决定行为，SHALL NOT 一律按缺省值执行。

| 能力 | 取值 | 渲染行为 |
|---|---|---|
| `overview` | `two-frames` | 填 `功能背景` 与 `核心交互` 两栏 |
| | `single-block` | 只填一栏，另一栏隐藏 |
| | `none` | 不填；md 含总览时拒绝 |
| `badgeSlot` | `container` | 在 `气泡` 内摆标号 |
| | `manual` / `none` | 不摆标号并记缺口 |
| `numberBadge` | `text` | 直接写编号文本 |
| | `instance` | 写实例内 `#Number`，保留实例样式 |
| | `none` | 不写编号并记缺口 |
| `roleAnnotation` | `component-variant` | 按职能保留 / 切换变体 |
| | `inline-suffix` | 职能写入文本句尾 |
| | `none` | 忽略 `@职能` 并告警 |
| `figure` | `named-group` / `first-non-text` | 统一按 `配图` 槽位填充 |
| | `none` | 丢弃配图并告警 |
| `column` | `right` / `bottom` | 按测量坐标排布簇，无写死几何常量 |

#### Scenario: 单块总览
- **WHEN** `capabilities.overview = single-block` 且 md 只有一个总览段落
- **THEN** 渲染 SHALL 只填一栏，SHALL NOT 报错

#### Scenario: 实例编号保留样式
- **WHEN** `capabilities.numberBadge = instance`
- **THEN** 编号 SHALL 写入该实例内部 `#Number` 文本，SHALL NOT 删除实例

### Requirement: 分组填充分叉

渲染 SHALL 按 `clusterGroups` 选择分组填充算法：

- `slot-run`：每个 `####` 占用一个 `#Title` 槽位运行段；首段复用唯一槽位，其余克隆；多余槽位删除。
- `inline-subtitle`：SHALL NOT 克隆槽位；`####` 文本 SHALL 作为该组首行内容的前缀写入。
- `none`：md 含 `####` 时 SHALL 拒绝渲染（`V2_RENDER_SUBGROUP_UNSUPPORTED`）。

#### Scenario: 槽位跑批
- **WHEN** 某簇有 3 个 `####`，而部件只有 1 个 `#Title` 槽位
- **THEN** 渲染 SHALL 克隆 2 个槽位并按顺序承载，且每组内容行数正确

#### Scenario: 不支持分组
- **WHEN** `clusterGroups = none` 且 md 出现 `####`
- **THEN** 渲染 SHALL 在建画布前失败，错误信息包含位置与修复建议

### Requirement: 隐藏备用池分叉

渲染 SHALL 按 `hiddenPool` 选择内容行 / 分组槽的分配策略，三条策略 SHALL 共用同一分配结果结构。

| 取值 | 策略 |
|---|---|
| `reuse` | 优先复用隐藏备用槽（设为可见），不足再克隆可见槽，超出部分隐藏而非删除 |
| `ignore` | 先删除全部隐藏备用槽，再按需克隆可见槽 |
| `absent` | 不存在池子，只按需克隆可见槽，多余可见槽删除 |

#### Scenario: 复用隐藏槽
- **WHEN** `hiddenPool = reuse`，某簇有 2 个隐藏内容行与 3 条内容
- **THEN** 渲染 SHALL 复用 2 个隐藏槽 + 克隆 1 个可见槽，且 SHALL NOT 留下幽灵隐藏节点参与编号

#### Scenario: 忽略隐藏槽
- **WHEN** `hiddenPool = ignore`
- **THEN** 渲染 SHALL 删除隐藏备用槽，且产物中不存在隐藏的残留内容行

### Requirement: 标号摆位

`badgeSlot = container` 时，渲染 SHALL 为每个簇在 `气泡` 内生成一个标号：克隆标号母版 → 写入编号 → 摆位 → 强制可见。

摆放坐标 SHALL 取自模板自带网格（第 i 个簇取第 i 个网格点，按章节内序号）。标号 SHALL 位于图区之上。

无可用母版时 SHALL 返回 `V2_RENDER_BADGE_MASTER_MISSING`，SHALL NOT 静默跳过。

#### Scenario: 按网格摆位
- **WHEN** 某章节有 3 个簇且无坐标资产
- **THEN** `气泡` 内 SHALL 有 3 个标号，编号为 1/2/3，坐标分别等于网格前 3 点

#### Scenario: 资产坐标覆盖
- **WHEN** 某章节有 3 个簇且无额外坐标来源
- **THEN** 3 个标号 SHALL 分别落在网格前 3 点，且不影响其他章节的编号

### Requirement: 渲染前冲突校验

md 与模板能力冲突时，渲染 SHALL 在建立任何画布节点之前失败，错误 SHALL 同时给出 md 位置与模板原因。

需要拦截的冲突 SHALL 至少包括：簇内分级（`clusterGroups = none` 但 md 用了 `####`）。

可在产物中省略的缺口 SHALL 走软告警，SHALL NOT 阻断渲染：总览（`overview = none`，md 语法要求写总览但模板没有总览区）、配图槽缺失、`badgeSlot` 非 `container`、`numberBadge = none`、`roleAnnotation = none`。

可在产物中省略的缺口 SHALL 走软告警，SHALL NOT 阻断渲染：配图槽缺失、`badgeSlot` 非 `container`、`numberBadge = none`。

#### Scenario: 总览冲突
- **WHEN** `overview = none` 且 md 含总览段落
- **THEN** 渲染 SHALL 省略总览并返回软告警 `W_OVERVIEW_SLOTS_MISSING`，SHALL NOT 拒绝整份文档

#### Scenario: 缺口不阻断
- **WHEN** 模板无配图槽（`figure = none`）且 md 含配图资产
- **THEN** 渲染 SHALL 完成并在 `warnings` 中包含 `W_FIGURE_DROPPED`

### Requirement: 失败回滚

渲染 SHALL 在开始前写入撤销点；失败时 SHALL 触发一次撤销，并删除本次创建的文档根帧（若已创建）。

#### Scenario: 中途失败不留半成品
- **WHEN** 第 2 章填充抛错
- **THEN** 渲染 SHALL 返回失败，画布上 SHALL NOT 存在本次创建的根帧及其子节点

### Requirement: 1:14 新旧路径等价

对 `官方1.14` 模板，新路径产物与旧路径产物 SHALL 在「节点名称 / 文本内容 / 层级 / 各类数量」上等价。

允许差异 SHALL 逐条列入文档化清单并说明原因，SHALL NOT 存在未列出的差异。

#### Scenario: 等价性回归
- **WHEN** 用同一份 md 与 assetMap 分别跑旧路径与新路径
- **THEN** 结构比对 SHALL 只报出清单内的差异

