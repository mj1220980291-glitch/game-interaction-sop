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

Phase 2 产出的 v2 Markdown SHALL 为每个簇（`###`）至少提供一条 `配图：`，除非该簇无任何可指认的视觉对象。

无配图的簇 SHALL 显式写 `- 配图：无（理由：…）` 并接受用户推翻；SHALL NOT 静默省略。

自检清单 SHALL 含一条配图覆盖项，逐簇核对"已配图"或"已写明无配图理由"。

#### Scenario: 常规界面簇

- **WHEN** 某簇描述界面上可见的控件与状态
- **THEN** 该簇 SHALL 至少有一条 `配图：`，且按 W3 紧跟它所说明的规则

#### Scenario: 纯数值簇

- **WHEN** 某簇全部为配表数值或服务端规则，界面上无可指认对象
- **THEN** 该簇 SHALL 写 `- 配图：无（理由：…）`，并在自检清单标注已确认

#### Scenario: 自检清单核对配图覆盖

- **WHEN** LLM 输出完整 Markdown 并给出自检清单
- **THEN** 清单 SHALL 含 `[ ] 每簇配图已覆盖（或写明无配图理由）`，且列出未覆盖簇编号

### Requirement: Phase 4 渲染后配图审计

Phase 4 在渲染成功或用同步模式完成写入后，LLM SHALL 执行配图审计并把结果报给用户；审计 SHALL NOT 阻塞交付，SHALL NOT 触发自动重渲染。

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

- **WHEN** 用户此前明确说过"这次不用配图"
- **THEN** 审计清单 SHALL 把对应条目标为"未配（按你要求跳过）"，SHALL NOT 重复提醒补图
