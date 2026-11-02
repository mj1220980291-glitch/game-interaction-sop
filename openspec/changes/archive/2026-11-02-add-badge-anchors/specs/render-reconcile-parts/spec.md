## ADDED Requirements

### Requirement: 同步模式下按标号锚点重摆

多部件文档走同步（带 `rootId`）且传入 `badgeAnchors` 时，同步 SHALL 按锚点重摆标号，并遵守下列约束：

- 即使 markdown 没有任何改动（`changes` 为空），同步 SHALL 仍按锚点重摆标号，SHALL NOT 因「无 md 差异」提前返回
- 已存在的标号 SHALL 在该簇给了锚点时移动到锚点位置；该簇没给锚点 SHALL 保持画布原坐标（不覆盖设计师手拖）
- 重摆 SHALL NOT 改变文字、配图与节点顺序；`changes` 与 `preserved` 的报告语义仍只描述 markdown 差异
- 只改动部分簇的锚点时，SHALL NOT 为未给锚点的簇逐个报 `V2_W_BADGE_ANCHOR_MISSING`

#### Scenario: 只改锚点也能生效

- **WHEN** 文档已渲染，markdown 一字不改，同步时只传新的 `badgeAnchors`
- **THEN** 标号 SHALL 移动到锚点位置，`changes` 仍为空，文字与配图不变

#### Scenario: 已存在标号按锚点移动

- **WHEN** 某章已有 2 个标号，同步传 `{"01/1": {x:0.25, y:0.4}}`
- **THEN** 标号 1 SHALL 移动到锚点位置，且 SHALL NOT 新克隆出重复标号

#### Scenario: 没给锚点的标号不动

- **WHEN** 同步只给第 1 个簇锚点，第 2 个簇的标号在画布上被设计师拖过
- **THEN** 标号 2 SHALL 保持设计师拖过的坐标，且 SHALL NOT 报缺锚告警
