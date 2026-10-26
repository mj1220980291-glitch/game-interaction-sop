# 模板契约 v1（Template Contract）

本文件定义「什么样的 Figma 模板能被本引擎渲染」。它是权威契约，`1:14` 只是它的**实现 #1**。

> 一句话：**样式靠克隆继承，不进配置；结构会分叉，才进契约。**

---

## 一、六条铁律

任一不满足 → 探针结论 `non-conformant`，引擎拒绝渲染。

| ID | 铁律 | 判据 |
|---|---|---|
| F1 | 顶部元信息区存在 | 文档根部有一块区域，含 ≥2 个短标签文本（文档名 / 负责人 / 日期 / 链接 任一类） |
| F2 | 章节 = 图示 + 说明 | 每个章节单元同时含「一个图片容器」与「一个文本说明容器」 |
| F3 | 说明区 = 若干簇 | 说明容器内有 ≥1 个簇单元 |
| F4 | 簇 = 编号 + 标题 + 内容行 | 簇内能定位编号载体、标题文本、≥1 条内容行 |
| F5 | 章节可克隆 | 同形章节单元 ≥2，或存在同形隐藏单元，或根节点本身是 COMPONENT |
| F6 | 簇可克隆 | 同上，针对簇 |

铁律只看**结构**，不看图层命名。两份真实模板的命名几乎完全不同，但都满足六条：

| | 官方 `1:14` | 惊魂寻宝队 `798:17608` |
|---|---|---|
| 章节 | `界面说明1` | `Group 2360` |
| 簇 | `说明块01` | `Frame 1245`（内含 `Group 1253`） |
| 章节母版 | 根节点是 COMPONENT | 3 个同形章节，取第 1 个 |
| 簇母版 | 说明块 2 个，取第 1 个 | 每章末尾**隐藏**的 `Frame 1244`「草稿面板」 |

---

## 二、8 项能力（枚举 + 缺省值）

缺省值集合**等价于官方 `1:14`**，所以 `1:14` 零配置、未知项目也能按缺省跑。

| key | 取值 | 缺省 | 说明 |
|---|---|---|---|
| `overview` | `two-frames` / `single-block` / `none` | `two-frames` | 是否有总览区（功能背景 + 核心交互） |
| `clusterGroups` | `slot-run` / `inline-subtitle` / `none` | `slot-run` | 簇内是否有第二级分组（`####` 的承载） |
| `badgeSlot` | `container` / `manual` / `none` | `container` | 图上标号是否有独立容器（可算坐标） |
| `numberBadge` | `text` / `instance` / `none` | `text` | 编号载体是裸 TEXT 还是组件实例 |
| `roleAnnotation` | `component-variant` / `inline-suffix` / `none` | `component-variant` | `@职能` 用组件实例、句尾内联，还是不写 |
| `figure` | `named-group` / `first-non-text` / `none` | `named-group` | 配图槽的判据 |
| `hiddenPool` | `reuse` / `ignore` / `absent` | `ignore` | 簇尾隐藏备用池是否复用 |
| `column` | `right` / `bottom` | `right` | 说明栏在图右还是图下 |

**唯一真正的代码分叉**：`clusterGroups` 与 `hiddenPool` 的填充算法不同（slot run 克隆 vs 复用隐藏槽）。其余都是开关。

两份真实模板的取值：

| 能力 | `1:14` | `798:17608` |
|---|---|---|
| `overview` | `two-frames` | `none` |
| `clusterGroups` | `slot-run` | `none` |
| `badgeSlot` | `container` | `manual` |
| `numberBadge` | `text` | `instance` |
| `roleAnnotation` | `component-variant` | `inline-suffix` |
| `figure` | `named-group` | `first-non-text` |
| `hiddenPool` | `ignore` | `reuse` |
| `column` | `right` | `right` |

---

## 三、4 个部件

归一化模板由 4 个可独立导入的库组件组成，每个部件**一个 key**：

```
<项目> / 顶部    top       顶部元信息 + （可选）职能图例
<项目> / 章节    chapter   图示区 + 空说明栏
<项目> / 簇      cluster   编号 + 标题 + 内容槽 + （可选）隐藏备用池
<项目> / 结尾    footer    the end（可选，缺失就不追加）
```

渲染时四条路完全一致：`importComponentByKeyAsync → createInstance → detachInstance → append`。

**交付文档里不含母版**——母版在库里，所以不需要「渲染完清理母版」这一步。

**不用组件集（COMPONENT_SET）+ 变体名查找**：省一行配置，代价是把「找变体」和「找不到」搬到运行时，报错无法定位到部件。

---

## 四、项目模板包

```
<项目根>/.interaction-sop/
  template.json     机器读，见下
  md-contract.md    人读的书写契约
  style*.md         文风（已有机制，互不影响）
```

`template.json`：

```json
{
  "schema_version": 1,
  "project": "惊魂寻宝队",
  "source": { "fileKey": "…", "nodeIds": ["798:17608"], "fingerprint": "sha256:…" },
  "components": { "top": "…", "chapter": "…", "cluster": "…", "footer": null },
  "capabilities": {
    "overview": "none",
    "clusterGroups": "none",
    "badgeSlot": "manual",
    "numberBadge": "instance",
    "roleAnnotation": "inline-suffix",
    "figure": "first-non-text",
    "hiddenPool": "reuse",
    "column": "right"
  },
  "anchors": {}
}
```

- `capabilities` 缺省即取上表缺省值；**未知键或越界取值直接报错**，不静默回落
- `anchors` 只在**非缺省命名**时出现；缺省命名的项目不要写
- `components` 为 `null` 表示「编译发布前」，渲染前必须回填

---

## 五、四级查找（用户零手编）

```
1  <项目根>/.interaction-sop/template.json
2  ~/.game-interaction-sop/templates/<项目名>.json      （$GISOP_PROJECT）
3  ~/.game-interaction-sop/templates/default.json
4  官方 1:14
```

另有 `$GISOP_TEMPLATE_PACK` 可指定绝对路径；`$GISOP_TEMPLATE_PACK=off` 关闭整个查找（测试用）。

模板包不存在或解析失败 → **完全回落**到本机制出现之前的行为，不新增错误。

---

## 六、结构指纹与漂移

指纹只取结构：层级、节点类型、子节点数、名称、尺寸量级、可见性。**不含文本内容**。

- 改文案 → 指纹不变
- 加/删/改名一个节点 → 指纹变化

渲染前比对 `source.fingerprint`：不一致 → 软警告 `V2_W_TEMPLATE_DRIFT`，仍渲染，并提示重跑探针。**只有铁律破了才硬拒绝。**

---

## 七、md 契约是模板的投影

| 模板事实 | md 后果 |
|---|---|
| `clusterGroups: none` | md 不输出 `####`；写了 → 报错，不丢弃 |
| `overview: none` | md 不输出 `## 设计总览`；写了 → 报错，不塞进别的槽位 |
| 顶部没有某字段 | md 不写该字段 |
| `roleAnnotation: inline-suffix` | `@角色` 写在句尾，不生成独立条目 |

**模板结构为准，冲突报错让人定。** 不猜、不做双写兼容。

---

## 八、探针

调用 `figma_probe_template`（只读，不写画布）：

| 输入 | 说明 |
|---|---|
| `nodeId` | 模板根节点，必填 |
| `fileKey` | 可选，缺省当前连接文件 |
| `maxNodes` | 可选，扫描预算（默认 20000） |

**大文档**：扫描是 BFS，整棵超时会自动回退到 1/4 预算重扫。回退后只覆盖上层结构，结论降为 `needs-anchor` 并在 `gaps` 里写明——不会因为超时误判成 `non-conformant`。实测 14000 节点的文档约需 17s。

输出：`verdict` / `rules` / `masters` / `capabilities` / `gaps` / `draft` / `fingerprint` / `human`。

**结论三态，互斥：**

| verdict | 条件 | 后续 |
|---|---|---|
| `ready` | 铁律全过，母版与部件定位全部实测 | 直接编译 |
| `needs-anchor` | 铁律全过，但有推断项 / 需补锚点 | 人工确认后编译 |
| `non-conformant` | 任一铁律不满足 | 不接，报缺口 |

**来源标记**：每项能力都带 `source`。

- `probed`：实测，可直接采信
- `inferred`：推断，必须人确认
- `default`：按契约缺省落下，必须人确认

探针**不改模板、不改画布**，也从不编造部件 key（`components` 一律 `null`）。

---

## 九、探针报告长什么样

```
模板体检：交互稿 / 798:17608
✅ F1 顶部区 = 标题 [jh…]
✅ F2 章节 = 3 个（图示 + 说明）
✅ F3 簇 = 13 个
✅ F4 标题 13/13，内容行 13/13，编号 13/13
✅ F5 章节母版 = Group 2360 (repeated)
✅ F6 簇母版 = Frame 1244 (hidden)

能力：
  overview        none               probed
  clusterGroups   none               probed
  badgeSlot       manual             probed
  numberBadge     instance           probed
  roleAnnotation  inline-suffix      probed
  figure          first-non-text     probed
  hiddenPool      reuse              probed
  column          right              probed

结论：ready —— 可接，改 0 处
```

---

## 十、边界

- 探针**不要求项目方**改名、补节点、加母版
- 「有问题就先看现有能力能否表达」，不能就**拒绝并记录**，不临时加能力
- 一项目一套模板；多套模板留到后续
- 已交付文档不回改；项目改模板 → 重跑探针 → 生成新版部件 key，旧文档不受影响
