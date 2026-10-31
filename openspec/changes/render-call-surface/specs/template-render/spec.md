## ADDED Requirements

### Requirement: 文档落点

渲染 SHALL 支持指定新文档的页面坐标；未指定时 SHALL 支持按目标页面现有内容自动摆放；两者都未给时 SHALL 落在 `(0,0)`（与改动前一致）。

`position: { x, y }` SHALL 与 `autoPlace: 'below' | 'right'` 互斥，同时给出时 SHALL 采用 `position` 并记软告警 `W_POSITION_OVERRIDE`。

`autoPlace` SHALL 依据目标页面现有子节点的包围盒：`below` 取最下沿 + 间隙、`right` 取最右沿 + 间隙；间隙 SHALL 取模板包 `geometry.rootGap`，缺省 100。取不到页面子节点时 SHALL 回退 `(0,0)` 并记 `W_AUTOPLACE_FALLBACK`。

落点 SHALL 在创建根帧时一次生效，SHALL NOT 出现「先落 `(0,0)` 再位移」的可见跳动。

#### Scenario: 指定坐标

- **WHEN** 调用传 `position: { x: 0, y: 3300 }`
- **THEN** 根帧 SHALL 落在页面坐标 `(0, 3300)`

#### Scenario: 自动避让

- **WHEN** 目标页面已有内容最下沿 y = 21000，传 `autoPlace: 'below'`
- **THEN** 根帧顶部 y SHALL 为 `21000 + rootGap`

#### Scenario: 无法计算时回退

- **WHEN** 后端取不到页面子节点
- **THEN** 根帧 SHALL 落 `(0,0)`，`warnings` SHALL 含 `W_AUTOPLACE_FALLBACK`

### Requirement: 创建路径瞬时重试

创建路径（`mode = create`）遇到瞬时连接错误时 SHALL 整轮重试，判据与同步路径一致（仅瞬时桥错误，冲突 / 缺节点等不重试）。

重试前 SHALL 完成上一轮的回滚，使画布上不残留半成品；重试默认 1 次、间隔 5s，可通过参数覆盖。

重试发生 SHALL 记软告警 `W_RENDER_RETRIED`（含尝试次数与首次错误摘要）。

#### Scenario: 首次连接失败

- **WHEN** 第一轮创建在写第一簇时抛 `Cannot connect`
- **THEN** 渲染 SHALL 回滚后重跑一次，成功时返回 `ok: true` 且 `warnings` 含 `W_RENDER_RETRIED`

#### Scenario: 非瞬时错误不重试

- **WHEN** 第一轮因 `V2_TEMPLATE_PACK_MISSING` 失败
- **THEN** 渲染 SHALL NOT 重试，直接返回该错误

#### Scenario: 重试后不留双份

- **WHEN** 第一轮已创建根帧后失败，第二轮成功
- **THEN** 画布上 SHALL 只有一份本次文档的根帧
