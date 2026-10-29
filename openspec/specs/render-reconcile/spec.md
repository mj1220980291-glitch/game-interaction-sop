# render-reconcile Specification

## Purpose
对引擎渲染过的文档做原位同步：给引擎节点打隐藏标记，按序列对齐 markdown 与画布，只写入有变化的部分；设计师的手改、手贴节点和删除都会保留，冲突交给人裁决。
## Requirements
### Requirement: 引擎节点携带隐藏标记

引擎 SHALL 通过 `setSharedPluginData('gisop', 'stamp', <JSON>)` 给它生成或接管的节点打标记。标记的种类和最少字段如下：

| kind | 挂在哪个节点上 | 最少字段 |
|---|---|---|
| `doc` | 文档 root | `v`、`header`（各槽位上次写入的值）、`overview`、`sections`（`{id, text}` 有序清单） |
| `section` | `界面说明N` | `sid`、`name`、`clusters`（`{id, text}` 有序清单） |
| `cluster` | `说明块NN` | `cid`、`title`、`roles`、`items`（`{id, t, text}` 有序清单） |
| `item` | `正文/规则` TEXT、`配图` GROUP、`#Title` TEXT | `iid`、`t`、`text`；配图另有 `asset`、`imageHash` |
| `slot` | 头部与总览 TEXT、`#Name`、主图、气泡（带 `cid`）、角色框、模板残留（`template`） | `role` |

`sid`、`cid`、`iid` 一经分配，在后续所有同步中 SHALL NOT 改变。没有标记的节点 SHALL 被视为外来节点。

带 `item`/`cluster`/`section` 标记、但没有任何容器清单列出它的节点（中断残留），SHALL 在它所在的容器中按引擎节点接管，并且该容器的清单 SHALL 在本次同步中重写以包含它；被另一个容器清单列出的，SHALL 按外来节点处理。

#### Scenario: 中断残留的节点被接管
- **WHEN** 说明块里有一个带条目标记、但不在任何清单中的节点，其文字与 markdown 中新增的一条相同
- **THEN** 同步 SHALL NOT 再插入这一条，`changes` 为空，且该说明块的清单 SHALL 包含这个节点的 `iid`；设计师之后删掉它，再次同步 SHALL NOT 重建

#### Scenario: 标记对设计师不可见
- **WHEN** 引擎完成渲染或同步
- **THEN** 节点的 `name`、`characters`、视觉属性 SHALL 与不打标记时一致

#### Scenario: 同一 iid 出现多次
- **WHEN** 读取时发现两个节点携带相同的 `iid`（设计师复制了节点）
- **THEN** 引擎 SHALL 只把文档顺序中的第一个视为该条目，其余按外来节点处理，并输出 warning `V2_W_DUPLICATE_STAMP`

### Requirement: 同步模式入口

调用方传入 `target.rootId` 时，引擎 SHALL 进入同步模式：不克隆模板，而是把 markdown 与该 root 下的现有内容对齐后增量写入。返回值 SHALL 带 `mode: 'reconcile'`。

引擎 SHALL 按 `doc` 标记的结构选择结构档案：带 `parts` 标记的走多部件结构，不带 `structure`/`parts` 的按 `1:14` 结构处理。结构选择 SHALL NOT 改变对齐、手改判定、冲突、锁、幂等的规则。

`rootId` 节点上没有 `doc` 标记时，引擎 SHALL 返回 `V2_NOT_STAMPED`，并且 SHALL NOT 写入画布（多部件文档同样如此，不实现无标记接管）。

带 `parts` 标记、但其 `packHash` 与当前模板包不一致时，引擎 SHALL 返回 `V2_PACK_MISMATCH`，并且 SHALL NOT 写入画布。

同步模式下，引擎 SHALL NOT 删除 root 节点，无论成功还是失败。

#### Scenario: 对未标记文档发起同步

- **WHEN** `target.rootId` 指向一份本 change 之前渲染出来的文档（含多部件文档）
- **THEN** 返回 `ok:false`，错误码 `V2_NOT_STAMPED`，画布不变

#### Scenario: 对多部件文档发起同步

- **WHEN** `target.rootId` 指向一份由多部件渲染、带 `parts` 标记的文档
- **THEN** 引擎 SHALL NOT 返回 `V2_NOT_STAMPED`，并 SHALL 按多部件结构档案完成对齐与写入

#### Scenario: 无变化的重复同步

- **WHEN** 用同一份 markdown 对刚渲染出来的文档发起同步
- **THEN** `changes` SHALL 为空，且 SHALL NOT 产生任何画布写入

### Requirement: 按序列对齐匹配节点

引擎 SHALL 在界面、簇、条目三个层级分别做序列对齐：以上次写入的值（界面名、簇标题、规范化后的条目文字）为旧序列，以 markdown 中的对应值为新序列，求 LCS。LCS 之外，值完全相同的一删一增 SHALL 认作"移动"；其余同一段内相邻的"删除"和"新增" SHALL 按位置配对为"修改"，剩下的为纯删除或纯新增。

配图条目和规则条目 SHALL NOT 相互配对。`####` 小标题 SHALL 作为条目参与它所在簇的对齐。

#### Scenario: 中间插入一条
- **WHEN** 旧条目为 `[A, B, C]`，markdown 改为 `[A, X, B, C]`
- **THEN** 计划 SHALL 只包含"在 A 之后插入 X"，B、C 的节点保持不变

#### Scenario: 改写一条
- **WHEN** 旧条目为 `[A, B, C]`，markdown 改为 `[A, B', C]`
- **THEN** 计划 SHALL 把 B 的节点标为"修改为 B'"，不做删除加插入

#### Scenario: 界面改名
- **WHEN** 第 2 个界面在 markdown 中改了名称，前后界面都没变
- **THEN** 该界面 SHALL 配对为"修改"，只更新 `#Name`，界面内部的内容按条目规则继续同步

### Requirement: 手改判定与保留

对每个匹配到的条目，记节点当前值为 F、标记中上次写入的值为 W、markdown 新值为 M。引擎 SHALL 按下表处理：

| F 与 W | M 与 W | 处理 |
|---|---|---|
| 相等 | 相等 | 不动 |
| 相等 | 不等 | 写入 M |
| 不等 | 相等 | 不动，记入 `preserved` |
| 不等 | 不等，且 F == M | 不写画布，把 W 更新为 M |
| 不等 | 不等，且 F != M | 不动，记入 `conflicts`（kind `text`） |

文字条目的 F 为节点的 `characters`。配图条目的 F 为当前 fill 的 imageHash，W 为标记里记录的 asset 与 imageHash，kind 为 `figure`。

#### Scenario: 设计师改过、md 没改
- **WHEN** 设计师把某条规则的文字改成 F，markdown 中这条仍是 W
- **THEN** 同步后节点文字 SHALL 仍为 F，且该条出现在 `preserved` 中

#### Scenario: 双方都改了
- **WHEN** 设计师改成 F，markdown 改成 M，且 F ≠ M
- **THEN** 节点文字 SHALL 仍为 F，`conflicts` SHALL 包含 `{ path, kind:'text', figma:F, markdown:M, nodeId }`

#### Scenario: 设计师换了配图
- **WHEN** 设计师替换了某个引擎配图的图片，assetMap 给这张配图指定了新的源
- **THEN** 引擎 SHALL NOT 覆盖该图片，并记入 kind 为 `figure` 的冲突

### Requirement: 设计师删除的节点不重建

清单中存在、画布上找不到对应节点的条目 SHALL 视为设计师有意删除。引擎 SHALL NOT 重建该节点，并 SHALL 在清单中保留一条 tombstone，使后续同步继续保持删除状态。

如果 markdown 修改了被删除的条目，引擎 SHALL 记入 kind 为 `deleted-but-changed` 的冲突。

#### Scenario: 删了之后再同步
- **WHEN** 设计师删掉了一条引擎生成的规则，markdown 中这条没变
- **THEN** 同步后该规则 SHALL 仍不存在，且 `changes` 中没有它

### Requirement: 外来节点保持原样并随前一个引擎节点定位

没有标记的节点 SHALL NOT 被读取内容、写入、移动或删除。

在 auto-layout 容器中往引擎节点 X 之后插入新节点时，插入位置 SHALL 位于紧跟 X 的连续外来节点之后。

`rec组` 中的外来节点和已有气泡的坐标 SHALL NOT 被改变。

外来节点 SHALL 列入 `preserved`，并附上所在容器的路径。

#### Scenario: 手贴图后插入新规则
- **WHEN** 说明块内的顺序为 `[A, 手贴图, B]`，markdown 改为 `[A, X, B]`
- **THEN** 同步后的顺序 SHALL 为 `[A, 手贴图, X, B]`

#### Scenario: 手贴图前面的规则被删
- **WHEN** 说明块内的顺序为 `[A, B, 手贴图, C]`，markdown 删除了 B，且 B 没被手改过
- **THEN** 同步后的顺序 SHALL 为 `[A, 手贴图, C]`

#### Scenario: 设计师拖过气泡
- **WHEN** 设计师移动了气泡 ②，markdown 在同一界面新增了一个簇
- **THEN** 气泡 ② 的坐标 SHALL 不变，新增的气泡放在默认偏移位置

### Requirement: 结构级变化

- 界面或簇调换顺序时，引擎 SHALL 按 markdown 重新排序，不记为冲突。
- 新增界面、簇、条目时，引擎 SHALL 把相关界面以 create 流水线（从目标文件的 `1:14` 克隆）渲染成一份临时文档，从中搬出所需节点插入对应位置，完成后删除临时文档。SHALL NOT 以目标文档中已有的块作为原型。
- 删除界面或簇时，如果容器内没有手改条目、也没有外来节点，引擎 SHALL 删除容器；否则 SHALL 保留容器，并记入 kind 为 `container-not-empty` 的冲突。
- 角色变化时，如果画布上的角色仍是上次写入的样子，引擎 SHALL 用临时文档中的角色框替换旧框；否则 SHALL 记入冲突。
- 气泡数量 SHALL 跟随簇数变化；已有气泡只更新编号。

#### Scenario: 删除含手贴图的簇
- **WHEN** markdown 删掉了一个簇，而该簇的说明块里有一张手贴图
- **THEN** 说明块 SHALL 保留，`conflicts` SHALL 包含 kind 为 `container-not-empty` 的条目

#### Scenario: 调换两个簇的顺序
- **WHEN** markdown 把簇 1 和簇 2 对调
- **THEN** 两个说明块 SHALL 交换位置，内部条目与手贴节点随说明块一起移动，气泡编号按新顺序更新

### Requirement: scope 限定同步范围

`scope` 为 `"NN"` 时，引擎 SHALL 只修改与 markdown 第 NN 个界面配对的那个界面；为 `"NN/C"` 时，SHALL 只修改该界面第 C 个簇内部的条目。

scope 之外的节点（包括文档头部、设计总览、其他界面）SHALL NOT 被写入。界面级的增、删、重排 SHALL 只在未传 scope 时执行。

scope 指向的界面或簇不存在时，引擎 SHALL 返回 `V2_SCOPE_NOT_FOUND`，并且 SHALL NOT 写入画布。

#### Scenario: 只更新一个界面
- **WHEN** markdown 同时修改了界面 01 和 03，调用时传 `scope: "03"`
- **THEN** 只有界面 03 的变化被写入，界面 01 的节点 SHALL 不变

### Requirement: dryRun 只返回计划

`dryRun: true` 时，引擎 SHALL 完成读取与对齐，返回 `changes`、`conflicts`、`preserved`，并且 SHALL NOT 产生任何画布写入（包括标记和锁）。

#### Scenario: 预览
- **WHEN** 调用时带 `dryRun: true`
- **THEN** 返回的 `changes` 与同参数实际执行时 SHALL 一致，画布不变

### Requirement: 幂等与分批执行

同步计划 SHALL 按容器分组：条目的写入与它的标记更新 SHALL 在同一组、同一次 `applyOps` 中执行。多个组 SHALL 合并成若干次 `applyOps`，每次的 op 数有上限，使单次 `figma_execute` 落在 30s 上限内；每次开头 SHALL 对所需字体去重加载。

插件遇到第一个无法执行的 op 时 SHALL 停下；引擎 SHALL 停止后续写入，返回错误 `V2_RECONCILE_APPLY_FAILED` 以及已落地批次的 `changes`，并删除临时文档。再次以相同参数调用 SHALL 收敛到与一次成功执行相同的画布状态；上次中断遗留的临时文档 SHALL 在下次同步开始时被清除。

同步开始时，引擎 SHALL 在 doc 标记中写入 `lock{runId, at}`；如果 60s 内存在另一个 run 的锁，SHALL 返回 `V2_RECONCILE_BUSY`，并且不写入画布。同步结束（含失败）时 SHALL 释放锁。没有任何需要写入的内容时，SHALL NOT 写锁。

#### Scenario: 中途失败后重跑
- **WHEN** 第一次同步在第 2 批出错退出，用户以相同参数重跑
- **THEN** 最终画布 SHALL 与一次成功执行的结果一致，没有重复插入的节点

#### Scenario: 并发同步
- **WHEN** 上一次同步仍持有锁（未满 60s），又发起一次同步
- **THEN** 第二次调用 SHALL 返回 `V2_RECONCILE_BUSY`

### Requirement: 同步写入 bullet 时字重随文字更新

同步模式改写 bullet 的 `正文/规则` TEXT 时，SHALL 按「状态行状态名加粗」（`figma-template-1-14-rendering`）重新设置字重：新文字是状态行则状态名加粗，否则整段常规字重。该设置 SHALL 与文字写入在同一个 op 内完成。

「手改判定与保留」中的 F / W / M 比较 SHALL 只比较文字，SHALL NOT 比较字重；文字未变化的条目不改动其字重。

#### Scenario: 普通规则改为状态行
- **WHEN** 某条 bullet 上次写入为 `点击后进入冷却`，markdown 改为 `冷却状态：技能释放后进入`，设计师未改动该节点
- **THEN** 同步后该节点文字 SHALL 为新文字，且"冷却状态"为粗体

#### Scenario: 状态行改为普通规则
- **WHEN** 某条 bullet 上次写入为 `默认状态`（整段粗体），markdown 改为 `默认无描边`，设计师未改动该节点
- **THEN** 同步后该节点整段 SHALL 为常规字重

#### Scenario: 设计师取消了加粗
- **WHEN** 设计师把某状态行的状态名改成常规字重，文字未改，markdown 中该条也未改
- **THEN** 同步 SHALL NOT 改动该节点

