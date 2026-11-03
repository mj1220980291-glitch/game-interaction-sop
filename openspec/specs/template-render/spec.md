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

摆放坐标 SHALL 取自模板自带网格（第 i 个簇取第 i 个网格点，按章节内序号），或调用方提供的 `badgeAnchors`。标号 SHALL 位于图区之上。

主图落图 SHALL NOT 改变模板原有层序：以 `figma_instance` 资产替换主图占位时，新实例 SHALL 插回占位节点原来的兄弟索引，并 SHALL 继承占位节点的名称。

无可用母版时 SHALL 返回 `V2_RENDER_BADGE_MASTER_MISSING`，SHALL NOT 静默跳过。

#### Scenario: 按网格摆位

- **WHEN** 某章节有 3 个簇且无坐标资产
- **THEN** `气泡` 内 SHALL 有 3 个标号，编号为 1/2/3，坐标分别等于网格前 3 点

#### Scenario: 资产坐标覆盖

- **WHEN** 某章节有 3 个簇且无额外坐标来源
- **THEN** 3 个标号 SHALL 分别落在网格前 3 点，且不影响其他章节的编号

#### Scenario: 主图实例不压住标号

- **WHEN** 模板章节的 `舞台` 子节点顺序为 `[气泡, 主图占位]`，且该章资产类型为 `figma_instance`
- **THEN** 主图实例 SHALL 落在原 `主图占位` 的索引上（仍排在 `气泡` 之后），该章所有标号 SHALL 可见，SHALL NOT 需要手工提层

#### Scenario: 主图槽名保留

- **WHEN** 主图占位节点名为 `主图`，以 `figma_instance` 资产替换
- **THEN** 替换后的实例名称 SHALL 仍为 `主图`，后续打标 SHALL 能命中 `main` 槽位

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

### Requirement: 职能标记组件在两条渲染路径一致生效

`@职能` 条目 SHALL 在 legacy 路径与多部件（parts）路径产生完全相同的结果：一个按角色选中的 `职能标记` 组件实例，正文写入该变体「非标签」的 TEXT。

渲染入口 SHALL 只解析一次角色运行时（`roleBlock` 配置 + 变体表），并把它显式传给下游的章节 / 簇填充函数；parts 路径 SHALL NOT 因未传该运行时而在 `填充章节` 阶段抛 `V2_ROLE_BLOCK_UNAVAILABLE`。

角色变体的来源优先级 SHALL 为：`roleBlock.variantKeys`（库引用，`importComponentByKeyAsync`）优先于 `roleBlock.componentSetId`（同文件组件集，`getNodesInfo` 读变体）。两者同时配置时 SHALL 使用 `variantKeys`，SHALL NOT 读取组件集。

#### Scenario: parts 路径渲染职能实例

- **WHEN** 项目命中模板包（走 parts 路径）且 `roleBlock.variantKeys` 含 `程序` 的已发布 key，md 某簇含 `- @程序：命中后播特效`
- **THEN** 渲染 SHALL 成功，该簇内出现 `职能标记=#程序` 实例，其实例正文 SHALL 为「命中后播特效」，且 `warnings` SHALL NOT 含 `V2_ROLE_BLOCK_UNAVAILABLE`

#### Scenario: 两种来源同时配置

- **WHEN** 配置同时含 `variantKeys` 与 `componentSetId`，且 `componentSetId` 指向不存在的节点
- **THEN** 渲染 SHALL 只用 `variantKeys` 成功完成，SHALL NOT 因组件集不可读而失败或降级

### Requirement: 职能可用性在克隆模板前预检

引擎 SHALL 在解析 IR 之后、克隆或实例化模板之前，按 IR 中实际出现的角色逐个校验可用性（`variants` ∪ `variantKeys`）。缺失角色时 SHALL 直接返回错误，SHALL NOT 在画布上建立任何节点。

错误码 SHALL 为 `V2_ROLE_BLOCK_UNAVAILABLE`，并 SHALL 在 `details.missingRoles` 中列出全部缺失角色。

`roleBlock.componentSetId` 在渲染目标文件内读不到时，错误码 SHALL 为 `V2_ROLE_BLOCK_SET_NOT_IN_TARGET_FILE`，message SHALL 说明「`componentSetId` 只在渲染目标文件内解析，跨库请改用 `roleBlock.variantKeys`」。

#### Scenario: 模板克隆前拒绝

- **WHEN** md 用了 `@美术`，配置只提供 `策划` / `程序` 的变体
- **THEN** 调用 SHALL 返回 `V2_ROLE_BLOCK_UNAVAILABLE` 且 `details.missingRoles = ["美术"]`，页面上 SHALL NOT 出现新增节点

#### Scenario: 跨库组件集

- **WHEN** `roleBlock.componentSetId` 指向模板库文件里的组件集，而渲染目标文件是另一个文件
- **THEN** SHALL 返回 `V2_ROLE_BLOCK_SET_NOT_IN_TARGET_FILE`，message 含改用 `variantKeys` 的指引

### Requirement: 配图槽克隆后几何归一

引擎 SHALL 让每个渲染出来的 `配图` 槽（含由模板槽克隆出的第 2..N 张）满足几何不变式：

- 槽内 `配图占位` RECTANGLE 的**绝对**左上角与槽自身绝对左上角重合（±2px），高度大于 0；
- 槽内 `配图占位文案` TEXT 的高度不小于单行高，绝对位置在 RECTANGLE 下方；
- 槽自身高度等于「矩形高 + 间距 + 文案高」，且所有子节点 bbox 落在槽 bbox 内。

`GROUP` 的子节点坐标写在**组所在父级**的坐标系里（`rect.y = 0` 只代表「贴在父级顶」），因此归一 SHALL 以组原点（`group.x` / `group.y`）为基准平移子节点，SHALL NOT 把子节点坐标归零；`FRAME` 的子节点才是 0 基局部坐标。

归一 SHALL 先摆矩形、再按矩形的当前位置算文案的 `y`（文案原先在矩形上方时，反序会让组 bbox 顶部漂移，间距随之算错）。

间距与子节点布局 SHALL 以**克隆源槽**的相对几何为真值（`gap = hint.y - (rect.y + rect.h)`，缺省 16、上限 64），SHALL NOT 写死常量宽度或高度。

归一 SHALL 在同一次插件调用（exec）内完成坐标与尺寸写入，SHALL NOT 分成多次 RPC 再读回。

缺资产（占位灰板）与已填图两条分支 SHALL 走同一套归一逻辑。

校验 SHALL 用**绝对坐标**比对（`rect.absoluteBoundingBox - group.absoluteBoundingBox`），SHALL NOT 用局部坐标判定「不在组内原点」——`GROUP` 槽的局部坐标天然等于父级偏移，会把视觉正常的槽判成异常。

归一后仍不满足不变式时，渲染 SHALL 继续并在 `warnings` 中给出 `V2_W_FIGURE_SLOT_GEOMETRY`，message SHALL 含簇路径、槽 id 与实测尺寸；SHALL NOT 静默通过。

#### Scenario: 一簇三张配图全部缺资产

- **WHEN** 某簇的 markdown 写了 3 条 `配图：`，`assetMap` 未提供任何对应资产
- **THEN** 3 个 `配图` 槽 SHALL 各自满足：绝对左上角与组重合、`rect.h > 0`、`hint.h ≥ 单行高`、`group.h = rect.h + gap + hint.h`，且无子节点越出组框

#### Scenario: 槽的父级坐标不是原点

- **WHEN** 配图 GROUP 在父级里的坐标是 `(0, 814)`（模板槽落在说明块流里）
- **THEN** 归一后 `rect` SHALL 落在组的绝对左上角，SHALL NOT 被挪到父级顶端，且 SHALL NOT 产生「矩形不在组内原点」告警

#### Scenario: 缺资产与已填图混合

- **WHEN** 某簇第 1 张配图有 `figma_node` 资产、第 2、3 张没有
- **THEN** 第 1 个槽 SHALL 按图片比例填图并删除文案，第 2、3 个槽 SHALL 满足几何不变式且文案可读

#### Scenario: 几何不可归一

- **WHEN** 归一后实测组高与「矩形高 + 间距 + 文案高」不一致（例如槽内缺 `配图占位文案`）
- **THEN** 渲染 SHALL 完成，`warnings` SHALL 含 `V2_W_FIGURE_SLOT_GEOMETRY`，且 message SHALL 指出簇路径与实测数值

### Requirement: 渲染收尾 SHALL 对全部配图槽再归一一次

克隆期归一只覆盖「克隆那一刻」。填图、文案拉宽、外层 auto-layout 拉伸都可能再次把槽弄坏，因此渲染 SHALL 在全部填充完成后，对**文档内每个** `配图` 槽再执行一次几何归一与不变式校验。

- 归一 SHALL 批量完成（每章 / 每文档一次插件调用），SHALL NOT 逐槽单独往返；
- 已贴图但被压到个位数高度的槽，SHALL 恢复到不小于 100px 的最小可读高度；
- 每个不合格的槽 SHALL 产出 `V2_W_FIGURE_SLOT_GEOMETRY`，`context` 指向簇 + 序号；
- 返回体 `summary.figureSlotsNormalized` SHALL 给出「通过校验的槽数」，作为归一代码确实执行的凭据（为 0 而文档包含配图 ⇒ 跑的是旧 build / 旧进程）。

#### Scenario: 贴图后被压扁的槽被救回

- **WHEN** 一簇 3 张配图，第 1 张有资产、填图后矩形被压到 5px
- **THEN** 收尾归一 SHALL 把该矩形恢复到 ≥ 100px，槽通过校验，`figureSlotsNormalized` 计入它

#### Scenario: 旧 build 可被识别

- **WHEN** 文档含 39 个配图槽，但返回体里 `figureSlotsNormalized` 为 0 或字段缺失
- **THEN** 验收方 SHALL 判定所跑引擎不是本次构建，而非几何已修好

### Requirement: 章节高度 SHALL 由内容决定，不被相邻栏目拉长

多部件文档的章节根是横向自动布局。渲染 SHALL 在收尾时把章节根接回 HUG（`counterAxisAlignItems = MIN`、纵向 HUG），并把章节内的自动布局栏目设为 HUG 纵向尺寸，使「高的一栏」不能把「矮的一栏」拉成整章高。

**同步（reconcile）路径 SHALL 在全部写入之后、写文档标记之前，对每个章节执行同一次复位**（不只是检测到超限的章节）。

引擎 SHALL NOT 对自动布局章节执行「两列底边对齐」式的左列拉伸（`resizeNode(left, w, taller)`）——那会把 HUG 改成固定高，且同步会把它当既成事实越滚越大。

#### Scenario: 左列只有一张主图

- **WHEN** 章节右列（说明栏）内容高 10873，左列只有一张 1920×1080 主图
- **THEN** 左列高度 SHALL 等于其内容高（标题 + 主图），SHALL NOT 等于章节高度

#### Scenario: create 后连续同步不放大高度

- **WHEN** 先用 create 渲染一份文档，再对同一份 markdown 连跑两次 reconcile
- **THEN** 四章的左列 SHALL 始终 `layoutSizingVertical = HUG` 且高度等于「标题高 + 主图高」，SHALL NOT 变成 `FIXED` 或等于章节高

#### Scenario: 同步复位的位置

- **WHEN** 同步过程中填充了正文并重摆了标号
- **THEN** 章节复位 SHALL 发生在这些写入之后，复位后章节高度 SHALL 等于内容高

### Requirement: 渲染返回体 SHALL 给出配图槽的健康计数

`summary` SHALL 含：

- `figureSlotsNormalized`：通过几何校验的槽数；
- `figureSlotsUnhealthy`：归一后仍不合格（含找不到 `配图占位`）的槽数，验收时应为 0；
- `chaptersNormalized`：收尾复位的章节数。

三者 SHALL 从 parts 渲染结果透传到 create 路径的返回体，SHALL NOT 因为白名单重组成新对象而丢失。

#### Scenario: 验收一眼判断

- **WHEN** 文档有 39 个配图槽且几何全部合格
- **THEN** 返回体 SHALL 给出 `figureSlotsNormalized: 39`、`figureSlotsUnhealthy: 0`、`chaptersNormalized: 4`

