---
name: game-interaction-sop
description: "游戏交互需求 → 交互文档的完整 SOP。使用场景：用户给设计稿 / Figma 链接 / 策划文档（任意格式）/ 截图 / 口头需求，希望产出可交付的游戏交互文档，最终落到 Figma 模板内。第一阶段先索要设计稿（无图才转策划文档）。本 skill 串联四个阶段：(1)需求挖掘 (2)v2 Markdown 生成 (3)配图资产 (4)调引擎写入 Figma 并做配图审计。覆盖关键词：梳理/分析/拆解/澄清/理解 游戏交互需求；输出/生成/整理/写入 交互文档；按模板输出；战斗/准备/商店/卡牌/资源/状态/反馈 交互需求。"
---

# Game Interaction SOP

游戏交互需求挖掘 → 交付级 Figma 交互文档的端到端 SOP。

## Preflight — 开场版本自检（每次会话首轮必做）

进入 Phase 0 之前，先确认 skill 与引擎的版本契约是否对齐。

### 步骤

1. **读本地 skill manifest**
   读 `<skill 安装目录>/manifest.json`（通常是 `~/.codemaker/skills/game-interaction-sop/manifest.json` 或 `~/.claude/skills/...` 等，按 agent 类型定位），取 `version` 作为 `skillVersion`。
2. **问引擎要最低要求**
   调用 MCP 工具 `figma-interaction-doc-engine.get_skill_requirements`（无入参），返回 `{ requiredSkillVersion, engineVersion }`。
3. **比对**
   以 semver 比较 `skillVersion` vs `requiredSkillVersion`：
   - `skillVersion >= requiredSkillVersion` → 静默通过，继续 Phase 0
   - `skillVersion < requiredSkillVersion` → 输出下面的升级提示（**软警告，不阻断**），用户确认后继续 Phase 0

### 升级提示文案

当版本落后时，向用户输出：

> ⚠️ 你的 skill 版本非最新（当前 `{skillVersion}`，要求 ≥ `{requiredSkillVersion}`），**无法应用最新的 style 文风功能**（默认文风缺 `role_annotation` / `wording` 等 frontmatter 字段，职能标注拆分不会自动触发）。
>
> 升级命令（在 game-interaction-sop 仓库根目录运行）：
> ```
> git pull
> cd packages/figma-mcp-server && npm install && npm run build
> cd ../.. && npm run install-skill -- --agent <codemaker|claude|cursor|cline> --force
> ```
>
> CodeMaker 用户还需在 MCP 面板里把 `figma-interaction-doc-engine` 禁用再启用。
>
> 本会话会继续运行，但产出可能缺少文风强约束。建议升级后重开会话。

### 失败退化

- `get_skill_requirements` 调用失败（如引擎版本 < 0.3.0 还没这个工具） → 判定为**引擎老于 skill**，输出一句提示：「引擎版本较旧（缺 `get_skill_requirements`），建议同步升级引擎到 ≥ 0.3.0」。然后静默继续 Phase 0。
- 本地 `manifest.json` 读不到 → 提示用户 skill 安装路径可能异常，让用户手动跑一次 `npm run install-skill ... --force`。然后继续 Phase 0。

### 不做什么

- Preflight **只软警告，不阻断**，不替用户执行升级命令
- Preflight 的提示文案只出现一次，用户已主动跳过时后续回合不再重复
- 本步骤完成后立即进入 Phase 0；不要在 Preflight 阶段读策划文档、问需求

---

## 何时启用本 skill

用户给出以下任一信号时启用：

- 给一份设计稿 / Figma 链接 / 策划文档 / UI 截图 / 语义模糊的功能需求，请你"梳理 / 分析 / 拆解 / 理解 / 看看这个需求"
- 要求"输出/生成/整理/写入 交互文档"
- 要求"按模板输出"或"写到 Figma 交互稿"
- 要求"检查配图齐不齐 / 提醒我补图"（走 Phase 4 配图审计）

---

## 完整 SOP（4 个 Phase + 2 个辅助阶段）

```
[Phase 0 — 翻库咨询（内嵌，不独立成回合）]
   启动检查 → 读项目模式库 → 检索命中 → 对比新需求 → 嵌入 Phase 1 第一回合
   无模式库时静默退化，Phase 1 行为与旧版完全一致
   细则：phases/phase0-recall.md
        ↓（嵌入）
[Phase 1 — 需求挖掘]
   开场先问有没有设计稿（图 / Figma 链接）
   有图 → 路径A 以图提问；没图 → 路径B 策划文档，可提议画草稿
   读材料 → 复述理解 → 翻库咨询结果（若有）→ 1-3 问/轮 → 直到信息可用
   有图时必须逐帧截图核对 → 产出帧清单
   收尾：完成声明落盘 + validate_phase1_signoff 返回 ok（Phase 2 硬门禁）
   细则：phases/phase1-analysis.md
        ↓
[Phase 2 — v2 Markdown]
   先做分类决策（界面清单锚定图清单 → 模块清单 → 规则归位+丢弃清单 → 用户确认）
   再按 v2 格式产出 Markdown → 用户审核 → 用户确认 → 保存到磁盘
   细则：phases/phase2-markdown.md（含 Step 0 分类决策必经路径）
   规范：references/markdown-v2-spec.md（含转写文体规范 T1–T5）
        ↓
[Phase 3 — 设计稿 / 配图资产确认]
   路径A：入场图已在手 → 确认可作主图 / 补高清图 / 跳过
   路径B：Phase 1 没拿到图 → 写入前再要一次（图片 / Figma 链接 / 跳过）
   配图：把 Phase 2 已写好的 `配图：` 条目映射成 asset_map（不再问"要不要配图"）
   细则：phases/phase3-asset.md
        ↓
[Phase 4 — 写 Figma]
   读项目模板配置 → preflight（跨文件一律 componentKey）→ 调用 figma-interaction-doc-engine 写入模板
   → 逐章截图核对标号 + 配图审计 → 缺图清单 + 提醒用户手动配图（不拦交付）
   细则：phases/phase4-figma.md
   模板映射：references/template-1-14.md（含模板排查表）
   角色色板：references/role-tags.md
        ↓
[Phase 5 — 文风沉淀（交付收口，默认触发）]
   md 改动：快照 diff → 提炼 style 条目 → 列清单确认 → 写本次生效的文风文件
   Figma 改动：主动索要最新文档 → 读回文本 → 自己总结表达习惯
   细则：phases/phase5-style-learn.md
   契约：references/style-mod-schema.md
        ↓
[Phase 6 — 模式库维护（增量，默认自动触发）]
   Phase 5 完成后按风险分级维护项目模式库
   显式触发时：冷启动批量提取（扫历史交互文档建库）
   细则：phases/phase6-extract.md
   Schema：references/pattern-schema.md / index-schema.md / deviation-schema.md
```

---

## Phase 切换规则（必读）

每个 Phase 都有**进入条件**和**完成条件**。LLM 必须显式告诉用户当前在哪一 Phase，不要默默推进。

| Phase | 进入条件 | 完成条件 | 失败回退 |
|---|---|---|---|
| 0. 翻库（内嵌） | Phase 1 启动时自动执行 | 检索完成（无论命中与否），输出嵌入 Phase 1 | 无库 / 低分 → 静默退化 |
| 1. 分析 | 用户给出需求（**开场先索要设计稿**：有图走路径A / 没图走路径B 策划文档，可提议画草稿） | 4 维度全满（可调参数 / 差异领域 / 业务专属 / 冲突清零）+ **完成声明落盘且 `validate_phase1_signoff` 返回 ok** + **有图时逐帧截图核对过**；路径已确定 | 缺关键决策或冲突未决 → 继续 Q&A |
| 2. Markdown | Phase 1 完成**且完成声明校验通过**（硬门禁） | 用户确认"可以保存"，文件写入磁盘 + 落 diff 快照；**Step 0.1 界面清单锚定图清单（一图一章，禁流程章）** | 声明未过 → 回 Phase 1；Markdown 不通过 v2 强校验 → 修正后重输 |
| 3. 设计稿 / 配图资产确认 | Phase 2 已保存 | 路径A：入场图确认可作主图 / 补高清图 / 显式跳过；路径B：用户提供链接/图片，或显式说"跳过"；Phase 2 写好的 `配图：` 条目已映射成 asset_map；标号锚点已确认（文本锚点优先） | 用户暂时没有 → 用占位走 Phase 4，后续再补 |
| 4. 写 Figma | Phase 3 完成 | 引擎返回成功，**逐章截图核对标号 + 收尾断言（含标号齐 / 锚点已生效）全过**，用户在 Figma 看到结果 | 引擎报错 → 修正 Markdown 或设计稿后重跑；同步被拒 → 先试 adopt（`componentKey` / `forceReconcile`） |
| 5. 文风沉淀 | Phase 4 完成后默认触发 | 两个入口都问过（md 改动清单 / Figma 表述有无线索），用户确认或拒绝，需写入的已写入本次生效的文风文件，快照已刷新 | 用户说"不用沉淀" → 跳过，直接进 Phase 6 |
| 6. 维护库（增量） | Phase 5 完成后默认触发 | 增量操作完成（含日志写入）或用户跳过 | 写盘失败 → 暂停等用户处理 |

**严禁跨 Phase**：Phase 1 没完不准产出 Markdown；**没有 `validate_phase1_signoff → ok:true` 不准进 Phase 2**；Markdown 没保存不准做 Phase 3 的资产映射；设计稿没拿到（或显式跳过）不准调引擎；**需求来自 Figma/截图而没逐帧截图核对，不准成文**。Phase 1 索要设计稿只是**取材提问**，不等于 Phase 3 的资产确认（主图 / 配图映射仍按 Phase 3 做）。

---

## 项目级配置（可选，都是零负担）

项目根下两个文件，缺省即用官方默认，不阻塞任何 Phase：

| 文件 | 作用 | 谁读 |
|---|---|---|
| `.interaction-sop/template.json` | 指定本项目的 Figma 模板地址 `{template:{fileKey,nodeId}}`，可加 `roleBlock.componentSetId` | Phase 4 preflight |
| `.interaction-sop/style.md` | 项目默认文风基线，**只读**；既无 `style_own.md` 也无 `style_<name>.md` 时用它 | Phase 1 读，Phase 2 用 |
| `references/style-default.md`（skill 内置） | 出厂默认文风；项目里一个 `style*.md` 都没有时**直接加载它**，零配置即生效。**2.3.2 起 frontmatter 带 `role_annotation.mode: selective` / `wording.banned`，职能标注会自动按清单拆分** | Phase 1 读，Phase 2 用 |
| `.interaction-sop/style_own.md` | 个人文风，Phase 5 的自动沉淀目标；存在即默认生效 | 同上 |
| `.interaction-sop/style_<name>.md` | 他人 / 分享 / 导入的文风；存在任意一份时，**每次写文档前询问用哪份** | 同上 |
| `.interaction-sop/snapshots/<需求名>.md` | Phase 2 保存时的 Markdown 原稿，只作 Phase 5 diff 基线，同名覆盖 | Phase 5 |

- 模板只换地址不换结构，节点名须与 `references/template-1-14.md` 一致
- **库引用模式**：模板与「职能标记」发布到组件库后，填 `template.componentKey` + `roleBlock.variantKeys`，任意能访问该库的 Figma 文件都能生成，目标文件不需要预先放模板
- **主图用 `figma_instance`**：放的是母版/粘贴子版的真实实例（等比缩放居中、删除占位），不是栅格图片
- `- @职能：正文` 条目渲染成「职能标记」组件实例；模板没配组件集时引擎报 `V2_ROLE_BLOCK_UNAVAILABLE`
- 文风 mod 契约见 `references/style-mod-schema.md`（含文件选择顺序、导入/分享）；**唯一沉淀出口是 Phase 5**，Phase 2 / Phase 4 中途不追问；`style.md` 只读不写，存在 `style_<name>.md` 时每份文档先问用哪份
- **零配置默认文风**：项目里没有任何 `style*.md` 时，加载 skill 自带的 `references/style-default.md`（随 skill 分发，不需要安装脚本往项目里写文件），保证新用户开箱即用

---

## 全局原则（贯穿所有 Phase）

### 母版放子版

- 用户给的设计稿是 Figma 母版（`COMPONENT` / `INSTANCE` / `COMPONENT_SET`）时，主图**必须**用 `figma_instance` 放**真实子版实例**，禁止栅格化成图片（`image`）或复制节点（`figma_node`）
- `COMPONENT_SET` 必须先选定具体变体 nodeId 再传；源节点不在目标文件时，先让用户把母版移入
- 只有用户明确要求"就贴图"才允许 `image` / `figma_node`，并在复述里写明破例原因

### Figma 连接失败

- 读不到文件 / 渲染报 `V2_BACKEND_UNAVAILABLE`、`V2_TARGET_FILE_UNREACHABLE` 时，**优先**让用户在目标文件里启动社区插件 `https://www.figma.com/community/plugin/1695400514520991057`（**网页端即可启动，不需要客户端**）
- 起不来才回退本地 Desktop Bridge；两条都不通就停下等用户，不改 Markdown、不降级贴图

### Anti-Contamination

- 不要把过往任务（卡牌/资源/战斗）的设定带进新需求
- 不要预设需求类型，用现实输入分类
- 仅当输入支持时再做推断

### 提问纪律

- 每轮 ≤ 3 个问题；问最影响交互文档落地的问题
- 用户答完后先把答案变成`已确认`再继续问
- 已被模式骨架锁定的决策不再重复追问
- 问够即停，不追求穷尽

### 项目库优先

- Phase 1 开口前先执行 Phase 0 检索，见 `phases/phase0-recall.md`
- 项目库（`.interaction-sop/`）的内容完全由项目方维护，skill 仓库只携带 schema 与流程协议，不携带任何具体模式数据
- 无项目库时 SOP 退化为原版，零负担，零报错

### 交付纪律（实战沉淀，动手前先读 `references/anti-patterns.md`）

- **md 单一来源**：渲染 / 同步时 `markdown` 必须是磁盘文件的原文（现读现传）。要改内容先改文件，禁止「只改参数里的 md」——参数与文件不一致会导致同步误删条目、连带丢配图
- **实测优先于推断**：说「修好了 / 还是坏的」必须配节点 id + 断言数值；报缺陷按「观测原文 → 影响 → 推测（标明未验证）」三段写，不要把推测写成结论
- **破坏性验证只碰沙盒**：删条目 / 删槽 / 改结构类验证一律在测试 page 或测试文档上做；正式交付稿只做增量，且先记下要动的节点 id

### 一句话主义

- 引擎能做的事不写在 skill 里
- Figma MCP 的坐标系/auto-layout 陷阱、Group bbox 爆炸、撤销栈风险等技术细节**全部由 figma-interaction-doc-engine 处理**
- 本 skill 仅描述"做什么"，不描述"怎么调 MCP"
- 项目库的具体内容（模式、偏离、术语）不归 skill 管，仅由 schema 约束格式

---

## 输出契约

| Phase | 输出物 | 落地位置 |
|---|---|---|
| 0 | 无独立输出（嵌入 Phase 1 第一回合） | 仅对话 |
| 1 | 先确认有没有设计稿 → 入场路径判定（A 图先行 / B 策划文档先行）+ 对话内的`已确认 / 待确认`列表 + 帧清单（有图时）+ `.interaction-sop/phase1-signoff.json` | 仅对话；声明落盘 |
| 2 | v2 Markdown 文件 | 默认与策划文档同目录，`[需求名]_交互文档.md` |
| 3 | 路径A：入场图确认/补高清图/"跳过"；路径B：用户提供的图片/链接/"跳过" | 仅 Phase 4 输入 |
| 4 | Figma 文档 + 配图审计清单（截图核对，缺图时提醒手动补图） | 模板文件（项目配置 > 用户配置 > 官方默认）内新克隆的模板实例 |
| 5 | style 条目清单（对话确认）+ 已更新的本次生效文风文件 + 刷新后的快照 | `.interaction-sop/style_own.md`（或本次选中的 `style_<name>.md`）/ `snapshots/<需求名>.md` |
| 6 | 模式文件 / 索引更新 / 偏离记录 / 维护日志 | `.interaction-sop/patterns/*.md` / `index.md` / `deviations.md` / `maintenance.log` |

---

## 文件索引

**Phase 文件**（按 SOP 顺序阅读）：
- `phases/phase0-recall.md` — 翻库咨询：8 步检索流程、打分公式、输出模板、退化路径
- `phases/phase1-analysis.md` — 需求挖掘细则、**入场材料识别（双入口）**、提问类型、分类法、采用契约、撤销机制
- `phases/phase2-markdown.md` — v2 Markdown 生成、保存、强校验；**Step 0 分类决策（界面清单锚定图、规则归位+丢弃清单）**
- `phases/phase3-asset.md` — 设计稿 / 配图资产确认的话术与边界（含 `配图：` 条目映射）；**路径A 退化模式（入场图已在手）**
- `phases/phase4-figma.md` — 调用 `figma-interaction-doc-engine` 的契约
- `phases/phase5-style-learn.md` — 文风沉淀：快照 diff、style 条目提炼、清单确认、Figma 表述读回、写入 style_own
- `phases/phase6-extract.md` — 模式库冷启动提取、增量维护、9 条硬规则、用户 override

**规范文件**（需要细节时查阅）：
- `references/anti-patterns.md` — **反模式清单**：8 条实战踩坑（手写 md 漂移 / 推测当结论 / 破坏性验证碰正式稿 / GROUP 坐标按局部算 / 低分辨率硬填 / 模板包改错文件 / 端口问题靠重启 / 结论不落数据），每条含自检问题与收尾断言脚本
- `references/markdown-v2-spec.md` — v2 格式权威规范（机器可读契约 + **转写文体规范 T1–T5**）
- `references/pattern-schema.md` — 项目模式条目格式契约（schema_version: 1）
- `references/index-schema.md` — 项目库索引文件格式契约（含 glossary）
- `references/deviation-schema.md` — 规范偏离记录格式契约
- `references/template-1-14.md` — Figma 模板节点 ID 映射表（含可配地址、「职能标记」组件集）
- `references/role-tags.md` — 7 角色定义、颜色、模板节点对应
- `references/style-mod-schema.md` — 项目文风 mod 契约（精简度 / @职能 策略 / 用词）
- `references/style-default.md` — 默认文风文件（簇结构约定 + 职能标注 + **2.3.2 起带 role_annotation / wording / verbosity frontmatter**），新建项目 `style.md` 时直接复制

阅读顺序建议：先读本 SKILL.md → 进入对应 Phase 时读对应 phase 文件 → 需要细节时查 references。
