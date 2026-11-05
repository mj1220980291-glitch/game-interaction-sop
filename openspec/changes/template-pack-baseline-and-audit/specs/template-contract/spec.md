## MODIFIED Requirements

### Requirement: 项目模板包

模板包 SHALL 由 `<项目根>/.interaction-sop/template.json`（机器读）与 `md-contract.md`（人读）组成；读取顺序 SHALL 为：

1. `$GISOP_TEMPLATE_PACK`（显式路径；`off` 关闭整个查找）
2. `<项目根>/.interaction-sop/template.json`
3. `~/.game-interaction-sop/templates/<项目名>.json`
4. `~/.game-interaction-sop/templates/default.json`
5. **引擎包内 `<engine>/assets/packs/<项目名>.json`**
6. **引擎包内 `<engine>/assets/packs/default.json`**

第 5、6 级 SHALL 随引擎一起分发，SHALL 为只读基线；前 4 级任何一份命中都必须覆盖基线。全部未命中时 SHALL 完全回落到既有行为（legacy `1:14`）。

引擎包内的项目名匹配 SHALL 大小写不敏感；第 5 级未命中时 SHALL 继续尝试第 6 级，SHALL NOT 直接判定为「模板包缺失」。

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
| `geometry` | 否 | 几何与色彩：`docBackground` / `chapterWidth` / `mainImage` / `placeholder` / `bubbleGrid` / `badgeSize` / `rootGap` / `docPadding` / `footerGap` / `sectionShell` |
| `mdContract` | 否 | 书写契约的相对路径 |

`geometry` / `capabilities` 缺省 SHALL NOT 使包失效——不同项目的模板结构可能确实用不到；缺失后果 SHALL 由渲染期软告警说明（见 `template-render` 的后果自检），SHALL NOT 判为错误。

未知顶层键 SHALL 记 warning 且不影响解析；`geometry` 内非法字段 SHALL 被单独丢弃，不得使整份包失效。

#### Scenario: 带 geometry 的包可以解析

- **WHEN** 读取含 `geometry.bubbleGrid` / `geometry.docBackground` 的包
- **THEN** 解析成功，`geometry` 原样可取

#### Scenario: geometry 内单字段非法

- **WHEN** `geometry.mainImage` 缺 `height`
- **THEN** 只丢弃 `mainImage`，`geometry` 其余字段与包的其它部分保持可用

#### Scenario: 新机器只靠基线包

- **WHEN** 本机没有任何项目包与用户包，引擎包内存在 `assets/packs/default.json`
- **THEN** 查找 SHALL 命中该项，渲染可用，且返回体 `pack.origin` SHALL 标明来自引擎包内基线

#### Scenario: 用户包覆盖基线

- **WHEN** `~/.game-interaction-sop/templates/default.json` 与引擎包内基线同时存在
- **THEN** SHALL 命中用户包，SHALL NOT 读取引擎包内基线

#### Scenario: 缺观感字段不判错

- **WHEN** 包内没有 `geometry.docBackground` 与 `geometry.sectionShell`
- **THEN** 解析 SHALL 成功、渲染 SHALL 继续，仅由渲染期软告警说明后果
