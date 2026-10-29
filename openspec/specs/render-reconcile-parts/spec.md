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

