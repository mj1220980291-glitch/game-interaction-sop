## Why

SOP 当前产出的 v2 Markdown 与设计师真实终稿之间改动量过大，两个真实案例（十一主城联动玩法、变色龙躲藏者）逐段 diff 暴露两层系统性偏差：

1. **结构层**：章节按"业务流程"切（如"泡泡抓捕场景"），而设计师终稿按"主图"切（一章 = 一张可截图的界面态，簇归属由控件出现在哪张图上决定）。流程型策划稿入场时，Step 0 产出的章节骨架几乎必然被推翻重组。
2. **转写层**：`markdown-v2-spec.md` 的 W4"bullet 原子化"与设计师实际文体（一条 bullet = 一个完整行为叙述）直接冲突；Step 0.3"穷尽归位"导向把图上不可见的内容（服务端规则、纯演出、预留交互、开关反面）也收进簇，设计师终稿一律删除。

此外，Phase 1→2→3 的顺序假定"策划文档先行"，但实际工作中大部分场景是**图先行**（草稿/截图/设计稿已在手），策划文档只是规则文本的补充来源。

## What Changes

- **Phase 门禁双入口**：SKILL.md Phase 表支持两条入场路径——路径A（图先行，主流）：有图入场时章节清单 = 图清单；路径B（策划文档先行）：AI 先产出一版草稿（载体不限：Figma 低保真 / HTML demo / 文字界面态速写，由 AI 自行判断），用户确认草稿后汇入路径A。路径B 的草稿载体不在 skill 中做详细规定，仅保留可能性。
- **Step 0.1 重写**：界面清单必须锚定"一张可截图的界面态"，禁止流程章；簇归属规则改为"控件出现在哪张图上"。
- **Step 0.3 改向**：从"穷尽归位每条策划稿规则"改为"归位 + 显式丢弃清单"——图上不可见的规则（纯服务端、无 UI 表现、纯演出、预留交互、开关反面）标记"不可见，丢弃"交用户确认，不进簇。
- **W4 重写**：从"bullet 原子化"改为"一条 bullet = 一个完整行为叙述；需要强调/有风险的点独立成条"。
- **新增转写规范**：术语跟随设计稿实际文案；同控件跨簇规则归位合并。
- **新增 UI 反馈补全自检**：每个控件簇输出前自问"该操作/状态有无可见反馈"，策划稿未写时按常识补一条（toast/浮显/高亮/音效），正常陈述，不加待确认标记。
- **Phase 2 自检清单补一条**：文档内不得出现"待确认/待拍板"类行内标记（出现即说明 Phase 1 冲突清零门禁被绕过，回退处理）。
- **Phase 3 简化**：路径A 下设计稿已在手，Phase 3 退化为收集高清资产/贴图，话术简化。
- **Phase 1 入场材料识别**：有图时以图为骨架提问，策划文档降为规则补充源。
- **引擎不改**：S3 白名单保留"场景"关键词（章节名"XX场景"本身不违规，违规的是按流程切章，由 skill 层 Step 0.1 约束）。
- **L3 设计增值层不修**：角色喊话句、设计 rationale、类比锚定、（待设计）后缀等属设计师脑内知识，难以通过提问挖出，保留人为补充。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `skill-sop-workflow`：Phase 门禁表新增双入口路径；Phase 1 入场材料识别规则；Step 0.1 界面清单锚定"可截图界面态"并禁止流程章；Step 0.3 改为"归位 + 显式丢弃清单"；Phase 2 自检清单新增"无待确认行内标记"；Phase 3 在路径A 下退化为资产收集。
- `markdown-v2-contract`：W4 bullet 粒度规则重写（原子化 → 完整行为叙述）；新增"图上不可见内容不进簇"转写规则；新增"术语跟设计稿实际文案"规则；新增"同控件跨簇归位合并"规则；新增"UI 反馈补全"自检要求。注意：本 capability 的 skill 侧文件（`references/markdown-v2-spec.md`）与 OpenSpec 主 spec 有双向一致约束，两侧同步修改；引擎 parser 校验逻辑不变（本次改动全部是 LLM 转写层规则，不新增 hard error / soft warning 码）。

## Impact

- `packages/skill/SKILL.md` — Phase 门禁表、Phase 描述
- `packages/skill/phases/phase1-analysis.md` — 入场材料识别、提问骨架
- `packages/skill/phases/phase2-markdown.md` — Step 0.1 / Step 0.3 重写、自检清单
- `packages/skill/phases/phase3-asset.md` — 路径A 退化话术
- `packages/skill/references/markdown-v2-spec.md` — W4 重写、新增转写规则（与主 spec 同步）
- `openspec/specs/markdown-v2-contract/spec.md` — 经 delta spec 同步
- **不影响**：`packages/figma-mcp-server`（引擎代码、parser 校验码、渲染逻辑均不动）
- **不影响**：已产出的历史 v2 Markdown 文档（新规则仅约束 LLM 生成行为，不改机器契约）
