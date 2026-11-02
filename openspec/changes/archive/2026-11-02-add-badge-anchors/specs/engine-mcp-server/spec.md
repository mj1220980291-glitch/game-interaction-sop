## ADDED Requirements

### Requirement: render_v2_markdown_to_figma 支持标号锚点 badgeAnchors

`render_v2_markdown_to_figma` SHALL 接受可选入参 `badgeAnchors`：键为 `"NN/C"`（章序号 / 簇序号，均从 1 起），值为主图归一化坐标 `{ x, y }`（0–1，左上原点），可带仅供人读的 `note`。

命中锚点的簇 SHALL 把标号摆到 `{x, y}` × 主图实际尺寸的位置；该簇没有锚点且传了 `badgeAnchors` 时 SHALL 退回模板网格并报 `V2_W_BADGE_ANCHOR_MISSING`；坐标越界 SHALL 夹取到主图内并报 `V2_W_BADGE_ANCHOR_OUT_OF_RANGE`。

完全不传 `badgeAnchors` 时，标号位置与告警行为 SHALL 与改动前完全一致（全部按网格、不产生锚点告警）。

#### Scenario: 按锚点摆放

- **WHEN** 1 章 2 簇的文档传入 `badgeAnchors: {"01/1": {x:0.25, y:0.4}, "01/2": {x:0.5, y:0.6}}`，主图 1200×745
- **THEN** 标号 1 / 2 SHALL 落在 `(300, 298)` / `(600, 447)`，且 SHALL NOT 出现锚点相关告警

#### Scenario: 缺锚点退回网格

- **WHEN** 只给 `"01/2"` 一个锚点
- **THEN** 标号 2 按锚点摆放，标号 1 退回网格并报一条 `V2_W_BADGE_ANCHOR_MISSING`（`context: "01/1"`）

#### Scenario: 越界夹取

- **WHEN** 传入 `{x: -0.5, y: 2}`
- **THEN** 标号夹到主图左上/下边界，并报一条 `V2_W_BADGE_ANCHOR_OUT_OF_RANGE`

#### Scenario: 不传锚点保持旧行为

- **WHEN** 调用方不传 `badgeAnchors`
- **THEN** 标号位置与旧版本一致，`warnings` 中 SHALL NOT 出现任何 `V2_W_BADGE_ANCHOR_*`
