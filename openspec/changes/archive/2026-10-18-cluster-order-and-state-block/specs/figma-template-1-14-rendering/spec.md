## ADDED Requirements

### Requirement: 状态行状态名加粗

渲染器写入簇内 bullet 的 `正文/规则` TEXT 时，SHALL 用「状态行语法」（`markdown-v2-contract`）判断该 bullet 是否为状态行：

- 是状态行：状态名（`[0, 状态名长度)`）SHALL 设为同字体族的粗体字重，其余文字为常规字重
- 不是状态行：整段 SHALL 为常规字重

粗体字重按 `Bold` → `SemiBold` → `Semibold` → `Medium` 顺序在同字体族中选取第一个可加载的。都不可用时 SHALL 只写文字不加粗，并产生软警告 `V2_W_STATE_BOLD_UNAVAILABLE`，渲染继续。

加粗 SHALL 在写入文字的同一次插件调用内完成，SHALL NOT 增加 backend 调用次数；不含状态行的文档 backend 调用序列 SHALL 不变。粗体字重 SHALL 与其他字体一起去重加载。

#### Scenario: 带条件的状态行
- **WHEN** bullet 为 `冷却状态：技能释放后进入，冷却结束恢复默认`
- **THEN** 对应 TEXT 的"冷却状态"四个字 SHALL 为粗体，冒号及之后为常规字重

#### Scenario: 只有名字的状态行
- **WHEN** bullet 为 `默认状态`
- **THEN** 对应 TEXT 整段 SHALL 为粗体

#### Scenario: 普通规则
- **WHEN** bullet 为 `点击卡片后进入详情`
- **THEN** 对应 TEXT 整段 SHALL 为常规字重

#### Scenario: 无状态行文档调用序列不变
- **WHEN** 渲染一份不含状态行、不含 `####`、不含配图的文档
- **THEN** backend 调用序列 SHALL 与 `BASELINE_CALL_SEQUENCE` 一致

#### Scenario: 字体族无粗体
- **WHEN** 正文字体族中 `Bold` / `SemiBold` / `Semibold` / `Medium` 均不可加载
- **THEN** 状态行 SHALL 按常规字重写入，结果 SHALL 包含一条 `V2_W_STATE_BOLD_UNAVAILABLE`
