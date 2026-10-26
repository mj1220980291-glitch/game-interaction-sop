# Style Mod — 项目文风契约

当前 `schema_version: 1`

项目可以把“这个项目的人怎么写交互文档”沉淀成文风 mod：Phase 1 决定本次用哪份，Phase 2 生成 Markdown 时按它写，Phase 5 把人工改过的表述回写进去。一个项目可并存多份，位置固定：

```
<项目根>/.interaction-sop/
  style.md          ← 项目默认文风（干净基线）：只读，任何 Phase 都不改写
  style_own.md      ← 个人文风：有它就用它；除选中 style_<name> 外，也是自动沉淀目标
  style_<name>.md   ← 他人 / 分享 / 导入的文风：存在任意一份时，每次写文档前都要问用哪份
```

三个文件的角色：

| 文件 | 谁写 | 什么时候生效 |
|---|---|---|
| `style.md` | 人（手工维护，保持干净） | 目录里既没有 `style_own.md`、也没有 `style_<name>.md` 时 |
| `style_own.md` | Phase 5 自动沉淀 | 没有 `style_<name>.md` 时，存在即默认生效 |
| `style_<name>.md` | 导入 / 手工 / 本次被选中时沉淀 | 存在任意一份 → 每份文档先询问，选中哪份用哪份 |

> 文风 mod 只影响**怎么写**，不影响**问什么**。Phase 0 检索、Phase 1 提问纪律与冲突清零门禁不受其影响。

---

## 优先级

```
引擎硬校验（H1 H2 O1 O2 S1 S2 S3 C1 C2 G1 G2 G3）
  ↑ 不可覆盖，违反即拒绝写 Figma
状态行规则（T10 / W7 / W8）
  ↑ 不可覆盖，动效与状态混写会破坏引擎识别
T2 丢弃判据（图上不可见内容不进簇）
  ↑ 不可覆盖，丢弃决策仍需走 Phase 2 Step 0.3 并交用户确认
T1 / T3–T9（粒度、归位、术语、反馈、信息增量、去重、动效句、顺序）
  ↑ 可被 style mod 覆盖
style mod
  ↑ 只在上面没被禁止的地方生效
```

冲突时的处理：先满足不可覆盖项，再按 style mod 写；两者确实无法同时满足时，保留不可覆盖项并在回复里一句话说明。

---

## 文件结构

```markdown
---
schema_version: 1
name: 妖妖气-战斗组
verbosity:
  level: terse
  bullets_per_cluster: 3-5
role_annotation:
  mode: selective
  when:
    - 数值阈值 / 配表字段
    - 服务端逻辑但界面有可见结果
    - 异常与边界
  never:
    - 通用交互流程
    - 纯视觉表现
wording:
  tone: 直述
  person: 无人称
  sentence: 短句
  terms:
    - from: 警官蛋
      to: 治安官
  banned:
    - 尽量
    - 建议
  replace:
    - from: 点击
      to: 点按
---

## 示例

- 好：按住左键锁定朝向，按住期间移动不改变角色朝向
- 坏：玩家可以尝试按住鼠标左键来对朝向进行锁定
```

正文段可选，用来放 few-shot 范例；Agent 写 Markdown 时参考，不做机器解析。

---

## 字段说明

### `verbosity`

| 字段 | 取值 | 默认 | 作用 |
|---|---|---|---|
| `level` | `terse` / `normal` / `verbose` | `normal` | 整体信息密度 |
| `bullets_per_cluster` | 如 `3-5` | `3-6` | 覆盖 T6 的“簇 bullet 数目标” |

- `terse`：每条 bullet 只写图上看不出来的结论，能一句写完不分两句；允许把反馈压缩成短句
- `normal`：等同 skill 默认（T1 / T6）
- `verbose`：允许补背景与原因，但仍禁止 T2 的四类丢弃内容

### `role_annotation`

控制 `- @职能：正文` 条目的使用（对应 Figma「职能标记」组件）。

| 字段 | 取值 | 默认 | 作用 |
|---|---|---|---|
| `mode` | `always` / `selective` / `never` | `selective` | 是否写 `@职能` 条目 |
| `when` | 文本数组 | 见下 | `selective` 下命中即标注 |
| `never` | 文本数组 | `[]` | 命中即不标注，优先级高于 `when` |

默认 `when`：

- 数值 / 阈值 / 配表字段（多为 `@策划`）
- 服务端逻辑但界面上有可见结果（多为 `@程序`）
- 异常与边界条件（多为 `@程序`）
- 需要在界面上额外制作的表现（多为 `@动效` / `@美术`）

`mode: never` 时**不要**写任何 `- @职能：` 条目，Phase 4 也就不需要配置职能标记组件集。

### `wording`

| 字段 | 取值 | 默认 | 作用 |
|---|---|---|---|
| `tone` | `直述` / `口语` / `规章` | `直述` | 句式语气 |
| `person` | `无人称` / `第二人称` / `玩家视角` | `无人称` | 是否出现“玩家/你” |
| `sentence` | `短句` / `长短结合` | `短句` | 单条 bullet 的句子长度偏好 |
| `terms` | `{from,to}[]` | `[]` | 术语替换，优先级高于设计稿文案（T4）之外的默认叫法 |
| `banned` | 字符串数组 | `[]` | 禁用词，出现即改写 |
| `replace` | `{from,to}[]` | `[]` | 非术语类用词替换（如“点击”→“点按”） |

`terms` / `replace` 是**必做替换**，Agent 写完后自检一遍。`banned` 命中时必须换一种说法，不能只删词。

---

## 文件选择顺序（Phase 1 开口前执行一次）

扫 `<项目根>/.interaction-sop/` 下的 `style*.md`（排除 `.bak`），按下列顺序决策，**先命中先停**：

| 目录里有什么 | 行为 |
|---|---|
| 存在任意 `style_<name>.md` | **每次写文档前问一次**：选项列出 `style_own.md` 与每个 `style_<name>.md`，默认标 `style_own.md`；用户指定后，本份文档全程用它 |
| 没有 `style_<name>.md`，有 `style_own.md` | 直接用 `style_own.md`，**不询问** |
| 只有 `style.md` | 直接用 `style.md`，**不询问** |
| 一个文风文件都没有 | 用 skill 默认表述规则，静默继续，不追问、不主动提议建文风 |

- 询问一份文档只做一次，问完记在会话里，中途不重复问
- 用户中途改口（「换成 XX 那份」）→ 从下一次输出生效，已输出的 Markdown 不追溯改写
- `style.md` 是项目默认基线，**只读**：任何 Phase 都不写它
- `schema_version` 不匹配 → 提示一次，用户不处理则本次用 skill 默认

## 默认 style.md 模板

本 skill 自带一份版本化的默认文风：`references/style-default.md`（簇结构约定 + 职能标注）。

项目还没有任何文风文件时，直接复制它到 `<项目根>/.interaction-sop/style.md`，再按用户习惯增删：

```bash
cp packages/skill/references/style-default.md <项目根>/.interaction-sop/style.md
```

- 只预置正文两段，不预置 `verbosity` / `role_annotation` / `wording`：缺省走 skill 默认，个人偏好留给 `style_own.md` 沉淀
- 项目那份可自由改；skill 里这份是出厂值，改动需同步 CHANGELOG
- 保持两份同一套段落标题（`## 簇结构约定` / `## 职能标注`），便于 Phase 5 定位回写

## 导入与分享

- **导入**（贴一段 md / 给 Figma 文档 / 给别人的文件）：先反推成 schema 字段，出草案让用户确认，再存为 `style_<name>.md`；同名已存在先备份 `.bak`。下次写文档时它会出现在选择询问里
- **分享**：输出该文件完整内容，或写成独立文件让用户带走；不擅自脱敏、不改字段
- 用户明确要求「把这个项目的文风沉淀下来」→ 走下面的冷启动流程

## 生成方式（冷启动）

用户说“帮我生成文风 mod / 按这几篇文档总结文风”时：

1. 读用户给的 2–3 份历史交互文档（Figma 文档用引擎的只读工具取文本，不要只靠截图 OCR）
2. 反推 `verbosity` / `role_annotation` / `wording` 三组字段，并把作者反复出现的固定写法写进正文段（few-shot）
3. 先输出草案给用户改，确认后才写 `.interaction-sop/style_own.md`（或用户指定的 `style_<name>.md`）；若项目还没有 `style.md`，同时用「默认 style.md 模板」建一份干净基线，草案只写进 `style_own.md`
4. 不覆盖已存在的文件，必须先备份或征得同意

## 迭代协议（唯一出口：Phase 5 文风沉淀）

文风靠用起来逐步逼近。SOP 只保留**一个**沉淀出口 —— Phase 5，Phase 4 交付完成后统一问一次；Phase 2 审核轮与 Phase 4 收尾都不追问，避免反复打断。

### 入口 A — Markdown 改动

1. Phase 2 保存 Markdown 后落快照：`<项目根>/.interaction-sop/snapshots/<需求名>.md`
2. Phase 5 做「快照 vs 现行 md」diff，diff 出来的就是本轮人工改动
3. 只取表述层：措辞、句式、`@职能` 标注、动效句、红点四要素、bullet 粒度、段内顺序
4. 归成条目：`条目一句话 → 落点字段/正文段 ← 依据（原「A」改成「B」）`
5. **列清单一次确认**（编号 + 一句话 + 依据），用户回编号 / 全部保留 / 都不要
6. 一次最多提 5 条，超过只留出现频次最高的

### 入口 B — Figma 表述改动

1. Phase 5 主动问一句：改过表述就把最新文档链接/node 给我
2. 用引擎只读工具读节点文本（实例内文本取不到时用 `figma_get_file_data` + `verbosity: full` + 足够 `depth`），与快照 / 现行 md 逐条比
3. 结论合并进**同一张清单**，标注「来源：md / Figma」
4. **不算文风**：排版、气泡位置、配图更换、图层结构

### 写入（目标由本次启用的文风决定）

| 本次启用 | 沉淀写哪 |
|---|---|
| `style_own.md` | 写 `style_own.md` |
| `style_<name>.md` | 写回该份（用户明确选了这份，本轮改动就归它） |
| `style.md`（首次，还没有 own） | **不写 `style.md`**：以它为基底复制出 `style_own.md`，再追加条目 |
| 一个文风文件都没有 | 先复制 `references/style-default.md` 生成 `style.md`，再以它为基底复制出 `style_own.md` 写条目 |

- 写前一律备份 `<目标文件>.bak`
- 只改涉及字段与正文段，不重排、不删用户手写段落
- `style.md` 任何情况下都不写入，保持干净基线
- 写完覆盖快照为当前 md，并报一行：`<目标文件> 已更新：N 条（字段 X 条 / 正文段 Y 条）`
- 用户全部拒绝 → 快照照样更新，本会话不再提

### 回写红线

- 不可覆盖项（强校验 H*/C2/T10/T2）永不写进 style，哪怕用户改成了那样，也要先说明冲突
- 回写只动 frontmatter 三组字段与正文段，不重排文件、不删用户手写的段落
- 每次回写结束给一行摘要：`<目标文件> 已更新：N 条（字段 X 条 / 正文段 Y 条）`

---

## 自检（Phase 2 输出前）

- [ ] 已按「文件选择顺序」确定本次生效文风；目录里有 `style_<name>.md` 时已问过用户
- [ ] 已读本次生效的 style（若有），`verbosity.level` 与 bullet 数落在配置范围
- [ ] `role_annotation.mode` 与实际写出的 `@职能` 条目一致；`never` 时一条都没有
- [ ] `terms` / `replace` 全部替换完成，`banned` 零命中
- [ ] 不可覆盖项（H*/C2/T10/T2）未被文风理由绕过
