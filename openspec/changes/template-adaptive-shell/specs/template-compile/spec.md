## ADDED Requirements

### Requirement: 部件自适应外壳

编译 SHALL 在部件空壳化之后，把部件根框接回 HUG 链，使产物高度跟随内容。

| 部件 | SHALL 设 | SHALL NOT 设 |
|---|---|---|
| `chapter` | `HORIZONTAL` 自动布局；`paddingTop = min(主图.y, 说明栏.y) − 根.y`；`itemSpacing = 说明栏.x − 主图右边`；高度 HUG；其余直接子级（含 `气泡`）绝对定位 | 宽度 HUG、子级坐标变更 |
| `cluster` | `VERTICAL` 自动布局；单子级时 `paddingTop = 子级.y`；高度 HUG | 宽度 HUG |

参数 SHALL 由现有几何反推，开启自动布局前后的子级位置 SHALL 保持一致（允许 ≤1px 取整误差）。

已是自动布局的部件 SHALL 跳过（幂等），编译报告 `adaptive` SHALL 为空。

以下情况 SHALL 记缺口并保持原样（零写入），SHALL NOT 猜：

- 说明栏在图区之前（自动布局会左右对调）
- 图区与说明栏重叠（间距 < 0）
- 簇根有多个直接子级（判不出纵向顺序）
- 缺 `主图占位` 或说明栏槽位
- 后端不支持 `setAutoLayout`

编译报告 SHALL 返回 `adaptive`（逐部件 `part` / `mode` / `itemSpacing` / `paddingTop` / `absoluteChildren`）。

#### Scenario: 蛋仔章节接上 HUG 链
- **WHEN** 章节根 `2209×6240`、主图 `(0,807)`、说明栏 `(1277,786)`、气泡 `(0,0) 1920×1080`
- **THEN** 根框 SHALL 变成 `HORIZONTAL` + 高度 HUG，`itemSpacing = 77`、`paddingTop = 786`，`气泡` SHALL 绝对定位

#### Scenario: 已是自动布局
- **WHEN** 部件根本身就是 `VERTICAL`（官方1.14 的簇）
- **THEN** 编译 SHALL 跳过该部件，`adaptive` 不含它，零写入

#### Scenario: 顺序反了不猜
- **WHEN** 章节部件的说明栏排在主图之前
- **THEN** 编译 SHALL 记缺口且 SHALL NOT 改动该部件

#### Scenario: 顶部 / 结尾不参与
- **WHEN** 部件是 `top` 或 `footer`
- **THEN** 编译 SHALL NOT 为它设自动布局
