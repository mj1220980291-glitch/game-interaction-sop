# slot-run-contract Specification

## Purpose
TBD - created by archiving change slot-run-contract. Update Purpose after archive.
## Requirements
### Requirement: run 边界唯一定义

簇说明块的直接子节点 SHALL 按「槽位段（run）」切分，且该切分规则 SHALL 只定义一次（`src/v2/template/runs.ts`），编译、渲染、同步三端 MUST 共用同一实现。

切分规则：

- 每个 `#Title` TEXT（`SECTION_CHILD_NAMES.clusterSubTitle`）SHALL 作为一段 run 的起点，延伸至下一个 `#Title` 之前。
- 第一个 `#Title` 之前的节点 SHALL 归入簇级表头，任何一端 MUST NOT 克隆或删除表头。
- `clusterGroups = none` 时，整簇 SHALL 视为 1 个无标题 run。
- `clusterGroups = inline-subtitle` 时，SHALL NOT 产生 run；`#Title` 只作为正文首行前缀的来源。

#### Scenario: 两段 run 的切分

- **WHEN** 簇直接子节点为 `[标题GROUP, #Title=a, 职能帧, 正文×2, 配图GROUP, #Title=b, 职能帧, 正文×2, 配图GROUP]`
- **THEN** 表头 SHALL 为 `[标题GROUP]`，runs SHALL 为 2 段，每段含 1 个 `#Title`、1 个职能帧、2 条正文、1 个配图

#### Scenario: 无 `#Title` 的簇

- **WHEN** 簇直接子节点不含任何 `#Title`
- **THEN** runs SHALL 为空，表头 SHALL 为该簇全部直接子节点

#### Scenario: 三端共用同一规则

- **WHEN** 同一份簇节点快照分别交给编译瘦身与渲染填充
- **THEN** 两端得到的 run 数量与每段成员 SHALL 完全相同

### Requirement: run 成员构成

一段 run 的成员 SHALL 按下表识别，且每段 MUST 至少含 1 条正文才算「完整 run」：

| 成员 | 识别规则 | 数量约束 |
|---|---|---|
| 分组标题 | `#Title` TEXT | 恰好 1 个 |
| 职能标签 | FRAME 且名字命中职能帧前缀（模板原名 `Frame 4273*` 或归一化名） | ≤1 个 |
| 正文 | `正文/规则` TEXT | ≥1 个 |
| 配图 | 名字为 `配图` 的 GROUP / FRAME / RECTANGLE | ≤1 个（多图由渲染按 bullet 克隆） |

#### Scenario: 完整 run 判定

- **WHEN** 一段 run 只有 `#Title` 与职能帧、没有任何 `正文/规则`
- **THEN** 该段 SHALL 被判为不完整 run

#### Scenario: 配图缺失的 run

- **WHEN** 一段 run 有 `#Title`、职能帧、2 条正文，但没有 `配图`
- **THEN** 该段 SHALL 仍被视为完整 run

### Requirement: 配图槽形态为 GROUP

`配图` 槽位在编译产物中 SHALL 一律为 GROUP，其内部 SHALL 含：

- 1 个 `配图占位` 矩形（接收 IMAGE 填充）
- 1 个 `配图占位文案` TEXT（渲染写入 `配图占位：xxx`）

模板原本是裸矩形或实例时，编译期 SHALL 包壳补齐；SHALL NOT 以 `replaceWithPlaceholder` 之类的原地替换把 GROUP 拍平成矩形。

#### Scenario: GROUP 原样保留

- **WHEN** 原稿的配图槽已经是 GROUP 且含 `配图占位` 与 `配图占位文案`
- **THEN** 编译产物 SHALL 保持 GROUP，且两个子节点名字不变

#### Scenario: 裸矩形包壳

- **WHEN** 原稿的配图槽是一个裸矩形
- **THEN** 编译产物 SHALL 出现一个名为 `配图` 的 GROUP，内含名为 `配图占位` 的矩形与名为 `配图占位文案` 的 TEXT

#### Scenario: 无配图能力不造槽

- **WHEN** 模板能力 `figure = none`
- **THEN** 编译 SHALL NOT 创建任何 `配图` 节点

### Requirement: run 契约违反即硬失败

任一 run 契约不变量被破坏时，编译 SHALL 中止并返回 `V2_COMPILE_RUN_CONTRACT_BROKEN`，错误信息 MUST 指明簇标识与违反项，SHALL NOT 静默降级产出部件。

不变量包括：至少 1 个完整 run、完整 run 内正文 ≥1、配图槽为 GROUP 且含矩形与占位文案、职能帧 ≤1。

#### Scenario: 产物簇认不出 run

- **WHEN** 瘦身后某个簇产物的直接子节点里没有 `#Title`
- **THEN** 编译 SHALL 返回 `V2_COMPILE_RUN_CONTRACT_BROKEN`，且报告 SHALL 指明该簇

#### Scenario: 配图被拍平

- **WHEN** 瘦身后配图槽是裸矩形而非 GROUP
- **THEN** 编译 SHALL 返回 `V2_COMPILE_RUN_CONTRACT_BROKEN`

#### Scenario: 写画布前拦截

- **WHEN** 原稿某个簇既没有 `#Title` 也没有任何 `正文/规则`
- **THEN** 编译 SHALL 在创建任何组件之前失败，库文件 SHALL NOT 新增节点

