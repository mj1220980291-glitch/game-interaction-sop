## MODIFIED Requirements

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
