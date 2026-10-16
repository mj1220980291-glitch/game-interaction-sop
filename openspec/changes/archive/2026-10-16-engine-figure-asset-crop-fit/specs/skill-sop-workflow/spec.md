## ADDED Requirements

### Requirement: Phase 3 SHALL 为配图定位源区域并经用户确认

Phase 3 在主图资产确认之后，若 Markdown 含 `配图：` bullet 且用户提供了 Figma 设计稿，Agent SHALL 执行配图资产步骤：

1. 按簇内文档顺序为每条 `配图：` 编出键 `"NN/C/K"`（K 跨 `####` 连续）
2. 根据 `配图：` 描述，在设计稿中定位源节点与区域（`nodeId` + 相对该节点左上角的 `crop`）
3. 以清单形式向用户展示：键、配图描述、源节点名、区域；对每个区域截图供用户核对
4. 用户确认后写入 `assetMap`；用户否决或 Agent 无法定位的配图 SHALL 不写键（保留占位文案），SHALL NOT 猜测区域

源节点不在渲染目标文件内时，Agent SHALL 告知用户该限制，并建议先把源节点复制到目标文件，或跳过该配图。

#### Scenario: 配图资产清单确认

- **WHEN** Markdown 01 章第 1 簇有 3 条 `配图：`，用户已提供设计稿节点
- **THEN** Agent SHALL 输出含 `01/1/1`、`01/1/2`、`01/1/3` 三行的清单（每行含描述、源节点、区域与截图），待用户确认后才写入 `assetMap`

#### Scenario: 无法定位的配图

- **WHEN** 某条 `配图：` 描述的状态在设计稿中找不到对应画面
- **THEN** Agent SHALL 在清单中标注"未找到源"，不为该配图写键，渲染后该占位保留描述文案

#### Scenario: 用户跳过配图资产

- **WHEN** 用户表示"配图先不贴"
- **THEN** `assetMap` SHALL 不含任何配图键，Phase 4 照常渲染占位
