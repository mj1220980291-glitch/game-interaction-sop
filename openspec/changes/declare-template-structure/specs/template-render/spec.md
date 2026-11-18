## MODIFIED Requirements

### Requirement: 渲染 SHALL 由结构声明驱动

渲染 SHALL 遍历 `layout.blocks`：`text` 槽位写文字、`list` 按行模板克隆、`table` 按列映射填行、`repeat` 按章节/簇循环、`roles` 实例化声明指定的变体、`badge` 按 `mode` 生成或改数字。渲染 SHALL NOT 依赖写死的槽位名常量或能力枚举。

#### Scenario: 未声明的节点
- **WHEN** 部件里存在节点，但声明中没有对应槽位
- **THEN** 渲染 SHALL 不写入该节点，并 SHALL 记一条 `V2_W_TEMPLATE_LAYOUT_BLOCK_HIDDEN` 级别的诊断（说明该节点未被任何声明使用）

#### Scenario: 新增顶部块
- **WHEN** 声明含 `revision`（table）与 `review`（slots）两个 block
- **THEN** 渲染 SHALL 写入修订表行与审核槽位，SHALL NOT 依赖 `TOP_SLOTS` 常量

## ADDED Requirements

### Requirement: 块级渲染失败 SHALL 可定位

单个 block 渲染失败时，错误信息 SHALL 带 block `id`、部件名与失败槽位名；其余 block SHALL 继续渲染（除结构性错误外），最终结果 SHALL 汇总所有失败块。

#### Scenario: 某块槽位缺失
- **WHEN** `review` 块声明的槽位在实例中不存在
- **THEN** 渲染 SHALL 继续写其它块，并产出 `V2_W_TEMPLATE_LAYOUT_SLOT_MISSING`（含 block id 与槽位名）
