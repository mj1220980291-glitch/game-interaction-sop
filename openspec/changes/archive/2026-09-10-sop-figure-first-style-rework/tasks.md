## 1. markdown-v2-contract 双侧同步（转写层规则）

- [x] 1.1 改写 `packages/skill/references/markdown-v2-spec.md`：W4 从"bullet 原子化"改为"完整行为叙述 + 强调项独立"（含两案例风格的正反例）
- [x] 1.2 在同文件新增软约束/写作规范条目：图上不可见内容不进簇（四类判据：纯服务端无 UI 表现 / 纯环境演出 / 预留不开发 / 反面显然陈述），并注明丢弃流程走 Step 0.3
- [x] 1.3 在同文件新增：同一控件规则跨簇归位合并（含"口哨与技能→技能占位按钮"示例）
- [x] 1.4 在同文件新增：术语跟随设计稿实际文案（含"治安官/pill→按钮"示例）
- [x] 1.5 在同文件新增：UI 反馈补全自检（操作/状态无可见反馈时按常识补一条，正常陈述、不加待确认；含 toast"朝向锁定中…"示例）
- [x] 1.6 核对 1.1–1.5 与 delta spec `specs/markdown-v2-contract/spec.md` 的 5 条 ADDED Requirement 一一对应、表述一致（双向一致约束）；确认未引入任何新 parser 校验码描述

## 2. Phase 2 Step 0 重写（结构层）

- [x] 2.1 改写 `packages/skill/phases/phase2-markdown.md` Step 0.1：界面清单每项必须锚定一张可截图的界面态；显式禁止按业务流程切章；簇归属 = 控件出现在哪张图上；无图时每项附"这张图上应能看到什么"文字速写
- [x] 2.2 改写 Step 0.2：模块清单限定为"该图上玩家能用气泡指认的"功能模块
- [x] 2.3 改写 Step 0.3：穷尽归位 → 三分法（✓归位 / ✗丢弃+理由 / ⚠无法判断）；写入四类丢弃判据；强调丢弃不静默、须用户确认可推翻
- [x] 2.4 更新 Step 0.4 终态确认输出模板：纳入丢弃清单确认项
- [x] 2.5 更新 phase2 自检清单：前 4 条 Step 0 条目改新表述（0.1 含"锚定可截图界面态"、0.3 含"丢弃清单已确认"），新增"文档内无待确认/待拍板类行内标记"卫生项及门禁泄漏回退说明

## 3. Phase 1 双入口（入场材料识别）

- [x] 3.1 修改 `packages/skill/phases/phase1-analysis.md`：新增"入场材料识别"段——路径A（有图：以图为骨架提问，策划文档降为规则补充源）/ 路径B（仅策划文档：可主动提议先画一版界面草稿，载体不限由 AI 自行判断，用户确认后汇入路径A；用户拒绝则文字界面态清单继续）
- [x] 3.2 调整 Phase 1 提问纪律：路径A 下不再要求用户描述界面结构，提问聚焦图上控件的规则细节

## 4. Phase 3 退化与 SKILL.md 门禁表

- [x] 4.1 修改 `packages/skill/phases/phase3-asset.md`：新增路径A 退化模式（图已在手 → 只确认主图资产/补充局部图/显式跳过），保留 Phase 编号与门禁位置不变
- [x] 4.2 更新 `packages/skill/SKILL.md`：Phase 门禁表中 Phase 1/3 的进入条件与描述反映双入口；Phase 2 行补"Step 0.1 锚定图清单"；"何时启用"与 SOP 流程图同步微调
- [x] 4.3 检查 SKILL.md 输出契约表与各 phase 文件交叉引用无失效（Phase 3 输出物在路径A 下的表述）

## 5. 验收

- [x] 5.1 通读修改后的 phase1/phase2/phase3/SKILL.md/markdown-v2-spec.md，对照 delta spec 全部 Requirement+Scenario 逐条核验可达成
- [x] 5.2 回归确认：markdown-v2-spec.md 的机器契约部分（文件头/章节/簇/角色行/#### 分组/校验码表）未被改动；`packages/figma-mcp-server` 无任何文件变更
- [x] 5.3 用十一案例做一次桌面推演：以改后 skill 规则重走 Step 0.1–0.3（策划稿按流程分节），验证产出章节=界面态、押送/雾效/落地烟花进丢弃清单、逮捕按钮归 01 章
- [x] 5.4 运行 `npm run install-skill -- --agent codemaker --dry-run` 确认 skill 打包路径无遗漏文件
