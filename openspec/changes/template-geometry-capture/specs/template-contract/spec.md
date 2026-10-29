## MODIFIED Requirements

### Requirement: 配置文件形状

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

#### Scenario: 带 geometry 的包可以解析

- **WHEN** 读取含 `geometry.bubbleGrid` / `geometry.docBackground` 的包
- **THEN** 解析成功，`geometry` 原样可取

#### Scenario: geometry 内单字段非法

- **WHEN** `geometry.mainImage` 缺 `height`
- **THEN** 只丢弃 `mainImage`，`geometry` 其余字段与包的其它部分保持可用
