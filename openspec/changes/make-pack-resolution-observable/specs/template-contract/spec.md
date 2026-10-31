## MODIFIED Requirements

### Requirement: 项目模板包

模板包 SHALL 由 `<项目根>/.interaction-sop/template.json`（机器读）与 `md-contract.md`（人读）组成；读取顺序 SHALL 为：项目根模板包 → `~/.game-interaction-sop/templates/<项目名>.json` → 全局 default → 官方 `1:14`，模板包不存在或解析失败时 SHALL 给出可诊断的解析轨迹，按 `$GISOP_TEMPLATE_PACK` 是否显式设置决定回落或失败（见「模板解析可观测」）。

`template.json` SHALL 为 JSON 对象，顶层字段：

| 字段 | 必填 | 含义 |
|---|---|---|
| `schema_version` | 是 | 当前为 `1` |
| `project` | 否 | 项目名 |
| `source` | 否 | 模板来源（`fileKey` / `nodeIds` / `fingerprint`） |
| `components` | 是 | `top` / `chapter` / `cluster` / `footer` 四个库组件 key，`footer` 可为 `null` |
| `capabilities` | 否 | 8 项能力，缺省为 `1:14` 等价值 |
| `anchors` | 否 | 非默认锚点 |
| `docBackground` | 否 | 文档底色 `#rrggbb` |
| `geometry` | 否 | 几何与色彩：`chapterWidth` / `mainImage` / `placeholder` / `bubbleGrid` / `badgeSize` / `rootGap` |
| `mdContract` | 否 | 书写契约的相对路径 |

未知顶层键 SHALL 记 warning 且不影响解析；`geometry` 内非法字段 SHALL 被单独丢弃，不得使整份包失效。

解析 SHALL 保留每个候选路径的结局：`hit` / `missing`（文件不存在）/ `invalid`（JSON 或协议不合法）/ `incomplete`（缺少 `top` / `chapter` / `cluster` 任一 key），以及 `invalid` / `incomplete` 的原因。该轨迹 SHALL NOT 被静默丢弃。

#### Scenario: 带 geometry 的包可以解析

- **WHEN** 读取含 `geometry.bubbleGrid` / `geometry.docBackground` 的包
- **THEN** 解析成功，`geometry` 原样可取

#### Scenario: geometry 内单字段非法

- **WHEN** `geometry.mainImage` 缺 `height`
- **THEN** 只丢弃 `mainImage`，`geometry` 其余字段与包的其它部分保持可用

#### Scenario: 候选路径逐个记录结局

- **WHEN** 4 个候选路径中第 2 个 JSON 语法错误、第 3 个缺 `cluster` key、第 4 个命中
- **THEN** 轨迹 SHALL 依次为 `invalid`（含解析错误摘要）、`incomplete`（含缺的 key）、`missing`、`hit`
