## ADDED Requirements

### Requirement: render 工具支持落点参数

`render_v2_markdown_to_figma` SHALL 接受 `position: { x: number, y: number }` 与 `autoPlace: 'below' | 'right'` 两个可选入参，缺省时行为与改动前一致（落 `(0,0)`）。

两个入参同时提供时 SHALL 采用 `position`，并在返回 `warnings` 中给 `W_POSITION_OVERRIDE`。

#### Scenario: 入参透传

- **WHEN** 调用传 `position: { x: 0, y: 3300 }`
- **THEN** 工具 SHALL 接受该入参且渲染结果的根帧落在该坐标

#### Scenario: 缺省兼容

- **WHEN** 调用不传任何落点参数
- **THEN** 渲染行为 SHALL 与改动前一致

### Requirement: 工具错误返回三段式

工具的错误返回 SHALL 为 `{ code, message, details? }` 三段：`message` 为一句结论（硬上限 200 字符，超长截断并以 `…` 结尾），节点列表 / 选区 dump / 原始异常 SHALL 放入 `details`，SHALL NOT 拼进 `message`。

同类节点级信息 SHALL 聚合为一条并带 `(n 处)` 计数。

#### Scenario: 长错误不刷屏

- **WHEN** 一次失败涉及 102 个节点且原始异常含节点 dump
- **THEN** `message` SHALL ≤ 200 字符且不含节点 dump，`details` SHALL 含完整清单

#### Scenario: 结论可判读

- **WHEN** 模板包未命中导致渲染失败
- **THEN** `message` SHALL 一句话说明缺什么，`code` SHALL 为对应错误码
