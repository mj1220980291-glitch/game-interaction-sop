# Deviation Schema — 规范偏离记录格式契约

当前 `schema_version: 1`

本文档是 skill 与项目库之间关于"偏离记录文件（deviations.md）"的格式契约。项目库的 `.interaction-sop/deviations.md` **MUST** 遵循本格式。

---

## 文件位置

```
.interaction-sop/deviations.md
```

---

## 整体结构

单文件**追加日志**格式：每条偏离是一个 YAML 块，块与块之间用 `---` 分隔。

```
文件头注释（可选）
---
YAML 块 DEV-001
---
YAML 块 DEV-002
---
...
```

**追加约束**：Agent 写入新偏离时 **SHALL 仅在文件末尾追加**，禁止修改或删除已有条目。

---

## 单条偏离字段

### 必填字段

```yaml
deviation_id: DEV-001              # 字符串，全库唯一，格式 DEV-XXX，递增
date: 2026-06-08                   # ISO 日期，发生日期
deviates_from: P-001               # 偏离的模式 ID（必须是已存在的 P-XXX）
case_file: interactions/projects/xxx/02-design/xxx_交互文档.md
                                   # 产生此偏离的交互文档相对路径
deviation:                         # 数组，描述具体偏离点（至少 1 条）
  - 主面板位置改为左侧（原模式：右侧）
reason: 该需求场景中右侧已被战报占据，让位给战报
                                   # 必填，禁止留空，禁止填"待补充"
```

**`reason` 字段的要求**：  
必须说明为什么这次要打破规范。这是 deviations.md 最核心的价值——让后人能看懂"为什么历史上破了这条规则"。

### 选填字段

```yaml
affects_future: false              # 布尔，是否预期影响后续类似决策；默认 false
                                   # true 时 Phase 0 在相似场景可主动提示此偏离
notes: ""                          # 补充说明，可留空
```

---

## 完整示例

```markdown
# 规范偏离记录

---
deviation_id: DEV-001
date: 2026-06-08
deviates_from: P-001
case_file: interactions/projects/部从卡牌TIPS-战斗交互/02-design/部从卡牌TIPS_战斗交互文档.md
deviation:
  - 主面板位置改为左侧（原模式默认：右侧）
reason: 该需求场景中右侧已被战报 UI 占据，主面板需让位至左侧
affects_future: true
notes: "此类场景（战报常驻右侧）下统一用左侧。"
---

---
deviation_id: DEV-002
date: 2026-06-15
deviates_from: P-002
case_file: interactions/projects/战场MVP展示/02-design/战场MVP展示交互文档.md
deviation:
  - 强制展示时长缩短至 1.5 秒（原模式建议 2.5-3.0 秒）
reason: 玩家反馈展示过长影响节奏，A/B 测试后确认 1.5 秒效果更好
affects_future: false
notes: ""
---
```

---

## 写入时机（由 Agent 执行）

| 场景 | 是否写入 |
|---|---|
| Phase 1 用户选择"有意打破规范" | 写入（Phase 4 完成后） |
| Phase 5 增量维护检测到偏离 | 询问用户后写入 |
| 一次性特殊处理，用户明确说"不记" | 不写入 |
| Phase 1 用户选择"回归规范" | 不写入 |

**注意**：`deviations_pending` 在 Phase 1 期间只在会话内暂存，Phase 4 完成后才正式写盘。用户在 Phase 2 看到 Markdown 中的偏离标注后仍可反悔，不写入文件。

---

## 未来演进（schema_version 升级时更新此段）

当前版本：`schema_version: 1`（2026-06-08 建立）

**迁移协议占位**：  
若将来 schema_version 升至 2，迁移脚本将在此段补充。

---

## 双向一致原则

项目库中的 `deviations.md` 实例与本 schema 约束不一致时，**以 skill 仓库 schema 为准**。发现不一致时 Agent 在 maintenance.log 中记录，并在下次启动 SOP 时提示用户修正。
