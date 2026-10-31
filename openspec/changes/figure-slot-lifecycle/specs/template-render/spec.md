## ADDED Requirements

### Requirement: 配图槽三态

渲染结束时，每个出现在产物里的配图槽 SHALL 落入且仅落入一个状态，并记录在渲染版面清单中：

| 状态 | 判据 | 产物 |
|---|---|---|
| `filled` | 槽内 `配图占位` 矩形带 IMAGE 填充 | 图 + 无占位文案层 |
| `placeholder` | md 写了 `配图：` 条目，但 `assetMap` 无对应项或该项写入失败 | 占位灰板 + `配图占位：<描述>` |
| `hidden` | md 未声明对应配图条目 | 整组不可见，组内文本一并不可见 |

「槽是否被使用」SHALL 优先依据渲染期记录（哪个槽被写了哪张图），SHALL NOT 仅在渲染后凭节点外观或文本启发式反推；记录缺项时 SHALL 回退为文本比对。

`summary` SHALL 分别给出 `figuresPlaced`（`filled` 计数）与 `figuresPlaceholder`（`placeholder` 计数）。

#### Scenario: 声明了配图但缺资产

- **WHEN** md 某簇写了 `配图：待机动作`，`assetMap` 无对应 key
- **THEN** 该槽 SHALL 为 `placeholder`，`warnings` SHALL 含 `W_FIGURE_ASSET_MISSING`（message 含章节、簇、asset key），渲染 SHALL 成功

#### Scenario: 未声明的槽

- **WHEN** 模板簇自带 3 个配图槽，md 只写了 1 条 `配图：`，且该条已填图
- **THEN** 其余 2 个槽 SHALL 为 `hidden`，其组与组内文本 SHALL 均 `visible = false`

#### Scenario: 置图后的收尾

- **WHEN** 槽被填图（`filled`）
- **THEN** 该槽的占位文案层 SHALL 被删除（或不可见），SHALL NOT 在图上留下含「配图占位」字样的可见文本

#### Scenario: 计数可对账

- **WHEN** 一次渲染产生 18 个配图槽，其中 12 个填图、4 个缺资产、2 个未声明
- **THEN** `figuresPlaced` SHALL 为 12，`figuresPlaceholder` SHALL 为 4，`hidden` 的 2 个 SHALL 计入版面清单但不计入前两者

### Requirement: 配图配对键

置图成功时，渲染 SHALL 在槽的 stamp 中记录本次写入的资产（`stamp.asset`），使同步无需依赖占位文案文本即可认出「哪个槽对应 md 哪条配图」。

占位文案被删除后，配对 SHALL 仍能成立；stamp 缺失（老产物）时 SHALL 回退为 `配图占位：<描述>` 文本配对。

#### Scenario: 删文案后仍可配对

- **WHEN** 渲染置图并删除占位文案层，随后执行同步，md 该条配图描述不变
- **THEN** 同步 SHALL 认该槽为对应条目，SHALL NOT 判为「新增」或「删除」

#### Scenario: 老产物走文本回退

- **WHEN** 同步一份 stamp 里没有资产信息、但有 `配图占位：<描述>` 文本的产物
- **THEN** 同步 SHALL 按文本配对，行为与改动前一致
