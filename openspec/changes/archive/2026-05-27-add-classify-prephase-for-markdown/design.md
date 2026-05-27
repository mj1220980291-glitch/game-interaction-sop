## Context

当前 SOP 写 v2 Markdown 的流程（`packages/skill/phases/phase2-markdown.md`）：

```
phase1 → phase2 一上来直接出完整 Markdown → 用户审核 → 保存
```

phase2 自检清单虽含 "###命名是该功能/组件的名字（如经验条/一键领取按钮），不是规则属性（如显示规则/动效表现/异常与边界）"（L30），但同一文档 L96 又说 "###名字用语义动词短语描述这组规则在解决什么（如入口规则/选中与hover区分/显示位置与层级）"——**两条互相打架**：

- L30 推名词风格（功能/组件名）
- L96 推动词短语 + 抽象规则名

LLM 读到两套引导时倾向走 L96（动词短语更接近策划稿描述方式），结果产出与用户期望的"按界面/功能模块" 分类有系统性偏差。

### 实测案例：选秀环节交互文档

| 维度 | 实际产出 | 期望（M1 模板） |
|---|---|---|
| 章节 | "准备环节 / 私密选择环节 / 卡牌交换环节"（3 个流程时段） | "部从选中与入口 / 主TIPS固定显示版 / 基础信息与能力描述 / ..."（7 个界面+功能模块）|
| 簇 | "触发与传送 / 候选下发 / 二选一交互 / 结算返回"（动作过程动词）| "入口规则 / 显示位置与隐藏 / 基础信息 / 属性概览"（界面信息块名词）|
| 颗粒度 | 章节数 ≈ 流程阶段数 | 章节数 ≈ 涉及界面数（更细）|

### 根因诊断

LLM 在 phase2 **没有显式做过"分类决策"**：
- 没主动列"本需求涉及哪些界面/场景态"
- 没主动列"每个界面有哪些功能模块"
- 没主动做"策划稿规则 → (界面, 模块) 归位映射"

因此 LLM 默认按策划稿的叙述结构（多为时间流程：P0→P1→P2→P3）平推过来——叙述维度直接变成章节维度。

### 不能仅靠关键词校验解决

```
仅 S3 (章节含界面词) + W6 (簇禁词后缀) 的局限：

  S3 拦下 "准备环节" → LLM 改成 "准备界面"（凑字过校验，分类逻辑没变）
  W6 不触发 "触发与传送"（不在禁词后缀） → 不警告
  
  → 结果：章节凑字、簇全过，文档结构依然按 stage 切
```

校验是**字面层**防线，决定不了**语义层**分类决策。要修根因必须在 LLM 写 markdown 前**强制走一遍分类决策流程**。

## Goals / Non-Goals

**Goals:**

- LLM 在写 v2 Markdown 之前**强制**完成 4 步分类决策（界面清单 → 功能模块清单 → 规则归位 → 用户确认），把"按界面/功能点"分类从"软引导"提升到"流程必经路径"
- 解决 `phase2-markdown.md` L30 vs L96 的长期矛盾，统一"###命名 = 界面上可识别的功能模块/信息块名词"
- 在 OpenSpec 主 spec 上落地 3 条新校验（S3 hard + W6 soft + 现有 W2 落 spec），作为分类决策的字面兜底
- 历史交付的 markdown 文档不强制迁移，新规则只对未来产出生效
- 不依赖 LLM 推理质量的不确定性——分类决策每一步都有用户确认 checkpoint

**Non-Goals:**

- 不实现"LLM 自动从策划稿提取界面清单"的智能流程——清单由 LLM 列、用户审，不引入新算法
- 不为旧 markdown 文档写自动迁移工具
- 不改变 phase1（需求挖掘）、phase3（设计稿对齐）、phase4（写 Figma）的现有流程
- 不为 W6 的禁词清单建动态扩展机制——清单作为 spec normative 部分静态维护
- 不引入"LLM-as-judge" 跑语义校验
- 不强制要求每个界面都有主图（继续沿用 isGlobalSpec 白名单规则）
- 不引入新 npm 依赖

## Decisions

### 1. Step 0 放在 phase2 还是独立成 phase

**选 phase2 内的 Step 0**，不独立成新 phase。理由：

- 分类决策本质是"写 Markdown 的子任务"，独立成 phase（如 phase1.5 / phase2a）会让 SOP 文件数与心智成本增加
- 现有 phase1（需求挖掘）已涵盖"了解需求 + 列已知/未知"，分类决策放 phase2 衔接更自然
- 进入 phase2 → Step 0 → Step 1(写 markdown) 是同一 phase 内的子步骤，对外仍是"开始写 markdown 文档"这一动作

**Alternatives considered:**
- 独立 phase1.5：心智成本高，文件数增加
- 嵌入 phase1：phase1 范围会膨胀，且 phase1 输出主要是"已确认/待确认" 列表给用户，加分类决策破坏单一职责

### 2. Step 0 是 4 步严格顺序还是允许跳/并行

**严格顺序 + 每步用户确认 checkpoint**，理由：

- 0.2 (功能模块) 依赖 0.1 (界面清单) 的输出
- 0.3 (规则归位) 依赖 0.1 + 0.2 的清单
- 0.4 是终态确认，必须最后
- 用户确认 checkpoint 防止 LLM 一气呵成跑出整套清单后用户来不及逐项审

**Alternatives considered:**
- 一次性输出 4 步给用户审：用户认知负担大，错误叠加难定位
- 允许 0.1 / 0.2 合并：失去界面级颗粒度审核

### 3. Step 0 的输出格式

**结构化 markdown 列表**，不是 JSON 或专用 DSL：

- 0.1 输出：`- 界面名（功能定位短句）`
- 0.2 输出：`- 界面 N → 模块 [a / b / c]`
- 0.3 输出：`- 规则X → 归位到 界面N.模块M` 或 `- 规则Y → ⚠️ 未归位`
- 用户审核时直接在对话里读/改，不需要工具支持

### 4. 章节命名校验 S3 的关键词清单作为 spec 内 normative 列表

**采用 normative 列表 + scenario 显式枚举**，避免列表零散维护：

界面关键词（任一即满足 S3）：
- 主类：界面 / 面板 / 页 / 窗 / 卡 / 弹窗 / 弹层 / 区 / 条 / 栏 / 区域
- 附加（从期望模板实测提取）：版 / 入口 / 反馈

全局规范白名单：
- 全局 / 规范 / 组件 / 汇总 / 流程 / 结算

未来扩展（如出现新游戏类型词）走标准 MODIFIED Requirement 流程。

### 5. W6 禁词后缀清单刻意不含 "反馈" 和 "说明"

避免误伤 #### 子组的常见推荐写法（例 `#### 升级反馈` 是 archived markdown-v2-contract Requirement "簇支持子分类小标题(####)" 里的官方示例）。

W6 禁词后缀（命中即 warning）：
- 时机 / 规则 / 层级 / 限制 / 边界 / 兼容 / 表现

### 6. W6 同时适用于 #### 子组，禁词清单同 ### 一致

#### 子组的命名风格与 ### 簇本质相同（都是命名某个内容块），统一禁词清单减少维护成本。一致性原则。

### 7. "全局规范" 章节例外处理

S3 白名单含 `全局/规范/组件/汇总`，与现有 figma-template-1-14-rendering 的 isGlobalSpec 判断（render 时跳过主图）的关键词重叠。两者保持一致：S3 通过 + isGlobalSpec 命中 → renderer 不强制要主图。

S3 白名单新增的 `流程/结算` 不属于 isGlobalSpec，渲染时仍按普通章节处理（要主图）。

### 8. skill-sop-workflow 是否新建 capability

**新建 capability `skill-sop-workflow`**。理由：

- phase1-4 SOP 流程在 OpenSpec 主 spec 库里**没落地过**（过去仅文档形式）
- 借本 change 把"分类决策步骤"作为该 capability 的首个 Requirement
- 未来 phase1-4 任何流程变更（如新增 phase / 调整顺序）都有合法 spec 容器

**Alternatives considered:**
- 把分类决策塞进 markdown-v2-contract：那是"格式契约"capability，混入流程性 Requirement 会让 capability 单一职责被破坏
- 完全不落主 spec，只改 skill 文档：风险是流程改动没有 OpenSpec 履历，未来谁动了什么不可追

### 9. 校验报错点是 parser 还是 phase2 LLM 自检

**双道防线**：

- **主防线**：phase2 Step 0 流程（语义级，靠用户确认 catch 分类错误）
- **副防线**：parser S3/W6（字面级，catch 最低线偷懒）

不在 phase2 内主动跑 parser 校验——phase2 仍是"LLM 输出 → 用户审核 → 保存" 流程；parser 报错发生在 `validate_v2_markdown` 工具调用时（一般是用户保存后或下游 render 前）。

## Risks / Trade-offs

- [**Step 0 让 LLM 每次都多 3-4 轮交互**] → mitigation: 
  - 0.1 / 0.2 / 0.3 单次输出体积小，每步用户审核成本低（< 1 分钟）
  - 0.3 归位映射对策划稿规则少的小需求可合并到 0.2 输出（不强制单独一轮）
  - 跟"写完整 markdown 后用户重审" 比，前置交互反而总耗时更短（避免大改）

- [**用户跳过 Step 0 直接催 LLM 出 markdown**] → mitigation:
  - phase2-markdown.md 文档中明确"Step 0 是 phase2 的 hard gate；跳过 → 写出来的 markdown 一定错分类"
  - 配合 S3/W6 校验在 parser 层兜底
  - 极端情况用户坚持跳过时 LLM 仍会写 markdown，但 W6 警告会暴露分类问题

- [**S3 关键词清单不全 → 误伤合法用法**] → mitigation:
  - 关键词清单从期望模板实测词反推（"版/入口/反馈/区域" 等都从 M1 模板提取）
  - 兼具"全局规范"白名单作为逃生门（如有需求确实不是 UI 形态可走白名单）
  - 报错信息明确列出当前合法清单 + 修正建议
  - 未来发现误伤通过 MODIFIED Requirement 扩列表

- [**W6 软警告被用户忽略 → 长期沉默劣化**] → mitigation:
  - phase2 自检清单要求"通读 W6 警告并 either 改名 or 在交付时解释为什么忽略"
  - parser 输出 warning 时附带"按你当前命名，下游设计师/程序读到这名字会怎么联想"的解释
  - 周期性 lint 历史文档生成报告（可选附属，本 change 不包含）

- [**多态拆分指南是软规则 → LLM 拍脑袋决定拆/合**] → mitigation:
  - Step 0.1 输出界面清单时，LLM 必须显式标注 "态1/态2 是否拆 → 理由"
  - 用户审核时容易看出拆错
  - 多态拆分边界本身就是语义判断，不强行机械化

- [**phase2-markdown.md L30/L96 矛盾若处理不彻底 → 改完仍有歧义**] → mitigation:
  - 整段重写 L80-100"章节内 ### 拆分启发法"段
  - 与 L30 / 自检清单条目交叉引用同一规则
  - 增加"反例" 段：列举常见错误命名风格

- [**与已 archived markdown-v2-contract spec 的耦合**] → mitigation:
  - 本 change 仅 ADDED 新 Requirement，不 MODIFY 已有 Requirement，互不冲突
  - 已有 8 个 Requirement（章节命名 S1/S2 / 簇 C1/C2 / #### 等）保持不变

- [**新建 skill-sop-workflow capability 与现有 capabilities 边界模糊**] → mitigation:
  - design.md 显式说明 skill-sop-workflow 描述"phase 流程"，markdown-v2-contract 描述"产物格式"，两者正交
  - 任何 phase 内 markdown 格式约束 → markdown-v2-contract
  - 任何 phase 流程顺序 / phase 间衔接 → skill-sop-workflow

## Migration Plan

1. **代码改造**：parser.ts 加 S3/W6 检测 + 错误码；ir.ts 增 enum
2. **skill 文档改造**：phase2-markdown.md 大改（Step 0 + L30/L96 修订 + 自检清单）；markdown-v2-spec.md 跟主 spec 同步
3. **测试补充**：新增 2 个 fixture 验 S3/W6 触发；现有 fixture 跑通无 regression
4. **本地验证**
   - `npm test` 全绿
   - 跑一遍选秀环节需求走 Step 0 → 看 LLM 输出的界面清单 / 模块清单是否接近 M1 期望模板风格
5. **install-skill 同步**
   - `npm run install-skill --agent codemaker -- --force` 把新 phase2-markdown.md 部署到 `~/.codemaker/skills/`（已经走 junction 不需要主动同步）
6. **archive 本 change**
   - ADDED 3 条主 spec 入 `markdown-v2-contract/spec.md`
   - 新建 `openspec/specs/skill-sop-workflow/spec.md`（Step 0 Requirement）

**Rollback**：

- parser 层：revert commit 即可，无数据迁移
- skill 文档：revert + 重新 install-skill
- 主 spec：archive 后回滚需要新 change 走 REMOVED Requirement 流程

## Open Questions

- Step 0.3 "规则归位映射" 在小需求（策划稿规则 < 10 条）时是否值得单独一步？或合并到 0.2？倾向：合并到 0.2 作为可选展开。
- skill-sop-workflow 是否应该把 phase1 / phase3 / phase4 的 Requirement 一次性都写进去？还是只写 phase2 Step 0，留待未来 phase 改动时再扩？倾向：只写 phase2 Step 0，未来 phase 改动时再扩——避免把现状 phase 的 implicit 规则强行 spec 化引入隐性约束变更。
- 是否需要给 0.1 输出的"界面清单" 一个 markdown convention（比如 `# Phase 2 - Step 0.1 界面清单\n- xxx`）让用户更容易引用？倾向：不要，纯对话输出即可，不引入新文件类型。
