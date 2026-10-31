## ADDED Requirements

### Requirement: 写入层的样式归一化

引擎向模板层写入内容时，该层的段落样式 SHALL 由引擎显式设定，SHALL NOT 依赖克隆继承。

需要归一化的层与规则：

| 层 | 须设定的属性 |
|---|---|
| `正文/规则` | `textAlignHorizontal = LEFT`、`textAutoResize = HEIGHT` |
| `配图占位文案` | 保持水平居中（现状不变） |

其余层（簇标题、标号、装饰）SHALL NOT 被改动。

归一化 SHALL 与文本写入在同一次批量调用中完成，SHALL NOT 为对齐单独开一轮逐节点调用。

当模板层原对齐非 `LEFT` 且被归一化时，渲染 SHALL 返回一条聚合软告警 `W_TEXT_ALIGN_NORMALIZED`（message 含条目数），SHALL NOT 逐条告警。

#### Scenario: 模板正文居中

- **WHEN** 模板的 `正文/规则` 为 `CENTER`，md 该章有 20 条条目
- **THEN** 产物 20 条正文 SHALL 全部 `LEFT` 且 `textAutoResize = HEIGHT`，`warnings` SHALL 只含 1 条 `W_TEXT_ALIGN_NORMALIZED`

#### Scenario: 标题不被改动

- **WHEN** 模板的簇标题为 `CENTER`
- **THEN** 渲染后该标题 SHALL 仍为 `CENTER`

#### Scenario: 批量完成

- **WHEN** 一章写入 20 条正文
- **THEN** 后端调用 SHALL 为批量文本写入（含样式），SHALL NOT 出现 20 次独立的对齐调用

### Requirement: 置图清描边

引擎把图片写入占位矩形时（渲染或同步的填图批次），该矩形 SHALL 同时清空 `strokes` 与 `dashPattern`，使产物上不残留模板占位态的虚线框。

清描边 SHALL 与填图在同一次调用或同一次 exec 内完成；清描边失败 SHALL 只记软告警 `W_FILL_STROKE_RESIDUAL`，SHALL NOT 使渲染失败或回滚。

未填图的占位矩形 SHALL 保留模板的虚线占位视觉。

#### Scenario: 主图填图后无虚线

- **WHEN** `主图占位` 带 `dashPattern: [12,12]`，渲染填入截图
- **THEN** 产物该矩形 SHALL 有 IMAGE 填充、`strokes` 为空、`dashPattern` 为空

#### Scenario: 未填图的槽保留占位视觉

- **WHEN** 某配图槽没有对应资产（`placeholder` 态）
- **THEN** 该矩形 SHALL 保留灰板填充与虚线描边

#### Scenario: 同步填图同样清描边

- **WHEN** 同步的 `fills` 批次替换某簇配图
- **THEN** 替换后该矩形 SHALL 无描边与虚线
