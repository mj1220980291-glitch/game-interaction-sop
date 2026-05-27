# skill-sop-workflow Specification

## Purpose
TBD - created by archiving change add-classify-prephase-for-markdown. Update Purpose after archive.
## Requirements
### Requirement: phase2 写完整 Markdown 前必须完成 4 步分类决策

当 SOP 进入 phase2（v2 Markdown 生成）时，LLM SHALL 在输出完整 Markdown 之前依次完成下列 4 个子步骤，每步以用户确认作为通过门：

- **Step 0.1 界面清单**：LLM 列出本需求涉及的"界面 / 场景态"清单，每项含一句功能定位；输出给用户审核 / 补充
- **Step 0.2 功能模块清单**：对每个已确认的界面，LLM 列出玩家能识别的"功能模块 / 信息块"清单；输出给用户审核
- **Step 0.3 规则归位映射**：LLM 拿策划稿每条规则尝试归位到 (界面, 模块) 二元组；归位不上的规则 flag 出来跟用户确认是否漏界面 / 漏模块或属跨界面全局规则
- **Step 0.4 终态确认**：用户对完整 (界面 ↔ 章节, 模块 ↔ 簇) 分类决策 OK 后，LLM 才允许进入 Step 1（写完整 Markdown）

下游派生关系 MUST 严格按 (界面 = `## NN. 章节`, 模块 = `### 簇`) 对应。

#### Scenario: 用户给一份策划文档启动 phase2

- **WHEN** 用户在 phase1 完成后让 LLM 写 v2 Markdown
- **THEN** LLM 第一轮 SHALL 输出 Step 0.1 界面清单（不立即写完整 Markdown），询问用户是否需要补充 / 调整

#### Scenario: 用户跳过分类决策直接催 LLM 出 Markdown

- **WHEN** 用户进入 phase2 后说"直接写完整 markdown 给我"
- **THEN** LLM SHALL 拒绝跳过 Step 0，提示"按 SOP 流程需要先完成 4 步分类决策；跳过会导致章节/簇分类偏差"，仍输出 Step 0.1 清单

#### Scenario: Step 0.1 与 Step 0.2 合并输出

- **WHEN** 需求规模小（涉及界面 ≤ 2 个），LLM 决定把 0.1 + 0.2 合并到一轮输出
- **THEN** 合并输出 SHALL 仍保留两段清单的结构化区分（界面清单段 + 各界面下模块清单段），用户能分别审核

#### Scenario: 多态拆分决策在 Step 0.1 显式说明

- **WHEN** 需求涉及同一功能多态（如 hover 前 / 后）
- **THEN** Step 0.1 输出 SHALL 显式列"这两态拆 N 个界面 / 合 1 个界面"的决策与一句理由（依据 markdown-v2-contract 多态拆分指南）

### Requirement: phase2 自检清单前置 4 条分类决策项

phase2 在 LLM 输出完整 Markdown 后给用户的自检清单中，MUST 在原有条目最前增加下列 4 条 checkbox：

- `[ ] 0.1 界面/场景态清单已与用户确认`
- `[ ] 0.2 每个界面的功能模块清单已与用户确认`
- `[ ] 0.3 策划稿每条规则已归位（含无法归位的 flag 与处理）`
- `[ ] 0.4 完整分类决策（界面 ↔ 章节, 模块 ↔ 簇）已与用户确认`

#### Scenario: 自检清单展示

- **WHEN** LLM 完成完整 Markdown 输出并准备请求用户审核
- **THEN** 自检清单的前 4 条 SHALL 是上述 Step 0 条目，按 0.1 → 0.4 顺序

### Requirement: phase2 文档去除 ###命名规则的内部矛盾

`packages/skill/phases/phase2-markdown.md` SHALL 对 `###` 簇命名给出单一一致的指引：簇名是该功能模块 / 信息块的名词性命名；行为单元可用 `xxx 行为` / `xxx 流程` 等替代名词；禁止动作过程动词短语（"触发与传送" / "候选下发" 这类）作为 `###` 命名风格。

`phase2-markdown.md` 内 SHALL NOT 出现互相矛盾的两套引导。

#### Scenario: phase2-markdown.md 修订后规则一致

- **WHEN** 读 `packages/skill/phases/phase2-markdown.md` 全文
- **THEN** 所有提到 `###` 命名风格的段落 SHALL 表述一致（"功能模块 / 信息块名词，可用行为/流程后缀替代名词"），不出现 L96 风格的"语义动词短语" 表述

### Requirement: skill 文档与 OpenSpec 主 spec 双向一致

`packages/skill/references/markdown-v2-spec.md` 与 `openspec/specs/markdown-v2-contract/spec.md` SHALL 在校验规则与禁词清单上保持一致。任何一方更新 SHALL 同步另一方。

#### Scenario: 增加新禁词时双向同步

- **WHEN** OpenSpec 主 spec 在 ADDED/MODIFIED Requirement 中扩了 W6 禁词清单
- **THEN** 同一 PR / commit 必须同时更新 `packages/skill/references/markdown-v2-spec.md` 反映新清单

#### Scenario: skill 文档独立修改不允许

- **WHEN** 作者仅修改 `packages/skill/references/markdown-v2-spec.md` 增加禁词但未同步主 spec
- **THEN** 视为契约不一致，PR review 应拒绝

