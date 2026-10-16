## MODIFIED Requirements

### Requirement: 配图 bullet 原位插入且一簇允许多张

`- 配图：xxx` bullet SHALL 紧跟在它所说明的那条规则之后，位置即语义；一个 `###` 簇 SHALL 允许包含多条 `配图：` bullet。状态类簇（存在多个 `状态·xxx` 表现）SHALL 优先采用一态一图。`配图：` 后的说明 SHALL 是给设计师的一句"截什么"。

本规则取代原"`配图：` 作为该 `###` 内最后一条 bullet"的表述。Parser MUST NOT 为配图位置或数量新增校验码。渲染器 SHALL 按 bullet 顺序原位渲染每条 `配图：`（见 `figma-template-1-14-rendering`「配图按 bullet 原位渲染且一簇多张」）。

#### Scenario: 配图紧跟所说明规则

- **WHEN** 簇内第 3 条规则描述"结算阶段隐藏阶段名，仅保留倒计时并居中"，需要一张结算态示意图
- **THEN** 对应 `- 配图：结算态倒计时居中` SHALL 紧跟在第 3 条之后，而非移到簇末

#### Scenario: 状态类一态一图

- **WHEN** `### 地图卡片` 簇有默认 / 悬停 / 选中 / 带 MOD 标签四种状态
- **THEN** 每条状态 bullet 后 SHALL 各跟一条 `配图：` bullet
