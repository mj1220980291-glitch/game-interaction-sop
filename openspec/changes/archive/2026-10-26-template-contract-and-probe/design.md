## Context

- 官方模板 `1:14`（`UYCJok3MXTWITMfeJSqEF6`）是 COMPONENT，渲染时克隆一次，再克隆 `界面说明1 (1:44)` N 份。
- `template-config.ts` 已支持 `fileKey` / `nodeId` / `componentKey` 三级地址解析，但不支持结构差异。
- 第二个真实项目模板（`796:12489` / `798:17608`，同一套骨架的两份产出）经截图与节点树核对：顶部区、章节（左图 + 右说明）、簇（编号 + 标题 + 内容行）三段同构；差异集中在总览区有无、簇内有无第二级、图上标号有无容器，以及编号载体 / 职能写法 / 配图判据 / 隐藏池用法。
- 该项目**有母版**：章节母版是整块 `Group 2360`（复制粘贴），簇母版是每章末尾隐藏的 `Frame 1244`「草稿面板」。
- 引擎已具备库模式能力：`figmaConsoleBackend.ts:346` 的 `importComponentByKeyAsync` → `createInstance()`，`render.ts:440` 在需要时 `detachInstance()`。

## Goals / Non-Goals

**Goals:**

- 把「模板长什么样」从代码常量变成一份可写、可校验、可探测的契约。
- 探针跑一次，就能回答：这模板能不能接、缺什么、按哪套能力渲染。
- 结论可复现：同一模板两次探测输出一致（指纹稳定）。
- 探针画布零写入，任何情况下都不改用户文件。

**Non-Goals:**

- 不写画布（编译、发布、打标都在后续变更）。
- 不改 `render.ts` 的填充逻辑，`1:14` 的渲染行为与调用序列不变。
- 不做「自动推断出任意结构」——推断必须标来源、必须人确认。
- 不做一项目多模板。
- 不把样式（字体 / 颜色 / 间距 / 标号形状）放进配置——它们靠克隆继承。

## Decisions

### D1 归一化模板 = 库里 4 个原子组件

```
<项目> / 顶部    top       顶部元信息 + 职能图例
<项目> / 章节    chapter   图示区 + 空说明栏
<项目> / 簇      cluster   编号 + 标题 + 内容槽 + 隐藏备用池
<项目> / 结尾    footer    the end（可选，没有就不发）
```

渲染时四条路完全相同：`importComponentByKeyAsync → createInstance → detachInstance → append`。**只有一条代码路径，没有「主体 / 首个章节」特例。**

红利：母版在库里、不在交付文档里 → 不需要「渲染完删除母版」这一步。

备选：一个整份文档组件 + 文档内母版。被否：文档内母版要清理，且首个章节与其余章节走不同分支。

### D2 存放 = 组件库；4 个部件各自一个 key

配置写 4 个 key，不写 1 个组件集 key。

```json
{ "components": { "top": "…", "chapter": "…", "cluster": "…", "footer": "…" } }
```

备选：一个 COMPONENT_SET 用 `部位=` 变体区分。被否：省一行配置，代价是把「找变体」和「找不到」搬到运行时，报错无法定位到部件。

### D3 锚点用 plugin data，不动图层名

编译时通过 `setSharedPluginData('gisop', …)` 在部件上打标（`part: top|chapter|cluster|footer`、`role: clusterTitle` 等）；图层名、外观一律不动。

兜底：某些场景 plugin data 不保留（跨文件、部分实例内），所以契约允许「按名字锚点」与「不可见零高度 FRAME 锚点」两种降级，优先级：plugin data → 名字 → 显式不可见锚点。

本变更只**读**，不打标。

### D4 契约以模板结构为准，md 是投影

```
模板没有簇内第二级 → md 不输出 ####
模板没有总览区     → md 不输出 ## 设计总览
模板顶部没有某字段 → md 不写该字段
```

冲突时报错让人定，不猜、不做双写兼容。否则会出现「md 写了、模板没地方放」的静默丢内容。

### D5 铁律（4 条 + 2 个母版）

| ID | 铁律 | 判据 |
|---|---|---|
| F1 | 顶部元信息区存在 | 文档根部有一个区块，含 ≥2 个可映射的元信息项（文档名 / 负责人 / 日期 / 链接 任一类） |
| F2 | 章节 = 图示 + 说明 | 每个章节单元同时含「一个图片容器」与「一个文本说明容器」，两者为兄弟或近亲 |
| F3 | 说明区 = 若干簇 | 说明容器内存在 ≥1 个可识别的簇单元（编号 + 标题 + 内容行） |
| F4 | 簇 = 编号 + 标题 + 内容行 | 簇内能定位到一个编号载体、一个标题文本、≥1 条内容行 |
| F5 | 章节母版可克隆 | 章节单元至少出现 1 次且结构可复制（同形单元 ≥2，或存在隐藏的同类单元） |
| F6 | 簇母版可克隆 | 同上，针对簇 |

任一不满足 → `non-conformant`，不进入能力判定。

### D6 能力（8 项枚举，全部带缺省值）

| key | 取值 | 缺省 | 官方 1:14 | 惊魂寻宝队 |
|---|---|---|---|---|
| `overview` | `two-frames` / `single-block` / `none` | `two-frames` | `two-frames` | `none` |
| `clusterGroups` | `slot-run` / `inline-subtitle` / `none` | `slot-run` | `slot-run` | `none` |
| `badgeSlot` | `container` / `manual` / `none` | `container` | `container` | `manual` |
| `numberBadge` | `text` / `instance` / `none` | `text` | `text` | `instance` |
| `roleAnnotation` | `component-variant` / `inline-suffix` / `none` | `component-variant` | `component-variant` | `inline-suffix` |
| `figure` | `named-group` / `first-non-text` / `none` | `named-group` | `named-group` | `first-non-text` |
| `hiddenPool` | `reuse` / `ignore` / `absent` | `ignore` | `ignore` | `reuse` |
| `column` | `right` / `bottom` | `right` | `right` | `right` |

缺省值集合**等价于**官方 `1:14`。所以「不认识的项目」也能按缺省跑（虽然大概率渲染歪），而 `1:14` 本身零配置。

关键约束：`clusterGroups` 与 `hiddenPool` 的填充算法不同（slot run 克隆 vs 复用隐藏槽），这是唯一真正的函数级分叉，落在后续渲染变更里。

### D7 项目模板包

```
<项目根>/.interaction-sop/
  template.json      机器读：source / components / capabilities / anchors / mdContract
  md-contract.md     人读：顶部字段集、章节规则、簇内是否分级、@职能写法
  style*.md          已有文风机制，不动
```

`template.json` 结构：

```json
{
  "schema_version": 1,
  "project": "惊魂寻宝队",
  "source": { "fileKey": "…", "nodeIds": ["798:17608"], "fingerprint": "sha256:…" },
  "components": { "top": "…", "chapter": "…", "cluster": "…", "footer": "…" },
  "capabilities": { "overview": "none", "clusterGroups": "none", "badgeSlot": "manual",
                    "numberBadge": "instance", "roleAnnotation": "inline-suffix",
                    "figure": "first-non-text", "hiddenPool": "reuse", "column": "right" },
  "anchors": { "clusterTitle": { "kind": "name", "value": "…" } }
}
```

`anchors` 只在**非缺省命名**时出现；缺省命名的项目不写，避免冗余。

### D8 四级配置查找（用户零手编）

```
1  <项目根>/.interaction-sop/template.json
2  ~/.game-interaction-sop/templates/<项目名>.json
3  全局 default 指向最近接入的项目
4  官方 1:14
```

渲染入参可显式覆盖。读取仍遵循「每次渲染读一次，指到别的模板无需重启」。

### D9 指纹与漂移

指纹 = 对源模板的结构形状（层级深度、节点类型序列、名称集合、尺寸量级）取 hash，**不含文本内容**（否则改一句文案就判漂移）。

- 渲染前比对 `source.fingerprint`：不一致 → 软警告 `V2_W_TEMPLATE_DRIFT`，仍渲染，但提示重跑探针。
- 探针重跑输出增量：新增 / 移除 / 改名的槽位清单，人确认后覆盖 `template.json`。
- 硬拒绝只在铁律破了时发生（`non-conformant`）。

### D10 探针输出三态 + 来源标记

```jsonc
{
  "verdict": "ready | needs-anchor | non-conformant",
  "rules":   [{ "id": "F2", "ok": true }],
  "masters": { "chapter": { "nodeId": "…", "kind": "hidden" }, "cluster": { "nodeId": "…" } },
  "capabilities": { "overview": { "value": "none", "source": "probed" }, … },
  "gaps":    [{ "what": "图上标号无容器", "impact": "badgeSlot=manual", "fix": "人工摆位" }],
  "draft":   { …template.json 草案… },
  "fingerprint": "sha256:…"
}
```

**来源标记是硬要求**：`probed` 才可直接采信；`inferred` / `default` 必须在报告里显式列出，交人确认。

### D11 三态判定规则

```
任一铁律不满足                        → non-conformant
铁律全满足，但 F5/F6 母版只靠推断      → needs-anchor（要人补/确认锚点）
铁律全满足，且母版与 4 部件定位均可实测 → ready
```

`needs-anchor` 不等于不能接，只是**不能自动化到最后一步**。

### D12 探测规则（落地后回填）

真机对 `1:14` 与 `798:17608` 各跑一遍后，规则收敛为下列五条。它们都在 `src/v2/probe/detect.ts`：

1. **INSTANCE 是叶子**：所有结构规则用 `walkStructured`，不进入实例内部。否则 `Slide 16:9 - 33` 内部的背景图 + 文本组会被判成章节（真机上首次跑就踩到了）。
2. **章节 = 宽图 + 文本列**：图形 = 子节点里 `graphicWidth` 最大且 ≥1000 的那个；列 = 其余子节点中文本最多的那个。
3. **图形必须比列宽 1.1 倍以上**：否则一个装满文案的簇会把自己所在章节吞掉（真机上 `说明块01` 1231 宽曾被当图形）。
4. **簇 = 列的子节点**，满足「≥2 个非空文本」且（有编号载体 或 短标题 + ≥1 条内容行）。
5. **实例内部只在取编号时读**：`num` 三角的数字在实例内 TEXT 里，`findNumberCarrier` 是唯一走全量 `walk` 的地方。
6. **簇内小标题要有「专门的图层名」**：候选必须可见、≤24 字、不以 `@` 开头、**图层名 ≠ 自身文字**，且同名的兄弟 ≥2。Figma 会拿内容自动命名 TEXT，所以 `上架和下架按钮改成蓝色…` 这种名字等于内容的是正文，不是小标题（真机上 `798` 第一次被误判成 `slot-run` 就是这个原因）。
7. **标号容器只看章节图示内部**：只统计章节 `graphic` 子树里「有 ≥2 个标号子节点」的父节点；**每个**这样的父节点都必须是纯标号 → `container`，否则 `manual`。标号本身还要小（宽高 <200）：`Slide 16:9` 这类图片实例内部也可能有数字，不能算标号（`796` 第一次被误判成 `container` 就是这个原因：把截图实例算成标号后变成 7/7）。

真机核对结果（2026-10-26）：

| | `1:14` | `798:17608` |
|---|---|---|
| 章节 | 1 个：`界面说明1`（图形 `rec组` 1920，列 `Text` 1231） | 2 个：`Group 2360`（6 簇，含 1 隐藏）/ `Group 2361`（2 簇，含 1 隐藏） |
| 编号载体 | `text` | `instance` |
| 职能 | 28 个 `@角色` 文本成组 → `component-variant`；句内 0 | 成组 0；句内 38 处 → `inline-suffix` |
| 结论 | `ready`，能力全缺省 | `ready`，`none/none/manual/instance/inline-suffix/first-non-text/reuse/right` |

`798` 只有 2 个章节（`Group 2360` / `2361`），早前记录的「3 个章节」属另一份文档 `796:12489`。

## Risks / Trade-offs

| 风险 | 说明 | 应对 |
|---|---|---|
| 推断不可靠 | 设计师命名随意（`Frame 1243` 遍地、隐藏池、手工标号） | 来源标记 + `needs-anchor` 态 + 干跑 |
| 结构启发式过拟合 | 只见过 2 套模板就写判据，第 3 套可能误判 | 判据写成「可解释规则 + 置信度」，误判时报告能指出「哪条规则命中/落空」 |
| 指纹太敏感/太钝 | 混入文本就天天漂移；只看名称又抓不到结构变化 | 只取形状特征，池化尺寸量级 |
| 库模式依赖 | 后续编译要发布库，需团队/组织权限；嵌套实例（`标签` / `num`）依赖源组件可访问 | 已列入后续变更的验收项，本变更不阻塞 |
| 契约过窄 | 第 3 个项目出现第 4 种差异 | D 项能否表达，不能则拒绝并记录，不临时加能力 |

## Migration Plan

1. 契约文档与 `1:14` 的对齐说明先落地（`template-1-14.md` 声明为「实现 #1」）。
2. 探针上线后，先对 `1:14` 跑一次：结论必须是 `ready`，能力全为缺省值——用它当自检。
3. 再对 `798:17608` 跑一次：结论应为 `ready`（母版实测存在），能力为 `none / none / manual / instance / inline-suffix / first-non-text / reuse / right`。
4. 现有调用方无需改动；`template.json` 不存在时行为与现在一致。

## Open Questions

- 顶部元信息项与 md 字段的映射表要多细？本变更只要求「可映射」，映射表留给 md 契约变更。
- `footer`（the end）缺失时是否允许？暂定「可选部件，缺了不写」。
- 图上标号 `badgeSlot=manual` 时，引擎是否要提供「按原图坐标复用」的辅助？留给渲染变更。
