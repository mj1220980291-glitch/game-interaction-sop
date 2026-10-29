# template-compile Specification

## Purpose
TBD - created by archiving change template-compile-to-library. Update Purpose after archive.
## Requirements
### Requirement: 编译输入

编译 SHALL 接受四项输入：项目源模板（`fileKey` + 模板根 `nodeId`）、库文件（`fileKey` + 可选 `pageId`）、项目名、以及 0~3 份文档样本 `nodeId`。

`samples` 的用途 SHALL 限于核对母版重复度，SHALL NOT 用于内容级比对。

#### Scenario: 干跑不写画布
- **WHEN** 调用 `figma_compile_template` 且 `write` 为 `false` 或未提供
- **THEN** 工具 SHALL 只返回计划与缺口，SHALL NOT 调用任何写入类后端方法

#### Scenario: 样本可缺省
- **WHEN** 未提供 `samples`
- **THEN** 编译 SHALL 仍能进行，并在报告中标注母版重复度「未核对」

### Requirement: 项目源模板只读

编译 SHALL NOT 对项目源模板文件执行任何写入：SHALL NOT 改名、SHALL NOT 打 plugin data、SHALL NOT 新建 / 删除 / 移动节点、SHALL NOT 创建组件。

编译前后，源模板文件的结构指纹 SHALL 保持一致。

#### Scenario: 零写入源文件
- **WHEN** 对任意模板执行编译（含 `write: true`）
- **THEN** 源模板文件的结构指纹 SHALL 与编译前一致，且 SHALL 记录到零次源文件写入方法调用

#### Scenario: 源模板已漂移
- **WHEN** 当前源模板指纹与探针阶段记录的 `source.fingerprint` 不一致
- **THEN** 编译 SHALL 拒绝，返回 `V2_COMPILE_SOURCE_DRIFT`，并提示重跑探针

### Requirement: 四部件产出

编译 SHALL 在库文件中产出 4 个可独立导入的部件组件：`top`、`chapter`、`cluster`、`footer`。

`footer` SHALL 为可选：模板没有结尾区时 SHALL 不产出，且 SHALL NOT 用空组件占位。

组件命名 SHALL 为 `<项目> / 顶部|章节|簇|结尾`。

#### Scenario: 无结尾区
- **WHEN** 源模板没有结尾区
- **THEN** 编译 SHALL 产出 3 个部件，且回填的 `components.footer` SHALL 保持 `null`，SHALL NOT 编造 key

#### Scenario: 部件必须自带样式
- **WHEN** 检查任一产出部件
- **THEN** 该部件的颜色、间距、标号形状 SHALL 来自源模板克隆继承，SHALL NOT 从配置读取；字体按「字体归一化」要求处理

### Requirement: 字体归一化

编译 SHALL 把 4 个部件内**全部**文本的字体族改写为 `Noto Sans SC`。

字号、行距、字间距、字色、对齐方式 SHALL NOT 被改动。

原字重在 `Noto Sans SC` 中不存在时，SHALL 映射到其可用字重（本环境实测只有 `Regular` / `Medium` / `Bold` 三档）；无法判定时 SHALL 退 `Regular` 并在 `gaps` 记一条。

#### Scenario: 项目字体不参与产物
- **WHEN** 源模板某文本使用 `U5Font` 且本机未安装该字体
- **THEN** 编译 SHALL 正常完成，产出该文本的字体族 SHALL 为 `Noto Sans SC`

#### Scenario: 字重就近映射
- **WHEN** 源文本字重名在 `Noto Sans SC` 中不存在
- **THEN** 产出 SHALL 使用最接近的可用字重，且 `gaps` SHALL 含该映射说明

### Requirement: 标号容器统一

章节部件 SHALL 预置一个标号容器，命名 `气泡`，形态（尺寸、圆角、填充、描边、内部结构）SHALL 与官方 `1:14` 的标号容器一致，内容 SHALL 为空。

源模板的标号为散落形态（`badgeSlot=manual`）时，编译 SHALL 补齐该容器，SHALL NOT 因源模板无容器而跳过。

标号的具体摆放位置 SHALL NOT 在本变更内计算或写入。

#### Scenario: manual 模板补齐容器
- **WHEN** 源模板 `badgeSlot` 实测为 `manual`
- **THEN** 产出章节部件 SHALL 含空标号容器 `气泡`，且产物探针 SHALL 把 `badgeSlot` 判为 `container`

#### Scenario: 容器差异被报告
- **WHEN** 源模板为 `manual`、产物为 `container`
- **THEN** `gaps` SHALL 含一条说明该变化与「摆位留后续」的条目

### Requirement: 嵌套部件收编

部件内部的每个 `INSTANCE`（职能图例、编号三角等）SHALL 在库文件中被收编为本库自有组件：

1. `detachInstance` 取得可改造图层
2. `createComponentFromNode` 转为本库 `COMPONENT`
3. 原组件若是组件集，SHALL 用 `combineAsVariants` 重建组件集，并逐个还原变体名
4. 父部件中该位置 SHALL 替换为**本库**该组件的实例

发布顺序 SHALL 为先零件、后部件。收编后 SHALL NOT 保留任何指向外部文件的组件引用。

#### Scenario: 源组件被删不影响产物
- **WHEN** 源模板中「标签」组件集被删除后，对已发布部件做 `importComponentByKeyAsync`
- **THEN** 导入 SHALL 成功，且部件内图例 SHALL 正常显示，SHALL NOT 出现占位

#### Scenario: 变体集必须重建
- **WHEN** 收编的源是带变体的组件集（如 `职能=策划/美术/程序`）
- **THEN** 产出 SHALL 是可切换变体的组件集，且变体名与原变体名逐项一致；不一致时编译 SHALL 拒绝

#### Scenario: 编号仍是组件
- **WHEN** 源模板的编号载体是 `num` 三角实例
- **THEN** 收编后编号 SHALL 是本库组件（不是静态图形），且其内文本 SHALL 可写

### Requirement: 锚点

编译 SHALL 在部件内部节点上打锚点，标识 `part` 与 `role`。锚点优先级 SHALL 为：`sharedPluginData('gisop', …)` → 约定图层名 → 不可见零高度 FRAME。

使用降级方案（名字 / 不可见 FRAME）的锚点 SHALL 写入 `template.json` 的 `anchors`；使用缺省命名的锚点 SHALL NOT 写入。

锚点 SHALL 只写在库文件中的部件上。

#### Scenario: plugin data 可用时不写配置
- **WHEN** 某槽位可用 plugin data 锚定
- **THEN** `template.json` 的 `anchors` SHALL 不含该槽位

#### Scenario: 降级锚点可被读取
- **WHEN** 某槽位只能用不可见零高度 FRAME 锚定
- **THEN** `anchors` SHALL 含该槽位且 `kind: "invisible-frame"`，后续渲染 SHALL 能据此定位

### Requirement: 能力基准是归一化模板

编译完成后 SHALL 对 4 个产出部件重新执行 `figma_probe_template`，`template.json` 的 `capabilities` SHALL 取该次产物探针结果（`source: probed`）。

产物结果与源模板探针结果的逐项差异 SHALL 写入编译报告的 `gaps`，SHALL NOT 静默吞掉。

#### Scenario: 结构改变导致能力变化
- **WHEN** 源模板 `numberBadge` 为 `instance`，收编后产物的编号载体结构使探针判定为 `text`
- **THEN** 写入的 `capabilities.numberBadge` SHALL 为 `text`，且 `gaps` SHALL 含一条该变化的说明

#### Scenario: 无差异不写噪声
- **WHEN** 产物探针结果与源模板探针结果逐项一致
- **THEN** `gaps` SHALL 不含能力差异条目

### Requirement: 发布与 key 回填

编译 SHALL 分为两段：`compile`（产出组件与草案，`components` 全 `null`）与 `verify`（读已发布组件的 key 并回填 `template.json`）。

发布动作 SHALL 由人工在 Figma 完成；工具 SHALL NOT 声称能自动发布。

`verify` 在任一部件未发布时 SHALL 返回 `V2_COMPILE_NOT_PUBLISHED` 并指明缺哪个部件，SHALL NOT 写入部分 key。

回填 SHALL 写 `<项目根>/.interaction-sop/template.json`，且结果 SHALL 能被 `parseTemplatePack` 解析通过。

`verify` SHALL 对每个 key 执行一次真实 `importComponentByKeyAsync`，且 SHALL 在**非库文件**中执行；仅读到非空 key SHALL NOT 被视为已发布。

部件与收编零件的名字 SHALL NOT 以 `_` 或 `.` 开头（Figma 会把这类组件归入「不发布」）。

`verify` 的单次调用超时预算 SHALL ≥ 30s（首次跨文件 import 实测约 7s）。

#### Scenario: 未发布就回填
- **WHEN** `verify` 时 `chapter` 组件尚未发布
- **THEN** 工具 SHALL 返回 `V2_COMPILE_NOT_PUBLISHED`，且 SHALL NOT 修改 `template.json`

#### Scenario: 有 key 但未发布
- **WHEN** 组件有本地 key 但文件未发布库，`verify` 在另一文件中 import 该 key
- **THEN** import SHALL 失败，`verify` SHALL 报 `V2_COMPILE_NOT_PUBLISHED`，SHALL NOT 因「key 非空」判定为已发布

#### Scenario: 命名触发不发布
- **WHEN** 某部件名为 `_顶部`
- **THEN** 编译 SHALL 拒绝并说明命名红线，SHALL NOT 带着该名字去发布

#### Scenario: 回填后可解析
- **WHEN** 4 个部件均已发布，`verify` 成功
- **THEN** 写出的 `template.json` SHALL 含 4 个非空 key，且 `parseTemplatePack` SHALL 返回 `ok: true`

### Requirement: key 稳定性与重编

重编同一项目 SHALL 新增组件（名字带版本后缀）并更新配置，SHALL NOT 原地修改或删除已发布的旧组件。

旧组件 SHALL 被标记为废弃（`gisop.deprecated = true`），但 SHALL 保持发布状态。

#### Scenario: 重编不破坏已交付文档
- **WHEN** 对同一项目执行第二次编译
- **THEN** 第一次产出的 4 个组件 SHALL 仍存在且仍可用其 key 导入

### Requirement: 拒绝而非扩张能力

当模板差异无法用现有 8 项能力表达时，编译 SHALL 中止并返回 `V2_COMPILE_CAPABILITY_UNEXPRESSIBLE`，列出表达不了的差异。

编译 SHALL NOT 临时新增能力枚举或扩展取值。

#### Scenario: 出现第 9 种差异
- **WHEN** 模板的章节区同时存在左右两列说明
- **THEN** 编译 SHALL 拒绝并说明「`column` 只支持 `right` / `bottom`」，SHALL NOT 自造取值

### Requirement: 前置校验

编译 SHALL 在写入画布前完成下列校验，任一失败即拒绝且 SHALL NOT 留下中间节点：

| 校验 | 失败码 |
|---|---|
| 库文件可写、可创建组件 | `V2_COMPILE_LIBRARY_UNWRITABLE` |
| `Noto Sans SC` 各用到的字重可加载 | `V2_COMPILE_FONT_UNAVAILABLE` |
| 源模板指纹与探针记录一致 | `V2_COMPILE_SOURCE_DRIFT` |
| 差异可被 8 项能力表达 | `V2_COMPILE_CAPABILITY_UNEXPRESSIBLE` |
| 每个簇原稿都能切出 ≥1 个完整 run | `V2_COMPILE_RUN_CONTRACT_BROKEN` |

字体校验失败时 SHALL 列出缺失的 `Noto Sans SC` 字重。

#### Scenario: 归一化字体不可用
- **WHEN** 本机无法加载 `Noto Sans SC` 的某个字重
- **THEN** 编译 SHALL 拒绝并列出该字重，SHALL NOT 产出字体混杂的组件

#### Scenario: 项目字体缺失不影响编译
- **WHEN** 部件中某文本使用 `U5Font` 且本机未安装
- **THEN** 编译 SHALL 正常完成（字体已归一化为 `Noto Sans SC`），SHALL NOT 因此拒绝

#### Scenario: 校验失败不留痕
- **WHEN** 任一前置校验失败
- **THEN** 库文件中 SHALL 不新增任何节点

#### Scenario: 原稿簇切不出 run
- **WHEN** 某簇原稿既无 `#Title` 也无 `正文/规则`
- **THEN** 编译 SHALL 返回 `V2_COMPILE_RUN_CONTRACT_BROKEN`，库文件 SHALL 不新增任何节点

### Requirement: 编译报告

编译 SHALL 返回机器可读报告，至少含：`phase`、`created`（每个部件的组件 id / key / 名字）、`adopted`（每个收编零件的来源与目标 id）、`anchors`（槽位 → 锚点方式）、`capabilities`（产物探针结果 + 与源模板的差异）、`gaps`、`checks`（前置校验结果）、`templateJson`（可落盘的草案或最终内容）。

报告 SHALL 同时提供人读版，逐条列出产出的组件、收编清单、锚点、能力差异与缺口。

瘦身后的 run 契约校验失败时，报告 SHALL 列出已创建但未回填 key 的组件 id，供人工清理。

#### Scenario: 干跑报告
- **WHEN** `write: false`
- **THEN** 报告 SHALL 含将创建 / 将收编 / 将打锚点的完整清单，且 `created` 中各 id SHALL 为 `null`

#### Scenario: 瘦身后失败
- **WHEN** 瘦身后某簇的 run 契约不成立
- **THEN** 报告 SHALL 包含 `V2_COMPILE_RUN_CONTRACT_BROKEN` 对应的缺口条目，且 SHALL 列出已建组件 id

### Requirement: 簇部件按 run 瘦身

簇部件瘦身 SHALL 按 `slot-run-contract` 定义的 run 切分执行，SHALL NOT 按节点名做全局裁剪。

规则：

- SHALL 保留第一个完整 run 的全部成员，其余 run 的每个根节点 SHALL 整批删除。
- 保留 run 内的条目数量 SHALL 与模板一致（`正文/规则` 有几条留几条，`#Title` 恰好 1 个）。
- 簇级表头 SHALL 原样保留，不参与裁剪。
- `正文/规则` 继承的旧文案 SHALL 换成 `正文占位`。

#### Scenario: 两段 run 只留一段

- **WHEN** 原稿簇带 2 段 run，每段含 1 个 `#Title`、1 个职能帧、2 条正文、1 个配图 GROUP
- **THEN** 产物 SHALL 只含 1 段 run、2 条 `正文/规则`、1 个职能帧、1 个配图 GROUP，且 SHALL NOT 残留第二个 `#Title` 或第二个职能帧

#### Scenario: 不再按名字裁到一条

- **WHEN** 原稿保留 run 内有 2 条可见 `正文/规则`
- **THEN** 产物 SHALL 保留 2 条，SHALL NOT 只留 1 条

#### Scenario: 多余职能帧随 run 删除

- **WHEN** 原稿第二个 run 的职能帧从未被归一化命名
- **THEN** 该帧 SHALL 随所属 run 一起被删除，SHALL NOT 作为孤儿节点留在产物里

### Requirement: 编译期配图槽 GROUP 化

编译 SHALL 把保留下来的配图槽统一为 GROUP 形态：`配图` GROUP 内含 `配图占位` 矩形与 `配图占位文案` TEXT。

- 原槽已是 GROUP 时 SHALL 原地清洗（清除图片填充、补齐缺失的占位文案）。
- 原槽是裸矩形或实例时 SHALL 包壳（`groupNodes`）并补齐两个子节点（`createText`）。
- 占位文案字体 SHALL 使用 `Noto Sans SC`；字体不可用时 SHALL 按 `V2_COMPILE_FONT_UNAVAILABLE` 失败。

#### Scenario: 清洗已有 GROUP

- **WHEN** 原稿配图 GROUP 内矩形带 IMAGE 填充
- **THEN** 产物 SHALL 清除该填充，且经纬与占位文案节点保留

#### Scenario: 包壳后可直接填图

- **WHEN** 原稿配图槽是裸矩形，编译后渲染写入资产
- **THEN** 渲染 SHALL 能找到 `配图占位` 矩形并填充，SHALL NOT 报「配图 GROUP 无 配图占位 矩形」

