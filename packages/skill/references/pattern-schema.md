# Pattern Schema — 项目级模式条目格式契约

当前 `schema_version: 1`

本文档是 skill 与项目库之间关于"模式（Pattern）条目"的格式契约。所有存放于项目 `.interaction-sop/patterns/` 目录下的条目文件 **MUST** 遵循本格式。

---

## 文件命名

```
.interaction-sop/patterns/P-<三位数字>.md
```

示例：`P-001.md`、`P-023.md`

ID 全项目唯一，递增分配。

---

## 整体结构

```
YAML frontmatter（--- 包裹）
H1 标题（模式名称）
H2 一句话定位
H2 核心交互逻辑
H2 必复用的核心骨架
H2 通常需要按需求重定的参数
H2 容易需要重新决策的地方
H2 案例对照
H2 偏离历史
```

---

## Frontmatter 字段

### 必填字段

```yaml
---
# 身份
id: P-001                          # 字符串，全库唯一，格式 P-XXX
schema_version: 1                  # 整数，与项目库全套版本一致
type: pattern                      # 固定值
status: active                     # 枚举：active / deprecated / merged_into

# 时间戳
created_at: 2026-06-08             # ISO 日期，YYYY-MM-DD
last_reviewed_at: 2026-06-08       # ISO 日期，每次内容修订后更新

# 案例来源（至少 1 条）
case_files:
  - path: interactions/projects/xxx/02-design/xxx_交互文档.md
    role: base                     # 枚举：base（主要提取来源）/ reference（对照）
    extracted_at: 2026-06-08       # ISO 日期

# 检索字段
domain: 战斗内                     # 自由文本，项目专属业务域
project_terms:                     # 项目专属术语，用于 glossary 识别与 Phase 0 用词
  - 部从
  - TIPS

matching_signals:
  intent_keywords:                 # 用户意图信号，命中加 1 分；不能为空
    - 选中查看详情
    - 信息卡片
  ui_signals:                      # UI 形态信号，命中加 1 分；不能为空
    - 固定面板
    - 二级浮层
  anti_signals:                    # 反信号，命中扣 2 分；不能为空；从"未入此模式的相似文档"反推
    - 全屏阻断
    - 一次性高光
---
```

### 选填字段

```yaml
extends_pattern: null              # 继承自其他模式的 ID，如 P-003；无则填 null
deprecates_pattern: null           # 本模式替换的旧模式 ID；无则填 null
deprecated_into: null              # 被废弃时指向合并目标 ID；无则填 null（status=deprecated 时填写）
auto_maintain: true                # 布尔，false 时增量操作不自动执行，改为询问；默认 true
```

---

## 正文段（固定 H2 标题）

全部 7 段为必填，缺任意一段视为格式损坏，Phase 0 检索时跳过并写 maintenance.log 记录。

### `## 一句话定位`

用一句话描述"这个模式是什么 / 适用什么场景"。

```markdown
## 一句话定位
玩家在战斗中选中部从后，右侧固定位置展示主面板，hover 子区弹二级浮层。
```

### `## 核心交互逻辑`

**口语化、按时间序**描述完整交互流程。这一段会被 Phase 0 直接念给用户听，务必流畅自然，避免字段化罗列。

```markdown
## 核心交互逻辑
玩家点击战斗内或卡牌列表中的部从 → 该部从进入选中态，强度高于 hover →
右侧固定位置打开主面板 → hover 主面板里的子区域 → 左侧弹二级浮层 →
点击其他部从 → 旧选中清除，主面板内容刷新 →
点击空白 / 选中目标消失 → 主面板和二级浮层立即关闭。
```

### `## 必复用的核心骨架`

列出"改了就破坏整体一致性"的规则。Phase 0 命中时，骨架无矛盾部分直接注入"采用契约"，不再单独追问。

- 每条一行，以 `-` 开头
- 最多 8 条；超过说明模式拆分不够细
- 不要写可以 case-by-case 调整的事项

```markdown
## 必复用的核心骨架
- 选中状态强度高于 hover
- 同时只显示一个二级浮层
- 切目标 → 主面板内容刷新（而非叠加）
- 选中目标消失 → 立即关闭主面板和二级浮层
- 点击空白 → 取消选中
```

### `## 通常需要按需求重定的参数`

每次套用此模式都需要重新确认的参数化字段。Phase 0 命中时这些参数被标为"待你确认"。

- 最多 5 条
- 写"参数名"，而不是"规则"

```markdown
## 通常需要按需求重定的参数
- 主面板承载的信息块清单
- 二级浮层触发的子区域清单
- 是否含直接操作按钮（出售 / 装备 / 升级等）
- 主面板的固定位置（右侧 / 左侧 / 顶部）
```

### `## 容易需要重新决策的地方`

**差异提示领域**，Phase 0 用这些维度扫新需求，主动发现差异。形式开放，不必穷举。

```markdown
## 容易需要重新决策的地方
- 平台差异（移动端的等价输入：按住 / 长按 / 双击）
- 信息密度（信息块多寡决定面板高度和折叠策略）
- 与现有快捷键 / 层级冲突
- 是否参与战斗内阻塞（如释放法术中是否仍能 hover）
```

### `## 案例对照`

列出 `case_files` 中每个文档的一句话摘要。

```markdown
## 案例对照
- 部从卡牌 TIPS（战斗交互）：完整套用，含 7 信息块、二级浮层、出售按钮
  → 文档：interactions/projects/部从卡牌TIPS-战斗交互/02-design/部从卡牌TIPS_战斗交互文档.md
```

### `## 偏离历史`

记录已知偏离摘要（指向 `deviations.md` 中的具体条目），初始为"暂无"。

```markdown
## 偏离历史
（暂无）
```

---

## 完整示例

```markdown
---
id: P-001
schema_version: 1
type: pattern
status: active
created_at: 2026-06-08
last_reviewed_at: 2026-06-08
case_files:
  - path: interactions/projects/部从卡牌TIPS-战斗交互/02-design/部从卡牌TIPS_战斗交互文档.md
    role: base
    extracted_at: 2026-06-08
domain: 战斗内
project_terms:
  - 部从
  - TIPS
matching_signals:
  intent_keywords:
    - 选中查看详情
    - 信息卡片
    - TIPS 面板
  ui_signals:
    - 固定面板
    - 二级浮层
    - hover 展开
  anti_signals:
    - 全屏阻断
    - 一次性高光
    - 登录弹窗
extends_pattern: null
deprecates_pattern: null
deprecated_into: null
auto_maintain: true
---

# P-001: 战斗内选中 + 右侧固定 TIPS

## 一句话定位
玩家在战斗中选中部从后，右侧固定位置展示主面板，hover 子区弹二级浮层。

## 核心交互逻辑
玩家点击战斗内或卡牌列表中的部从 → 该部从进入选中态，强度高于 hover →
右侧固定位置打开主面板，承载基础信息、能力描述、养成进度、属性摘要 →
hover 主面板里的子区域 → 左侧弹二级浮层，同时只显示一个 →
点击其他部从 → 旧选中清除，主面板内容刷新 →
点击空白 / 选中目标消失 → 主面板和二级浮层立即关闭。

## 必复用的核心骨架
- 选中状态强度高于 hover
- 同时只显示一个二级浮层
- 切目标 → 主面板内容刷新（而非叠加）
- 选中目标消失 → 立即关闭主面板和二级浮层
- 点击空白 → 取消选中

## 通常需要按需求重定的参数
- 主面板承载的信息块清单
- 二级浮层触发的子区域清单
- 是否含直接操作按钮（出售 / 装备 / 升级等）
- 主面板的固定位置（右侧 / 左侧 / 顶部）

## 容易需要重新决策的地方
- 平台差异（移动端的等价输入：按住 / 长按 / 双击）
- 信息密度（信息块多寡决定面板高度和折叠策略）
- 与现有快捷键 / 层级冲突
- 是否参与战斗内阻塞（如释放法术中是否仍能 hover）

## 案例对照
- 部从卡牌 TIPS（战斗交互）：完整套用，含 7 信息块、二级浮层、出售按钮
  → 文档：interactions/projects/部从卡牌TIPS-战斗交互/02-design/部从卡牌TIPS_战斗交互文档.md

## 偏离历史
（暂无）
```

---

## 未来演进（schema_version 升级时更新此段）

当前版本：`schema_version: 1`（2026-06-08 建立）

**迁移协议占位**：  
若将来 schema_version 升至 2，迁移脚本将在此段补充。Agent 在 Phase 0 检测到版本不匹配时 SHALL 提示一次升级，升级前不执行检索。
