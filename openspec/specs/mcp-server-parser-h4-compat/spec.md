# mcp-server-parser-h4-compat Specification

## Purpose
TBD - created by archiving change strip-h4-in-mcp-server-parser. Update Purpose after archive.
## Requirements
### Requirement: #### 行在 strip 模式下不推入 bullets

`parseClusters` 在扫描 cluster body 时，遇到以 `####` 开头的行 SHALL 跳过该行，不将其推入 `SemanticCluster.bullets[]`。

#### Scenario: 含 #### 的 cluster bullets 干净

- **WHEN** Markdown 中一个 `###` 簇的 body 包含 `#### 基础信息` 等 `####` 行和若干 `- bullet` 行
- **THEN** 解析结果的 `SemanticCluster.bullets[]` 中 SHALL NOT 包含任何以 `####` 开头的字符串

#### Scenario: #### 下方的真实 bullet 保留

- **WHEN** `####` 行后方紧跟若干 `- xxx` bullet 行
- **THEN** 这些 bullet 行 SHALL 被正常推入 `bullets[]`，内容完整，顺序保持

#### Scenario: 只有 #### 无真实 bullet 时 bullets 为空

- **WHEN** 一个 `###` 簇的 body 只含 `####` 行，没有任何 `- xxx` bullet
- **THEN** `SemanticCluster.bullets[]` SHALL 为空数组 `[]`

### Requirement: STRIP_H4 开关保留迁移路径

`parseClusters` SHALL 接受一个可选 options 参数 `{ stripH4?: boolean }`，默认值为 `true`。

#### Scenario: stripH4 默认 true 时 #### 行被 skip

- **WHEN** 调用 `parseClusters` 时未传入 options 或传入 `{ stripH4: true }`
- **THEN** `####` 行 SHALL 不出现在任何 cluster 的 `bullets[]` 中

#### Scenario: stripH4 为 false 时回退原始行为

- **WHEN** 调用 `parseClusters` 时传入 `{ stripH4: false }`
- **THEN** `####` 行 SHALL 以原文字符串（含 `#### ` 前缀）推入 `bullets[]`，与修改前行为一致

