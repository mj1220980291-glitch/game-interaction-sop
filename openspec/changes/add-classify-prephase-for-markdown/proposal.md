## Why

SOP 生成的 v2 Markdown 文档结构跟用户期望的分类法（"按关键界面 / 按界面功能点"）有系统性偏差。实际案例对比（`选秀环节_交互文档.md` 实际产出 vs `M1天书阶段迭代/部从卡牌TIPS战斗交互_基于设计稿说明` 期望模板）：

- **章节维度偏差**：LLM 倾向按"流程时段"切章节（"准备环节 / 私密选择环节 / 卡牌交换环节"），用户期望按"界面/功能模块"切章节（"部从选中与入口 / 主TIPS固定显示版 / 属性信息区域"）
- **簇维度偏差**：LLM 倾向用"动作过程动词"命名（"触发与传送 / 候选下发 / 结算返回"），用户期望"界面上可识别的信息块名词"命名（"入口规则 / 显示位置 / 基础信息 / 属性概览"）
- **颗粒度偏差**：实际章节数 ≈ 流程阶段数（3 个），期望章节数 ≈ 涉及界面数（7 个）

仅靠"关键词强校验 + 禁词软警告"（即在 `markdown-v2-contract` spec 上加 S3/W6 这种条款）解决不了根因：因为"准备环节" 这种章节名只是字面不含界面词，LLM 被拦住后大概率改成"准备界面" 凑字过校验，分类逻辑仍然是按 stage 切的——头痛医头。

根因是 LLM 在 phase2 写 markdown 时**没有显式做过"分类决策"**：界面有哪些、每个界面上有哪些功能模块、策划稿的每条规则归属哪个 (界面, 模块) 单元格。这一步缺失导致 LLM 默认按策划稿的叙述结构（多为时间流程）平推过来。

## What Changes

- **新增 phase2 前置步骤**（"Step 0"），LLM 写完整 Markdown **之前** 必须依次完成：
  - **0.1 界面清单**：LLM 列出"本需求涉及的界面/场景态"清单（含每个界面的简短功能定位），输出给用户审核确认/补充
  - **0.2 功能模块清单**：对每个已确认的界面，LLM 列出该界面上玩家能识别的"功能模块/信息块"清单，输出给用户审核
  - **0.3 规则归位映射**：LLM 拿策划稿每条规则尝试归位到某个 (界面, 模块) 二元组；归位不上的规则 flag 出来跟用户确认是否漏界面/模块或属于跨界面的全局规则
  - **0.4 用户最终确认**：用户对整套 (界面 ↔ 章节 ↔ 模块 ↔ 簇) 的分类决策给出 OK，phase2 才允许进入"写完整 Markdown" 步骤
- **修订 phase2-markdown.md 文档**：解决 L30 ("###命名是该功能/组件的名字") 与 L96 ("###名字用语义动词短语") 的长期矛盾，统一表述为"###命名 = 界面上可识别的功能模块/信息块名词；行为单元可用 xxx 行为/xxx 流程"
- **新增 markdown-v2-contract 强校验 S3**（hard error）：`## NN. [章节名]` 必须满足下列任一：(a) 含界面关键词清单 (`界面/面板/页/窗/卡/弹窗/弹层/区/条/栏/区域/版/入口/反馈/...`)；(b) 命中"全局规范"白名单 (`全局/规范/组件/汇总/流程/结算`)。否则 `H_SECTION_NOT_INTERFACE`
- **新增 markdown-v2-contract 软警告 W6**（warning, 不阻塞）：`###` / `####` 命名应为名词性界面信息块或行为单元，避免规则属性后缀。禁词后缀清单：`时机/规则/层级/限制/边界/兼容/表现`。命中 → `W_CLUSTER_NAME_LOOKS_RULE`
- **将现有 W2 软约束（"显示规则/操作规则/反馈表现/异常与边界"死分类禁词）正式纳入主 spec**——现状它只在 skill `markdown-v2-spec.md` 软提示，未在 OpenSpec 主 spec 落地
- **多态拆分指南**（指引段，非强校验）：两态间功能模块差异 ≥ 2-3 → 拆 2 章节；否则合 1 章节用簇/####/对比图表达多态
- **Step 0 在 phase2 自检清单中显式列出**：用户审核 Markdown 时，原先的 self-check 条目前置加 4 条 (0.1-0.4)

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `markdown-v2-contract`: ADDED 3 个新 Requirement（章节命名 S3、簇/子组命名 W6、原 W2 死分类禁词落 spec）；ADDED 1 个 "多态拆分指南" 指引条款
- `skill-sop-workflow`（新建该 capability 主 spec 库）: ADDED "phase2 前置分类决策步骤" Requirement——这是 skill 流程的契约首次落 spec，过去仅在 `packages/skill/phases/phase2-markdown.md` 文档存在

## Impact

- **代码（极少）**
  - `packages/engine/src/v2/parser.ts` 与 `ir.ts`：新增错误码 `H_SECTION_NOT_INTERFACE`、`W_CLUSTER_NAME_LOOKS_RULE`，在 parser 阶段做章节名 / 簇名匹配
  - 不涉及 render.ts、template-map.ts、figma-mcp-server 等
- **skill 文档（主要工作量）**
  - `packages/skill/phases/phase2-markdown.md`：插入 Step 0（约 60-80 行）；修订 L30/L96 矛盾；自检清单前置加 4 条
  - `packages/skill/references/markdown-v2-spec.md`：扩 W2 禁词、新增 S3/W6 条目，跟主 spec 同步
  - `packages/skill/SKILL.md`：phase2 入口段补一句"先做分类决策再写 Markdown"
- **测试**
  - `packages/engine/tests/fixtures/`：新增 1-2 个故意违反 S3/W6 的 fixture，断言 parser 报 H_SECTION_NOT_INTERFACE / W_CLUSTER_NAME_LOOKS_RULE
  - 现有 fixtures 全部跑通确认无 regression
- **OpenSpec 主 spec**
  - `openspec/specs/markdown-v2-contract/spec.md`：archive 时通过 ADDED Requirement 自动扩 3 条
  - 新建 `openspec/specs/skill-sop-workflow/spec.md`（如果走 New Capability 路线）或并入 markdown-v2-contract（如果走收编路线）
- **历史产出**
  - 已交付 markdown 文档不强制迁移；下次基于旧文档改动时 W6 持续 warn（用户已在 explore 阶段确认"已产出的不管"）
- **LLM 提示词**
  - 不直接改 LLM prompt（不在仓库范围），但 skill 文档变更后下次 install-skill 会同步到 `~/.codemaker/skills/`，LLM 读 SKILL.md 时自然加载新流程
- **兼容性**
  - **不破坏** 旧文档解析路径：S3 是新 hard error，旧文档不含违规则不报；W6 仅 warn
  - 旧文档触发 S3 时需要改章节名才能 archive 进新主 spec；本 change 不主动迁移
