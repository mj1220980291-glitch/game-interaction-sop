# render-reconcile-parts Specification

## Purpose
TBD - created by archiving change parts-doc-reconcile-sync. Update Purpose after archive.
## Requirements
### Requirement: 多部件文档渲染后携带标记

`render_v2_markdown_to_figma` 走多部件渲染（模板包存在）时，SHALL 在渲染成功后给文档打 stamp；SHALL NOT 因为"部件文档暂不支持同步"而跳过。

`doc` 标记 SHALL 额外记录 `parts.structure = 'parts'` 与 `parts.packHash`；`packHash` SHALL 由四个部件的 component key 与模板包能力组合算出，同一模板包重编后 key 或能力变化时 SHALL 不同。

章节、簇、条目、槽位的标记种类与字段 SHALL 与「引擎节点携带隐藏标记」（`render-reconcile`）一致，差别只在挂载位置：

| kind | 挂在 |
|---|---|
| `section` | `界面说明N` 根帧 |
| `cluster` | 簇实例根帧 |
| `item` | `正文/规则` TEXT、`配图` RECTANGLE |
| `slot` | 说明栏容器（`sections`）、`#Title_Main` 所在标题块（`section.name`）、主图占位（`main`）、气泡（`bubbleFrame`）、标号（`bubble`）、顶部/结尾的模板残留（`template`） |

#### Scenario: parts 渲染产物可被同步

- **WHEN** 用模板包渲染一份文档
- **THEN** 返回 `ok:true`，根帧带 `doc` 标记且 `parts.structure = 'parts'`；随后以该根帧为 `target.rootId` 的同步 SHALL NOT 返回 `V2_NOT_STAMPED`

#### Scenario: 部件重编后指纹变化

- **WHEN** 模板包重编，簇部件的 component key 变化，用旧文档发起同步
- **THEN** 返回 `ok:false`，错误码 `V2_PACK_MISMATCH`，画布不变

### Requirement: 角色按结构档案解析

同步 SHALL 依据 `doc` 标记的结构选择结构档案：`parts` 用统一槽位名（`左列` / `舞台` / `气泡` / `说明栏` / `配图` / `正文/规则` / `#Title_Main`），缺省用 `1:14` 图层名。

结构档案 SHALL 只描述命名与层级差异；序列对齐、手改判定、冲突分级、tombstone、锁与幂等的规则 SHALL 与 `render-reconcile` 完全一致。

#### Scenario: 同一份 markdown 同步两种结构的文档

- **WHEN** 一份 legacy 文档与一份 parts 文档由同一份 markdown 渲染而来，两份都用原始 markdown 再同步一次
- **THEN** 两者 SHALL 都返回 `changes` 为空

#### Scenario: 结构名不得串用

- **WHEN** parts 文档同步时读取到名为 `说明块01` 的外来节点
- **THEN** 该节点 SHALL 按外来节点处理，SHALL NOT 被当成簇容器

### Requirement: parts 文档的条目同步

`正文/规则` TEXT 与 `配图` RECTANGLE SHALL 按条目参与对齐与写入；配图条目 SHALL 支持单层矩形（没有外层 GROUP 与占位矩形两层结构）。

配图写入后 SHALL 清掉占位虚线描边，并记录新的 `imageHash`。

#### Scenario: 改一条正文

- **WHEN** markdown 把某簇第 2 条规则改写，设计师未动过它
- **THEN** 该 `正文/规则` 的文字被更新，`changes` 含 `{path, action:'update'}`

#### Scenario: 给裸配图槽换图

- **WHEN** markdown 中该配图的描述变了，`assetMap` 指向新的源节点
- **THEN** `配图` RECTANGLE 的填充被替换，描边为空，标记中的 `imageHash` 更新

### Requirement: 新增界面与簇由 parts 管线供给

同步需要新节点时，SHALL 用 parts 管线（同一模板包、同一页面）渲染一份临时文档，再从中搬出所需节点；SHALL NOT 克隆目标文件里的 `1:14`，SHALL NOT 复制目标文档里已有的簇作为原型。

临时文档 SHALL 在同步结束（成功或失败）后删除；中断遗留的临时文档 SHALL 在下次同步开始时清除。

#### Scenario: 新增一个簇

- **WHEN** markdown 在已有界面末尾新增一个簇
- **THEN** 新簇 SHALL 来自临时 parts 文档，插入说明栏末尾，且临时文档 SHALL 不存在于画布上

### Requirement: 同步后重算 parts 几何

同步改动章节内的簇集合后，引擎 SHALL 重算受影响章节的：章节高度、左列高度、标号数量与网格坐标。

未受影响的章节 SHALL NOT 被重排；设计师手工摆放的标号坐标 SHALL NOT 被覆盖。

#### Scenario: 新增簇后标号重排

- **WHEN** 某界面从 2 个簇变成 3 个簇
- **THEN** 该章节 SHALL 出现 3 个标号，坐标按模板网格分布，章节与左列高度 SHALL 与内容匹配

#### Scenario: 设计师拖过标号

- **WHEN** 设计师移动了 ② 号标号，markdown 在别的界面改动了一条规则
- **THEN** ② 号标号的坐标 SHALL 不变

### Requirement: 章节外框下的章节发现

多部件文档的章节 SHALL 在 root 子树里按 stamp（`kind: 'section'`）收集，SHALL NOT 依赖「所有章节是同一个容器的直属子级」这一假设。

渲染 SHALL 给每章外层的结构节点（`geometry.sectionShell` 产生的「章节外框」及同层链）写入 `{ kind: 'slot', role: 'template' }` 标记。

同步 SHALL 把「子树里含 stamped 章节」的容器当作结构层跳过，SHALL NOT 列入 `foreign`。

#### Scenario: 壳内章节可识别

- **WHEN** 4 个章节各自被「章节外框」包住，md 未改动
- **THEN** 同步 SHALL 识别全部 4 章，`changes` 为空，`preserved` 中 SHALL NOT 出现 `designer-deleted`

#### Scenario: 结构层不算 foreign

- **WHEN** 文档每章外面套了一层「章节外框」
- **THEN** 这些外框 SHALL NOT 出现在 `preserved` 的 `foreign` 列表中

#### Scenario: 老产物壳没打标

- **WHEN** 章节外框没有 stamp（本变更之前渲染的文档）
- **THEN** 章节发现 SHALL 仍然成立，同步 SHALL NOT 误报 `designer-deleted`

### Requirement: 同步模式下按标号锚点重摆

多部件文档走同步（带 `rootId`）且传入 `badgeAnchors` 时，同步 SHALL 按锚点重摆标号，并遵守下列约束：

- 即使 markdown 没有任何改动（`changes` 为空），同步 SHALL 仍按锚点重摆标号，SHALL NOT 因「无 md 差异」提前返回
- 已存在的标号 SHALL 在该簇给了锚点时移动到锚点位置；该簇没给锚点 SHALL 保持画布原坐标（不覆盖设计师手拖）
- 重摆 SHALL NOT 改变文字、配图与节点顺序；`changes` 与 `preserved` 的报告语义仍只描述 markdown 差异
- 只改动部分簇的锚点时，SHALL NOT 为未给锚点的簇逐个报 `V2_W_BADGE_ANCHOR_MISSING`

#### Scenario: 只改锚点也能生效

- **WHEN** 文档已渲染，markdown 一字不改，同步时只传新的 `badgeAnchors`
- **THEN** 标号 SHALL 移动到锚点位置，`changes` 仍为空，文字与配图不变

#### Scenario: 已存在标号按锚点移动

- **WHEN** 某章已有 2 个标号，同步传 `{"01/1": {x:0.25, y:0.4}}`
- **THEN** 标号 1 SHALL 移动到锚点位置，且 SHALL NOT 新克隆出重复标号

#### Scenario: 没给锚点的标号不动

- **WHEN** 同步只给第 1 个簇锚点，第 2 个簇的标号在画布上被设计师拖过
- **THEN** 标号 2 SHALL 保持设计师拖过的坐标，且 SHALL NOT 报缺锚告警

### Requirement: 章节主图落图与统计口径

多部件渲染 SHALL 按「主图槽是否找到 + 资产是否实际落图」统计主图：调用了落图 API（`setImageFill` / `rasterizeNodeToImageFill` / `placeInstance`）的章节计入 `summary.imagesPlaced`，其余计入 `summary.placeholdersUsed`。

主图槽（`CHAPTER_SLOTS.mainImage`）在章节部件里找不到、且该章提供了主图资产时，渲染 SHALL 报 `V2_W_MAIN_SLOT_MISSING`（含章节名），SHALL NOT 只依赖打标阶段的 `V2_W_STAMP_LAYOUT_MISMATCH`。

`imagesPlaced + placeholdersUsed` SHALL 等于章节数。

#### Scenario: 主图实例落图计数

- **WHEN** 3 章文档，每章 `assetMap["NN"]` 均为 `figma_instance`
- **THEN** `summary.imagesPlaced = 3`、`summary.placeholdersUsed = 0`，且 SHALL NOT 报 `V2_W_MAIN_SLOT_MISSING`

#### Scenario: 主图槽缺失

- **WHEN** 某章节部件里没有名为 `主图` 的槽位，但该章传了主图资产
- **THEN** 该章计入 `placeholdersUsed`，并报一条 `V2_W_MAIN_SLOT_MISSING`（`context` 含章节名）

### Requirement: parts 路径的职能条目

多部件渲染 SHALL 复用渲染入口解析好的角色运行时填充 `@职能` 条目，行为与 legacy 路径一致：一个 bullet 一个角色，产出一个组件实例，正文写入实例内非标签 TEXT。

`roleAnnotation` 能力不为 `component-variant` 时，渲染 SHALL 继续删除簇内职能载体并按既有规则告警，SHALL NOT 因本次改动新增实例。

#### Scenario: parts 路径组件变体

- **WHEN** 模板包 `capabilities.roleAnnotation = component-variant`，md 某簇含 `- @策划：阈值见配表`
- **THEN** 簇内 SHALL 出现一个 `职能标记=#策划` 实例，正文为「阈值见配表」

#### Scenario: 非组件变体不受影响

- **WHEN** `roleAnnotation = inline-suffix`，md 含 `@策划`
- **THEN** 渲染 SHALL 仍按句尾写法处理，SHALL NOT 创建任何 `职能标记` 实例

### Requirement: 同步不重复插入职能条目

多部件文档走同步时，`@职能` 条目 SHALL NOT 被当作普通正文条目参与文本对齐：其载体是组件实例，打标阶段不按条目记录。

因此幂等同步（md 与画布一致）SHALL 返回 `changes: []`，SHALL NOT 为每个 `@职能` bullet 生成 `insert`。

该边界 SHALL 写入文档：同步模式不支持把普通正文改写成 `@职能` 实例，需要时整篇重渲。

#### Scenario: 幂等同步

- **WHEN** 文档含 2 个 `@职能` 实例，md 一字不改再同步
- **THEN** `changes` SHALL NOT 含任何 `@职能` 文本的 `insert`，这些实例 SHALL NOT 出现在 `preserved` 的 `foreign` 里

#### Scenario: 新增职能条目需重渲

- **WHEN** md 新增一条 `- @程序：…` 并对旧文档同步
- **THEN** 同步 SHALL NOT 自行插入组件实例（已知限制），报告需提示重渲或手工替换

### Requirement: 条目序号与打标清单同源

parts 同步 SHALL 用与打标条目清单同一份口径生成条目序号（`ref.i`）：`正文/规则` 与 `配图` 计入条目，`####` 子标题与 `@职能` 条目 SHALL NOT 计入。

用于解析临时文档节点的序号 SHALL 与计划阶段的序号一致；不一致时 SHALL 报可读错误，SHALL NOT 抛出裸 runtime error（如 `scratch node not found`）。

#### Scenario: 带两个子分组、十条条目的簇同步

- **WHEN** 某簇 markdown 为「`#### 基础行为` + 4 条规则 + `#### 控件状态` + 3 条状态 + 3 张配图」，且已在画布上渲染过
- **THEN** 同步 SHALL 成功完成，`errors` 为空，SHALL NOT 报 `V2_RECONCILE_RUNTIME_ERROR`

#### Scenario: 序号越界时报可读错误

- **WHEN** 计划阶段的条目序号在临时文档的条目清单里找不到对应节点
- **THEN** 同步 SHALL 返回错误码 `V2_RECONCILE_ITEM_OUT_OF_RANGE`，message SHALL 含 `s` / `c` / `i` 与两侧条目数量

#### Scenario: 幂等同步仍为零改动

- **WHEN** markdown 未变，对已渲染的带 `####` 分组的 parts 文档执行同步
- **THEN** `changes` SHALL 为空，`preserved` SHALL 为空

