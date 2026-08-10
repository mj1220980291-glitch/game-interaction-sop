# Index Schema — 项目库索引文件格式契约

当前 `schema_version: 1`

本文档是 skill 与项目库之间关于"索引文件（index.md）"的格式契约。项目库的 `.interaction-sop/index.md` **MUST** 遵循本格式。

Phase 0 检索时，此文件是 Agent 读取的**唯一入口**。Agent SHALL NOT 读取 `.interaction-sop/index.md` 之外的路径来定位模式库。

---

## 文件位置

```
.interaction-sop/index.md
```

---

## 整体结构

```
YAML frontmatter（--- 包裹）
H1 交互规范库索引
H2 模式总览（表格）
H2 偏离记录（引用）
```

---

## Frontmatter 字段

### 必填字段

```yaml
---
schema_version: 1                  # 整数，与项目库全套版本一致
project_name: 妖妖气               # 自由文本，项目名称
docs_archive: ../interactions/projects/   # 相对项目根的历史交互文档目录路径
last_updated_at: 2026-06-08        # ISO 日期，任何模式变更后更新

project_glossary:                  # 项目术语表，Agent 自动维护
  - term: 部从                     # 主术语（规范名称）
    aliases:                       # 别名列表，Phase 0 检索时归一
      - 小兵
      - 卡牌
    first_seen: P-001              # 首次出现在哪个模式中
  - term: TIPS
    aliases:
      - 信息卡片
      - 详情面板
    first_seen: P-001
---
```

**说明**：
- `project_glossary` 由 Agent 在 Phase 5 提取与增量维护时自动更新，不要求人工填写
- `aliases` 为空时写 `[]`，不要省略字段
- `docs_archive` 使用相对项目根的路径（不使用绝对路径）

---

## 正文段

### `## 模式总览`

标准 Markdown 表格，每条已建模式占一行。

```markdown
## 模式总览

| ID | 名称 | 一句话 | domain | 案例数 | status |
|---|---|---|---|---|---|
| P-001 | 战斗内选中+固定 TIPS | 战斗中选中部从查看详情 | 战斗内 | 1 | active |
| P-002 | 全屏强制高光 | 高价值事件的强制仪式感展示 | 全局 | 2 | active |
```

表格列含义：
- `ID`：模式文件 ID
- `名称`：模式 H1 标题去掉 `P-XXX: ` 前缀的名称
- `一句话`：来自"一句话定位"段，压缩至 20 字内
- `domain`：来自 frontmatter `domain` 字段
- `案例数`：`case_files` 数组长度（由 Agent 自动维护）
- `status`：来自 frontmatter `status` 字段

### `## 偏离记录`

引用格式，指向 `deviations.md` 并标注当前条目数。

```markdown
## 偏离记录

见 [./deviations.md](./deviations.md)（共 3 条）
```

---

## 完整示例

```markdown
---
schema_version: 1
project_name: 妖妖气
docs_archive: ../interactions/projects/
last_updated_at: 2026-06-08

project_glossary:
  - term: 部从
    aliases:
      - 小兵
      - 单位
      - 卡牌
    first_seen: P-001
  - term: TIPS
    aliases:
      - 信息卡片
      - 详情面板
    first_seen: P-001
  - term: 天书
    aliases: []
    first_seen: P-003
---

# 交互规范库索引

## 模式总览

| ID | 名称 | 一句话 | domain | 案例数 | status |
|---|---|---|---|---|---|
| P-001 | 战斗内选中+固定 TIPS | 战斗中选中部从查看详情 | 战斗内 | 1 | active |
| P-002 | 全屏强制高光 | 高价值事件强制仪式感展示 | 全局 | 2 | active |
| P-003 | 天书阶段展示 | 天书阶段通用信息展示规则 | 天书 | 1 | active |

## 偏离记录

见 [./deviations.md](./deviations.md)（共 1 条）
```

---

## Glossary 维护规则（Agent 执行）

1. Agent 提取新模式时，扫该模式的 `project_terms` 字段
2. 与现有 glossary 比对：
   - 新词 → 追加 `{ term: XXX, aliases: [], first_seen: P-YYY }`
   - 与已有 term 语义相同 → 写入 `maintenance-suggestions.md` 提议合并为别名
3. 维护操作写入 `maintenance.log`
4. 不自动合并或删除已有 term（结构性变更需用户 review）

---

## 未来演进（schema_version 升级时更新此段）

当前版本：`schema_version: 1`（2026-06-08 建立）

**迁移协议占位**：  
若将来 schema_version 升至 2，迁移脚本将在此段补充。

---

## 双向一致原则

项目库中的 `index.md` 实例与本 schema 约束不一致时，**以 skill 仓库 schema 为准**。发现不一致时 Agent 在 maintenance.log 中记录，并在下次启动 SOP 时提示用户修正。
