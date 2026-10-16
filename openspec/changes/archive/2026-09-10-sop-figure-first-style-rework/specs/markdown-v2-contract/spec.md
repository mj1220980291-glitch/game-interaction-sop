## ADDED Requirements

> 说明：本批 Requirement 均为 **LLM 转写层规则**，约束 skill（`packages/skill/references/markdown-v2-spec.md`）指导下的 Markdown 生成行为与 Phase 2 自检。引擎 parser SHALL NOT 为此新增 hard error / soft warning 校验码；机器可读契约（文件头/章节/簇/角色行/分组）保持不变。

### Requirement: bullet 粒度为完整行为叙述而非原子规则

v2 Markdown 的簇内 bullet SHALL 以"一条 bullet = 一个完整行为叙述"为粒度：同一控件的常规规则可合并为一条含多动作串联的流畅叙述；需要强调、有风险、或需要执行角色特别注意的点 SHALL 独立成条。

本规则取代 skill 侧 `markdown-v2-spec.md` 原 W4"bullet 原子化：长复合规则拆多条"的表述。skill 侧文件与主 spec SHALL 同步反映本规则（受"skill 文档与 OpenSpec 主 spec 双向一致"既有 Requirement 约束）。

#### Scenario: 常规操作规则合并为一条

- **WHEN** 策划稿写"四键移动 / Shift 加速 / 空格跳 / 鼠标转视角"四条独立规则，均属角色移动控件
- **THEN** 产出的簇 SHALL 合并为一条 bullet（如"W/A/S/D 四键移动角色，按住 Shift 加速跑，按空格跳，滑动鼠标转动镜头视角"），而非四条原子 bullet

#### Scenario: 强调点独立成条

- **WHEN** 某控件存在需要执行角色特别注意的行为细节（如"呼出动作条时光标需从当前选中动作位置出现"）
- **THEN** 该细节 SHALL 独立成一条 bullet，不合并进常规叙述

### Requirement: 图上不可见的内容不进簇

簇内容 SHALL 仅包含在章节主图上有可指认 UI 锚点的规则。下列内容 SHALL NOT 写入簇：

- 纯服务端规则且无 UI 表现（持续时间、解除条件、并发裁决等由服务端控制、界面仅同步结果的规则——如需说明可在设计总览一句话带过）
- 纯环境演出（雾效切换、天空盒切换、落地烟花等无控件可指的演出）
- 预留不开发的交互
- 开关 / 状态的反面显然陈述（"关闭时不铺底色"这类与正面陈述互为镜像的内容）

丢弃决策的产生与用户确认流程由 skill-sop-workflow 的 Step 0.3"归位 + 显式丢弃清单"承载，本规则约束最终写入 Markdown 的内容边界。

#### Scenario: 服务端规则不进簇

- **WHEN** 策划稿写"泡泡持续时间等数值由服务端控制"且界面上无对应可见控件
- **THEN** 产出的 Markdown SHALL NOT 包含该规则的簇或 bullet

#### Scenario: 反面陈述不进簇

- **WHEN** 设置开关已正面陈述"开启时进入绘制画面自动铺底色"
- **THEN** 产出的 Markdown SHALL NOT 再写"关闭时保持当前颜色，不铺底色"的镜像 bullet

### Requirement: 同一控件的规则跨簇归位合并

同一 UI 控件的规则 SHALL 集中在该控件所属的一个簇内，不得按策划稿的段落结构分裂到多个簇。策划稿中分散在不同段落但指向同一控件的规则，转写时 SHALL 归位合并。

#### Scenario: 技能规则归位到技能按钮簇

- **WHEN** 策划稿在"操作方式"段写"F 键释放换色冲刺技能，有独立冷却"，在"HUD 说明"段写"右下技能占位按钮显示冷却状态"
- **THEN** 产出的 Markdown SHALL 把两处规则合并进"技能占位按钮"一个簇，而非分裂为"口哨与技能"与"技能占位按钮"两簇

### Requirement: 术语跟随设计稿实际文案

Markdown 中的控件名 / 状态名 SHALL 优先采用设计稿（草稿、截图、Figma 成品）上实际出现的文案，而非策划稿内部术语或 LLM 自造术语。两者冲突时以设计稿为准。

#### Scenario: 徽章名称以设计稿为准

- **WHEN** 策划稿称"警官蛋徽章"，设计稿图上的实际文案为"治安官"
- **THEN** 产出的 Markdown SHALL 使用"治安官"

#### Scenario: 控件通用名以设计稿为准

- **WHEN** LLM 惯用内部术语"pill 按钮"，但设计稿标注为"按钮"
- **THEN** 产出的 Markdown SHALL 使用设计稿的"按钮"表述

### Requirement: UI 反馈补全为 Phase 2 输出自检项

LLM 在 Phase 2 写每个控件簇时 SHALL 自检："该操作 / 状态有没有可见反馈？"策划稿未写明反馈时，LLM SHALL 按交互常识补一条反馈描述（toast / 浮显 / 高亮 / 音效等），以正常陈述语气写入 bullet，SHALL NOT 附加"待确认"类标记。

本规则不依赖 Phase 1 提问挖掘——反馈补全是转写完整性的一部分，属设计师职责范围内的主动拍板。

#### Scenario: 持续状态补 toast 提示

- **WHEN** 策划稿写"按住左键进入锁定朝向"但未写锁定期间的界面提示
- **THEN** 产出的 bullet SHALL 主动补充可见反馈（如"按住期间顶部显示 toast 提示'朝向锁定中…'"），且不带待确认标记

#### Scenario: 反馈已在策划稿写明

- **WHEN** 策划稿已明确写"落地触发烟花特效"且该特效在图上有可见表现
- **THEN** LLM SHALL 直接转写，不重复补充其他反馈
