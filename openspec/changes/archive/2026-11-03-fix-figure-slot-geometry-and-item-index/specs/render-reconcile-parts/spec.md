## ADDED Requirements

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
