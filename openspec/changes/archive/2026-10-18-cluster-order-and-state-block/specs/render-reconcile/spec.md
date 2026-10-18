## ADDED Requirements

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
