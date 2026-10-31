# Figma 模板 `1:14` 节点映射表

本文件定义 v2 Markdown ↔ Figma 模板节点的字段映射。引擎按此表填充。

> **本文件是「模板契约 v1」的实现 #1**（见 `references/template-contract.md`）。本模板的 8 项能力全为契约缺省值：
> `overview=two-frames` / `clusterGroups=slot-run` / `badgeSlot=container` / `numberBadge=text` /
> `roleAnnotation=component-variant` / `figure=named-group` / `hiddenPool=ignore` / `column=right`。

---

## 模板基本信息

| 项 | 值 |
|---|---|
| File key | `UYCJok3MXTWITMfeJSqEF6` |
| File 名 | Agent草稿 |
| 模板节点 ID | `1:14` |
| 模板节点名 | `模板`（COMPONENT 类型） |
| URL | `https://www.figma.com/design/UYCJok3MXTWITMfeJSqEF6/Agent%E8%8D%89%E7%A8%BF?node-id=1-14` |

> **地址可配**：引擎按 `render_v2_markdown_to_figma` 的 `template` 入参 → 环境变量 `FIGMA_TEMPLATE_FILE_KEY` / `FIGMA_TEMPLATE_NODE_ID` / `FIGMA_TEMPLATE_COMPONENT_KEY` → `~/.game-interaction-sop/template.json` → `~/.game-interaction-sop/config.local.json` 的 `figma` 段 → 上表默认值 依次解析。**只有地址可配**：下面的节点名与槽位结构必须与官方模板一致。
>
> **库引用模式**：模板与「职能标记」发布到组件库后，配置 `template.componentKey` + `roleBlock.variantKeys`，引擎用 `importComponentByKeyAsync` 导入实例，**目标文件不需要先放模板**，只要该文件能访问这个库即可。

---

## 模板顶层结构

```
模板 (COMPONENT 1:14)
├─ 标题组件 (FRAME 1:15)
│   ├─ 文档标题 (TEXT 1:31)              ← # [需求名称]
│   └─ 需求信息 (GROUP 1:17)
│       ├─ 跟进UI 标签 (TEXT 1:25)        固定文字"跟进UI"
│       ├─ 设计师名称 (TEXT 1:29)         ← 跟进UI 值
│       ├─ 需求组 标签 (TEXT 1:24)        固定文字"需求组"
│       ├─ 需求组名称 (TEXT 1:27)         ← 需求组 值
│       ├─ 易协作链接 标签 (TEXT 1:23)    固定文字"易协作链接"
│       ├─ 易协作单号链接 (TEXT 1:28)     ← 易协作链接 值
│       ├─ 最后更新 标签 (TEXT 1:22)      固定文字"最后更新时间"
│       └─ 更新时间 (TEXT 1:26)           ← 最后更新时间 值
├─ 设计总览组件 (FRAME 1:32)
│   └─ 设计总览 (FRAME 1:33)
│       ├─ 一级标题 (FRAME 1:34)
│       ├─ 功能背景 (FRAME 1:36)
│       │   ├─ #Title TEXT     固定文字"1.功能背景"，引擎不写
│       │   └─ #Content TEXT   ← ### 功能背景 段正文（引擎按 name='#Content' 选）
│       └─ 核心交互 (FRAME 1:39)
│           ├─ #Title TEXT     固定文字"2.核心交互"，引擎不写
│           └─ #Content TEXT   ← ### 核心交互 段正文（引擎按 name='#Content' 选）
└─ Comp_1 (FRAME 1:42)
    └─ 需求目标 (FRAME 1:43)
        └─ 界面说明1 (GROUP 1:44)         ← 唯一模板槽位，按 ## NN. 数量克隆
```

> **模板槽位约束**：`需求目标 (1:43)` 下**有且仅有 1 个** `界面说明` 子节点（即 1:44）。模板若额外保留 `界面说明2 / 3 / ...` 静态占位，会导致引擎 clone+append 顺序错位、已填章节被误删。引擎运行时会防御性 strip 多余兄弟，但模板本身仍应满足该约束。

---

## v2 Markdown → 模板节点 字段映射

### 顶部固定区（写一次）

| Markdown 行 | 模板节点 | 节点 ID | 操作 |
|---|---|---|---|
| `# [需求名称]` | 文档标题 | 1:31 | `set_text_content` |
| `跟进UI：xxx` | 设计师名称 | 1:29 | `set_text_content` |
| `需求组：xxx` | 需求组名称 | 1:27 | `set_text_content` |
| `易协作链接：xxx` | 易协作单号链接 | 1:28 | `set_text_content` |
| `最后更新时间：xxx` | 更新时间 | 1:26 | `set_text_content` |
| `### 功能背景` 段正文 | 功能背景 frame 内的 `#Content` TEXT | 1:36 → `name='#Content'` 子节点 | `set_text_content` |
| `### 核心交互` 段正文 | 核心交互 frame 内的 `#Content` TEXT | 1:39 → `name='#Content'` 子节点 | `set_text_content` |

### 章节区（按 `## NN.` 数量克隆）

| Markdown | 模板节点 | 操作 |
|---|---|---|
| —（前置） | `需求目标 (1:43)` 下除 master `界面说明1 (1:44)` 外的所有兄弟 | `delete_nodes`（防御性 strip 多余 spare 占位） |
| 第 1 个 `## NN. [界面名称]` | 直接复用 界面说明1 (1:44) | 重命名为"界面说明 N" |
| 第 2..N 个 `## NN.` | 克隆 界面说明1 | `clone_node` |
| `## NN. [界面名称]` 文本 | 该界面说明的"界面名称"蓝色标签 TEXT | `set_text_content` |

### 章节内语义簇（按 `###` 数量克隆"小标题块"）

每个 `###` 对应一个"小标题块"槽位：

| Markdown | 模板节点 |
|---|---|
| `###` 序号（章节内连号） | 该图上对应位置的"标号"气泡 TEXT |
| `### [自由命名的语义簇]` 文本 | 右侧"小标题"TEXT |
| `@角色1 @角色2 ...` 行 | 角色 FRAME 内对应 TEXT 节点（保留命中项，删除其余） |
| 该簇下的 bullet | 说明段 TEXT |
| `- 配图：xxx` bullet（可选，可多条） | 每条原位克隆一个配图占位，紧跟其前一条规则，占位文案写 `配图占位：xxx` |
| `- @策划：xxx` bullet（可选，可多条） | 原位克隆「职能标记」对应角色变体实例，正文写进变体的正文 TEXT |

> 子节点 ID 待引擎首次扫描"界面说明1 (1:44)"时再补全到本表。届时本表追加`小标题块`槽位 ID 段。

### 配图槽三态（2026-10-31 起）

每个配图槽渲染结束只有一种结局：

| 状态 | 判据 | 产物 |
|---|---|---|
| `filled` | 槽矩形有 IMAGE 填充 | 图（占位文案层被删、描边清空） |
| `placeholder` | md 写了 `配图：` 但 assetMap 无对应 key | 灰板 + 虚线 + `配图占位：xxx`，并报 `V2_W_FIGURE_ASSET_MISSING` |
| `hidden` | md 没有对应条目 | 整组 `visible=false` |

- 槽是否「被用」以渲染期账本 + IMAGE 填充为准，其余按「子树里所有配图组 − 已认领」求差集隐藏，不靠条目顺序推
- `summary.figuresPlaced` 只计 `filled`，`summary.figuresPlaceholder` 计 `placeholder`
- 同步认槽用 stamp 里的 `asset`，占位文案被删也不影响配对

---

### 渲染期样式归一化（2026-10-31 起）

克隆继承样式的前提是模板样式本身是成品态；真机上不是。所以引擎会显式改这几项：

| 层 | 引擎设定 | 说明 |
|---|---|---|
| `正文/规则` | `textAlignHorizontal = LEFT`、`textAutoResize = HEIGHT` | 模板常为 CENTER，不清就是整篇居中（真机 102 条） |
| `配图占位` 矩形 | 填图时清 `strokes` + `dashPattern` | 模板是虚线占位框，不清会压在截图上 |
| `主图占位` 矩形 | 同上 | 同上 |
| 未填图的槽 | 保留灰板 + 虚线 | 占位视觉是有意的，别归一化掉 |

模板原本就是 `LEFT` 时不告警；被改过时只报一条 `V2_W_TEXT_ALIGN_NORMALIZED`（带条数）。

---

## 「职能标记」组件集（可选，独立于 1:14）
Markdown 里出现 `- @策划：…` 条目时，引擎从**同一文件**的组件集取变体实例化。它不在 `1:14` 模板子树内，而是模板文件里的另一个节点：

```
职能标记 (COMPONENT_SET，node id 由 roleBlock.componentSetId 指定)
├─ 职能标记=#策划  (COMPONENT)
│   ├─ 文本        (TEXT，标签，引擎不写)
│   └─ [正文]      (TEXT，引擎写入 bullet 正文)
├─ 职能标记=#程序
├─ 职能标记=#GUI
├─ 职能标记=#动效
├─ 职能标记=#拼接
└─ …（缺哪个角色变体，就不能用该角色的 @职能 条目）
```

配置示例（`~/.game-interaction-sop/template.json`）：

**库引用模式（推荐）**

```json
{
  "template": { "componentKey": "<模板组件的发布 key>" },
  "roleBlock": {
    "variantKeys": {
      "程序": "<key>", "GUI": "<key>", "拼接": "<key>",
      "美术": "<key>", "动效": "<key>", "音频": "<key>", "策划": "<key>"
    }
  }
}
```

**同文件模式（兜底）**

```json
{
  "template": { "fileKey": "…", "nodeId": "1:14" },
  "roleBlock": {
    "componentSetId": "1:2",
    "variantPrefix": "职能标记=",
    "labelTextName": "文本"
  }
}
```

- 变体名后缀允许带 `#`（`职能标记=#策划`）或不带（`职能标记=策划`）
- 组件集读不到 / 缺对应角色变体 → 引擎报 `V2_ROLE_BLOCK_UNAVAILABLE`，不降级
- 组件集必须与模板在同一个 fileKey 内（引擎只能访问目标文件）

---

## 引擎调用契约

引擎应按以下顺序操作（具体 MCP 调用细节封装在引擎代码内，skill 不关心）：

1. 在目标 page 上克隆 `模板 (1:14)` 一份
2. 填写顶部固定区 5 个 TEXT（文档标题 / 设计师名称 / 需求组名称 / 易协作单号链接 / 更新时间）
3. 填写设计总览正文：分别选 `1:36` / `1:39` frame 内 `name === '#Content'` 的 TEXT 子节点写入（**不要**写到 `#Title` "1.功能背景" / "2.核心交互" 小标题上）
4. **strip spare**：删除 `需求目标 (1:43)` 下除 master `界面说明1 (1:44)` 之外的所有兄弟节点
5. 计数 `## NN.` 数量，按需 `clone_node(界面说明1)` 至 N 份
6. 对每个 `## NN.` 章节：
   - 填写"界面名称"蓝色标签
   - 计数章节内 `###` 数量，按需克隆"小标题块"
   - 对每个 `###`：
     - 填小标题
     - 删除未命中的角色 TEXT
     - 填说明段
     - 处理配图（每条 `配图：` 按 bullet 顺序原位克隆配图占位；无配图则删除模板自带的）
   - 对每个气泡：
     - 设置编号文本（章节内 1, 2, 3, ...）
     - 定位（有设计稿走视觉锚点，无设计稿走默认网格）
7. 将用户提供的设计稿（如有）置入"主图占位"位置

引擎实现详见 `figma-interaction-doc-engine` 项目。
