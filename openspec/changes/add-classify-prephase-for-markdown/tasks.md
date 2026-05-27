## 1. 准备与基线

- [x] 1.1 阅读 `packages/skill/phases/phase2-markdown.md` 全文，列出 L30 / L96 矛盾的具体行 + 周边段落，作为修订基线
- [x] 1.2 阅读 `packages/skill/references/markdown-v2-spec.md` 现有 W2 软约束的全部上下文，确定如何精确"升级"到主 spec
- [x] 1.3 跑一遍 `npm test` 确认现状全绿（baseline 11 test files / 118 tests），任何 fix 前后 diff 都基于此

## 2. parser 层加 S3 / W6 / W2-死分类校验

- [x] 2.1 在 `packages/engine/src/v2/ir.ts` 的 `HARD_ERROR_CODES` 新增 `H_SECTION_NOT_INTERFACE: 'V2_H_SECTION_NOT_INTERFACE'`
- [x] 2.2 在 `ir.ts` 的 `SOFT_WARNING_CODES` 新增 `W_CLUSTER_NAME_LOOKS_RULE: 'V2_W_CLUSTER_NAME_LOOKS_RULE'`（W_CLUSTER_NAME_DEAD_CATEGORY 已存在为 W2_DEAD_CATEGORY_CLUSTER_NAME，直接复用）
- [x] 2.3 在 `packages/engine/src/v2/parser.ts` 新增常量 `INTERFACE_KEYWORDS` (15 词，加"场景") + `SECTION_ALLOWLIST_KEYWORDS` (6 词) + `RULE_NAME_FORBIDDEN_SUFFIXES` (7 词)
- [x] 2.4 在 `parser.ts` 解析每个 `## NN.` 章节名时调 `isSectionNameAcceptable(name)`：含任一 INTERFACE_KEYWORDS 或 SECTION_ALLOWLIST_KEYWORDS → 通过；否则 push `H_SECTION_NOT_INTERFACE`
- [x] 2.5 (常量已在 2.3 完成)
- [x] 2.6 在 `parser.ts` 解析每个 `### 簇名` 与 `#### 子分类名` 时调命中检查：DEAD_CATEGORY_NAMES 完全相等 OR endsWith → W2；否则若 endsWith RULE_NAME_FORBIDDEN_SUFFIXES → W6；同时命中只 emit W2
- [x] 2.7 错误信息文本明确：`H_SECTION_NOT_INTERFACE` 列界面关键词清单 + 全局白名单 + 指引去 phase2-markdown.md Step 0；`W_CLUSTER_NAME_*` 给出替代命名建议
- [x] 2.8 typecheck pass：`cd packages/engine && npx tsc -p tsconfig.json --noEmit`

## 3. 测试 fixture

- [x] 3.1 新增 fixture `naming-violation-section.md`：含 `## 01. 准备环节`（无界面词、不在白名单）
- [x] 3.2 新增 fixture `naming-violation-cluster.md`：含 `### 展开 / 收起时机`（W6） + `### 显示规则`（W2） + `### 锁定天书按钮`（合法） + `#### 视觉层级`（W6） + `#### 升级反馈`（合法）
- [x] 3.3 在 `parser.spec.ts` 新增 5 个 it：
  - `'reports H_SECTION_NOT_INTERFACE for stage-style section name'`
  - `'reports W_CLUSTER_NAME_LOOKS_RULE for rule-property suffix on ### cluster'`
  - `'reports W2_DEAD_CATEGORY for legacy dead-category cluster name'`
  - `'W6 also applies to #### sub-group title with rule-property suffix'`
  - `'合法命名不触发 W6 / W2'`
- [x] 3.4 跑 `npm test --workspace packages/engine`，确认新增 5 个测试通过，所有既有测试不 regression
- [x] 3.5 跑 `npm test` 全 workspace 确认仓库全绿 (13 files / 164 tests, +5 from baseline)

## 4. skill 文档改造（核心）

- [x] 4.1 修订 `packages/skill/phases/phase2-markdown.md`：
  - 新增章节 `## Step 0 — 分类决策（写 Markdown 前必经路径）` 在 `## 第一步：在对话里输出完整 Markdown` 之前
  - Step 0 含 0.1 / 0.2 / 0.3 / 0.4 四个子段，每段含"LLM 输出格式" + "用户审核要点" + "通过条件"
  - 明确写出"跳过 Step 0 = 章节/簇分类一定错"作为强约束理由
- [x] 4.2 修订 `phase2-markdown.md` 第一步的自检清单：在原 L21 起的清单**最前面**插入 4 条 Step 0 checkbox（`[ ] 0.1 界面/场景态清单已与用户确认`...）
- [x] 4.3 修订 `phase2-markdown.md` 原 L96 "章节内 ### 拆分启发法" 段：整段重写，统一表述为"`###` 簇名 = 该界面上玩家可识别的功能模块 / 信息块名词；行为单元可用 `xxx 行为` / `xxx 流程` 替代"
- [x] 4.4 修订 `phase2-markdown.md` 原 L30 自检清单条目：统一引用与 L96 修订后的规则一致表述，避免两段互相打架
- [x] 4.5 新增"反例"小段：列举常见错误命名风格（"准备环节 / 触发与传送 / 候选下发" 等），与正例对照

## 5. skill 文档与主 spec 同步

- [x] 5.1 修订 `packages/skill/references/markdown-v2-spec.md`：
  - W2 软约束扩展死分类词清单含 4 个完整词 + 解释
  - 新增 S3 章节命名硬校验段（同步主 spec）
  - 新增 W6 簇/子分类命名软警告段（同步主 spec）
  - 新增多态拆分指南段
- [x] 5.2 修订 `packages/skill/SKILL.md` phase2 入口段：补一句"先做分类决策再写 Markdown（详见 phase2-markdown.md Step 0）"
- [x] 5.3 grep 确认 `packages/skill/` 下没有遗漏的"功能动词短语"等旧引导残留

## 6. 兜底验证

- [x] 6.1 `npm run typecheck` 全工作区 pass
- [x] 6.2 `npm test` 全工作区 pass（13 test files / 164 tests 全绿，新增 5 测试通过）
- [x] 6.3 `npm run build` 全工作区 pass
- [ ] 6.4 手工跑：用选秀环节策划稿走一遍新 phase2 流程，对比 Step 0 输出的"界面 / 模块清单"是否接近 M1 模板风格（user 验证步骤，下次实际跑需求时确认）
- [x] 6.5 `npm run install-skill --agent codemaker -- --force`（junction 已建立，自动同步，验证 phase2-markdown.md SAME）

## 7. 文档与发布

- [ ] 7.1 在 commit 信息引用 OpenSpec change `add-classify-prephase-for-markdown`
- [ ] 7.2 `git commit + git push` 到 gitlab main
- [ ] 7.3 archive 本 change：`openspec archive add-classify-prephase-for-markdown --yes`，确认主 spec 落盘 +3 Requirement (markdown-v2-contract) + 新建 skill-sop-workflow capability
