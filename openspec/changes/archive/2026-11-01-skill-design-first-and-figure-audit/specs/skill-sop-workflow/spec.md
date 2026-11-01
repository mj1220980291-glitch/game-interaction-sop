## ADDED Requirements

### Requirement: Phase 1 开场先索要设计稿

SOP 进入 Phase 1 的第一回合，LLM SHALL 先询问用户是否已有设计稿（图片 / Figma 链接），再决定材料路径；SHALL NOT 把策划文档作为默认索要对象先开口。

设计稿 SHALL NOT 作为硬前置门禁：用户明确表示没有图时，LLM SHALL 转向策划文档路径并继续流程，SHALL NOT 卡住等待。

#### Scenario: 用户有设计稿

- **WHEN** 用户给出需求后进入 Phase 1
- **THEN** LLM 第一回合 SHALL 先问"有设计稿 / Figma 链接吗"，拿到图后 SHALL 按路径 A 以图为骨架提问，策划文档降为规则补充源

#### Scenario: 用户明确没有设计稿

- **WHEN** 用户回答"没有图，只有策划文档"
- **THEN** LLM SHALL 转向路径 B（策划文档先行），MAY 提议先画一版界面草稿确认章节骨架，SHALL NOT 因缺图拒绝推进

#### Scenario: 设计稿优先不改变完成条件

- **WHEN** 用户提供了设计稿并答完全部提问
- **THEN** 进入 Phase 2 的门禁 SHALL 仍为 4 维度满足 + `unresolved_conflicts` 清零，SHALL NOT 因已有图而放宽

### Requirement: Phase 2 每簇默认配图

Phase 2 产出的 v2 Markdown SHALL 为每个簇（`###`）至少提供一条 `配图：`，除非该簇无任何可指认的视觉对象，或用户明确要求本次不配图。

无配图的簇 SHALL 显式写 `- 配图：无（理由：…）` 并接受用户推翻；SHALL NOT 静默省略。用户要求本次不配图时 SHALL 记 `figure_opt_out = true`。

自检清单 SHALL 含一条配图覆盖项，逐簇核对"已配图"或"已写明无配图理由"。

引擎 SHALL 把 `- 配图：无（理由：…）` 视为声明式无配图：不建图槽、不画占位灰板、不计入 `summary.figuresPlaceholder`、不抛 `V2_W_FIGURE_ASSET_MISSING`，且该条目不占用 `"NN/C/K"` 的 K 序号。裸 `- 配图：无` 同样按声明式无配图处理（旧文档兜底）；正文里出现「理由：」但开头不是 `无（` 的描述仍是图槽。

#### Scenario: 常规界面簇

- **WHEN** 某簇描述界面上可见的控件与状态
- **THEN** 该簇 SHALL 至少有一条 `配图：`，且按 W3 紧跟它所说明的规则

#### Scenario: 纯数值簇

- **WHEN** 某簇全部为配表数值或服务端规则，界面上无可指认对象
- **THEN** 该簇 SHALL 写 `- 配图：无（理由：…）`，并在自检清单标注已确认

#### Scenario: 例外簇渲染不产生灰板

- **WHEN** 一份 1 章 2 簇的文档，簇 1 写正常 `配图：` 且给了 assetMap，簇 2 写 `- 配图：无（理由：纯配表数值）`
- **THEN** 渲染结果 SHALL 只有簇 1 一个图槽，簇 2 SHALL NOT 出现灰板，`summary.figuresPlaceholder` SHALL 为 0，`warnings` SHALL NOT 含 `V2_W_FIGURE_ASSET_MISSING`

#### Scenario: 主图已覆盖的簇

- **WHEN** 某簇描述的状态主图已完整覆盖
- **THEN** 该簇 SHALL 写 `- 配图：本界面主图，<区域>`（Phase 3 映射为主图节点 + `crop`）或走例外写法，SHALL NOT 因此留空

#### Scenario: 自检清单核对配图覆盖

- **WHEN** LLM 输出完整 Markdown 并给出自检清单
- **THEN** 清单 SHALL 含 `[ ] 每簇配图已覆盖（或写明无配图理由）`，且列出未覆盖簇编号

### Requirement: Phase 4 渲染后配图审计

Phase 4 在渲染成功或用同步模式完成写入后，LLM SHALL 执行配图审计并把结果报给用户；审计 SHALL NOT 阻塞交付，SHALL NOT 触发自动重渲染。

会话级 `figure_opt_out` 为真时（Phase 2 用户要求不配图，或 Phase 3 用户说"配图先不贴"），LLM SHALL 跳过审计，只报一句"按你要求本次不配图，未做配图审计"。

审计 SHALL 同时使用两层依据：

- 引擎返回的 `summary.figuresPlaced` / `summary.figuresPlaceholder` 与 `warnings` 中的 `V2_W_FIGURE_ASSET_MISSING` / `V2_W_FIGURE_FILL_FAILED`
- 按章节截图（`figma_capture_screenshot` / `figma_take_screenshot`）目视核对正文旁是否仍有灰板或虚线占位

冲突时 SHALL 以引擎统计为准，截图用于发现统计之外的视觉异常。

缺图时 SHALL 输出清单（章节 / 簇 / 配图描述 / 状态 / 用户该做什么）并明确提醒用户手动补图；全部已配时 SHALL 只报一句结论。

#### Scenario: 渲染后有占位

- **WHEN** 渲染返回 `ok:true` 且 `summary.figuresPlaceholder > 0`
- **THEN** LLM SHALL 截图核对并列出缺图清单，末尾 SHALL 提醒用户手动配图或提供图片以便用同步模式补上

#### Scenario: 截图发现统计之外的异常

- **WHEN** 引擎统计显示全部已配，但截图显示某章节正文旁仍有虚线占位
- **THEN** LLM SHALL 以截图为补充证据单点复核，并把该条列入清单，SHALL NOT 直接宣告全部已配

#### Scenario: 用户要求先这样

- **WHEN** 审计列出缺图后用户说"先这样，后面再补"
- **THEN** LLM SHALL 直接进入 Phase 5，SHALL NOT 再次追问或阻止交付

#### Scenario: 用户主动要求不配图

- **WHEN** 用户在 Phase 2 或 Phase 3 明确说过"这次不用配图 / 配图先不贴"
- **THEN** LLM SHALL 置 `figure_opt_out = true`，Phase 4 SHALL 跳过审计，报告只写一句"按你要求本次不配图"，SHALL NOT 列缺图清单或重复提醒

## MODIFIED Requirements

### Requirement: Phase 3 SHALL 为配图定位源区域并经用户确认

Phase 3 在主图资产确认之后，若 Markdown 含真实 `配图：` bullet 且用户提供了 Figma 设计稿，Agent SHALL 执行配图资产步骤：

1. 按簇内真实配图条目的文档顺序编出键 `"NN/C/K"`（K 跨 `####` 连续；`- 配图：无（理由：…）` 不占号、不编键）
2. 根据 `配图：` 描述，在设计稿中定位源节点与区域（`nodeId` + 相对该节点左上角的 `crop`）
3. `- 配图：本界面主图，<区域>` 形态 SHALL 直接映射为该章节主图节点 + `crop`，SHALL NOT 另找画板，也 SHALL NOT 重复贴整张主图
4. 以清单形式向用户展示：键、配图描述、源节点名、区域；对每个区域截图供用户核对
5. 用户确认后写入 `assetMap`；用户否决或 Agent 无法定位的配图 SHALL 不写键（保留占位文案），SHALL NOT 猜测区域

源节点不在渲染目标文件内时，Agent SHALL 告知用户该限制，并建议先把源节点复制到目标文件，或跳过该配图。

用户表示"配图先不贴"时，`assetMap` SHALL 不含任何配图键，Agent SHALL 记 `figure_opt_out = true`，Phase 4 按 opt-out 处理（跳过审计与配图类软告警）。

#### Scenario: 配图资产清单确认

- **WHEN** Markdown 01 章第 1 簇有 3 条 `配图：`，用户已提供设计稿节点
- **THEN** Agent SHALL 输出含 `01/1/1`、`01/1/2`、`01/1/3` 三行的清单（每行含描述、源节点、区域与截图），待用户确认后才写入 `assetMap`

#### Scenario: 无法定位的配图

- **WHEN** 某条 `配图：` 描述的状态在设计稿中找不到对应画面
- **THEN** Agent SHALL 在清单中标注"未找到源"，不为该配图写键，渲染后该占位保留描述文案

#### Scenario: 用户跳过配图资产

- **WHEN** 用户表示"配图先不贴"
- **THEN** `assetMap` SHALL 不含任何配图键，Agent SHALL 记 `figure_opt_out = true`，Phase 4 跳过审计与配图类软告警

#### Scenario: 例外条目不占键

- **WHEN** 某簇只有 `- 配图：无（理由：纯配表数值）`
- **THEN** Agent SHALL NOT 为它编键，该簇后续簇的 K 序号 SHALL 不受影响
