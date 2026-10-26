## Context

- 上一个变更（已归档 `2026-10-26-template-contract-and-probe`）交付了契约 v1 与只读探针。探针输出 `draft`（`components` 全 `null`）、8 项能力、母版位置、缺口、指纹。**它不写画布。**
- 引擎现有库模式能力：`figmaConsoleBackend.ts:350` 的 `instantiateByKey`（`importComponentByKeyAsync` → `createInstance`），`render.ts:440` 的 `detachInstance`。无 `createComponentFromNode`、无 `combineAsVariants`、无发布——这些是本变更要补的。
- 真机结构事实：
  - `1:14`：根是 `COMPONENT`，章节母版 `界面说明1` 也是组件。
  - `798:17608`：章节母版是普通 `Group 2360`，簇母版是隐藏 `Frame 1244`「草稿面板」；顶部有「标签」职能图例组件集，章节图上有 `num` 三角编号实例。
  - `796:12489`：14110 节点，扫描约 17s。
- Figma 平台事实（决定了本变更的形状）：
  1. 插件 API 是**文件作用域**的，没有跨文件读节点 / 拷贝节点的能力。
  2. `importComponentByKeyAsync` 只接受**已发布**组件的 key。
  3. 插件 API **没有发布接口**，发布是 Assets 面板的人工动作。

### 4 个前置未知项的处置

| # | 问题 | 处置 |
|---|---|---|
| 1 | 库文件放哪、谁维护、发布权限 | **D1**：专用库文件「交互 SOP 模板库」，一项目一页面，我们维护。发布权限是**硬前置**，编译前必须实测确认（T1） |
| 2 | 嵌套实例（标签 / num）怎么办 | **D3 收编**：在库里重建为本库自有组件并一起发布，父引用子。不是「敲成死图」，也不是「依赖别人的库」 |
| 3 | 字体（`U5Font` 等） | **D7 字体归一化**：部件内全部文本统一改写为 `Noto Sans SC`（字重就近映射），只保留字号 / 行距 / 字色；不依赖项目安装字体 |
| 4 | `badgeSlot=manual` 的图上标号 | **D9 容器统一**：按 `1:14` 形态补空标号容器，`manual` → `container`；摆位留后续统一解决 |

## Goals / Non-Goals

**Goals:**

- 把探针草案变成**真的能 import 的 4 个组件 key**，写进项目模板包。
- 归一化模板自给自足：库文件不依赖任何外部文件，源模板改动 / 删除不影响已发布部件。
- 编译可重复执行：同一项目重编不破坏已交付文档（追加新组件，不原地删旧组件）。
- 全程项目源模板零写入，前后指纹一致。
- 拒绝明确：表达不了的差异中止并记录，不临时扩能力。

**Non-Goals:**

- 不改 `render.ts`，多部件渲染是下个变更。
- 不做插件跨文件自动搬运（人工粘贴一次）。
- 不生成 `md-contract.md`。
- 不做一项目多套模板。
- 不做标号自动摆位。
- 不碰样式配置：颜色 / 间距 / 标号形状依旧靠克隆继承，绝不进 `template.json`；字体按 D7 归一化为固定常量（也不是配置项）。

## Decisions

### D1 库文件 = 一个专用 Figma 文件，一项目一页面

```
交互 SOP 模板库 (fileKey: <TBD，见 T1>)
├─ 页面：1:14 官方           ← 契约实现 #1
├─ 页面：蛋仔派对            ← 796/798 收编产物
└─ 页面：_staging           ← 人工粘贴进来的源部件中转站
```

- 组件命名固定 `<项目> / 顶部|章节|簇|结尾`，以及收编出来的零件 `<项目> / 零件 / <原名>`。
- 一个文件 = 一个库，发布一次覆盖全部项目；跨文件用 `importComponentByKeyAsync`。
- **前置硬校验（T1）**：库文件所在团队须为 Professional / Organization，且当前账号是编辑者；否则发布不可用 → 编译拒绝并给出明确原因。此项在写代码前先人工确认一次并记录 `fileKey`。

### D2 搬运 = 一次性人工粘贴（本变更）

插件搬不动跨文件的东西，本变更不假装能搬：

1. 人把项目模板的 4 个部件（母版整块）+ 需要的零件，Ctrl+C / Ctrl+V 粘到库文件的 `_staging` 页面。
2. 插件从粘贴的那一刻接管：切分、收编、锚点、变组件、重建变体集、发布前自检。
3. 粘进来的图层**保持原名**（不改名是我们的底线，不给设计师加活，也不给后续维护添记忆负担）。

为什么不做自动搬运：没有真值就无法验证桥的保真度。先人工粘一次拿到「正确结果」，后续变更做桥时才有对照物。

### D3 嵌套部件「收编」（adopt），不是敲死也不是依赖外库

对部件内部的每个 `INSTANCE`（`标签` 组件集、`num` 三角…）：

```
detachInstance()            → 拿到可改造的普通图层（变体信息在这一步丢失）
figma.createComponentFromNode() → 变成我们自己的 COMPONENT
[有变体时] combineAsVariants()  → 重建组件集，逐个还原变体名
setSharedPluginData('gisop', …) → 打锚点
发布                        → 拿到我们自己的 key
父部件里把该位置替换为自家组件的实例（同库内 createInstance，不走 import）
```

**为什么必须重建变体集**：`detachInstance()` 抹掉变体关系，图例的「按职能切换」能力随之消失。不重建，`roleAnnotation=component-variant` 就名存实亡。

**顺序硬约束**：先发零件、后发部件。父引用子，同库内引用自家 key 稳定。

**收益**：

- 源组件被删 / 改名 / 挪文件 → 我们不受影响（与源模板彻底脱钩）。
- 编号仍是组件，编号文字仍可写；用户日后可手改。
- 渲染只需 4 个 key：Figma 自动带上同库依赖，引擎不用多配。

### D4 锚点：plugin data 优先，两条降级

槽位清单（打在各部件内部节点上）：

```
part            top | chapter | cluster | footer      （部件根）
role            title | figure | column | badgeSlot | contentSlot | hiddenPool | legendItem | …
adopt           <源组件名>                              （收编产物根）
```

优先级：`plugin data(gisop)` → **约定图层名** → **不可见零高度 FRAME**（命名 `#anchor:<role>`，`visible=false`、`height=0`）。

- plugin data 不跨文件传递、也不保证在所有实例上下文里可读，所以降级必须存在。
- 用到的降级项 SHALL 写进 `template.json` 的 `anchors`；用缺省命名的项目不写（沿用契约 v1）。
- 锚点只写在**库文件**里的部件上。项目源模板一个 `setSharedPluginData` 都不许调。

### D5 能力基准 = 归一化模板，不是源模板

8 项能力描述的是「渲染时看到的那棵树」。编译会改变结构（例如 `num` 由实例变成本库组件、`hiddenPool` 的隐藏槽被收编），所以：

```
编译产出 4 部件
  → 对产物跑现有 figma_probe_template（复用，不新写判定）
  → capabilities 取产物结果（source: probed）
  → 与源模板探针结果逐项比对，差异写入 gaps
```

这条把「配置说 `instance`、实物是 `text`」的错位在编译期就掐死。差异不静默：每一项都要在报告里出现。

### D6 发布两段式，key 回填

```
phase=compile  → 产出组件 + 锚点 + 产物能力 + template.json 草案（components 全 null）
（人工）Figma → Assets → 发布
phase=verify   → 读 4 个组件的 key；缺失的报 V2_COMPILE_NOT_PUBLISHED
               → 写 <项目根>/.interaction-sop/template.json（components 回填真实 key）
```

- `footer` 不存在时不写该字段（契约：可选部件）。
- **`verify` 必须做真 import 冒烟**：实测「有 key ≠ 已发布」（草稿 61 个本地组件全有 key，跨文件一律取不到，报 `Could not find a published component with the key`）。所以 `verify` SHALL 逐个 `importComponentByKeyAsync(key)`，且必须在**非库文件**里执行（同文件内取自己永远成功，测不出问题）。冒烟失败即 `V2_COMPILE_NOT_PUBLISHED`。
- **命名红线**：组件名以 `_` 或 `.` 开头时 Figma 判定为「不发布」（Publish 弹窗里落到 `Hidden` 分组）。编译 SHALL 校验 4 个部件及收编零件的名字不以这两个字符开头。
- **超时预算**：首次跨文件 import 实测 7.2s，`verify` 单次调用预算 SHALL ≥ 30s，SHALL NOT 沿用 15s。
- **key 稳定性纪律**：重编译一律**新增**组件 + 更新配置；已交付文档引用的旧组件不许删。删除会连带打断已发布文档的渲染。

### D7 字体归一化（统一 `Noto Sans SC`）

库组件里**所有**文本的 `fontName` SHALL 改写为 `Noto Sans SC`，只保留 `fontSize` / `lineHeight` / `letterSpacing` / `fills`。

- 字重映射：实测本环境 `Noto Sans SC` 只有 **`Regular` / `Medium` / `Bold`** 三档（无 Light / Black）。原字重一律就近映射到这三档；`Thin`/`Light` → `Regular`，`SemiBold` → `Medium`，`ExtraBold`/`Black` → `Bold`；无法判定时退 `Regular` 并在 `gaps` 记一条。
- 理由：项目字体（`U5Font` 等）不装就会静默回退字重，而这个回退会被**永久烙进库组件**，之后所有文档都错，且指纹不含字体、检测不到。统一成 Noto Sans SC 让产物只依赖一个我们确定可加载的字体族。
- 副作用（已知并接受）：交付文档字体统一为 `Noto Sans SC`，项目原字体不再出现。
- 只有 `Noto Sans SC` 本身不可加载时才拒绝（`V2_COMPILE_FONT_UNAVAILABLE`，列出缺失字重）。

其余前置校验（失败即拒绝，不出半成品）：

| 校验 | 失败码 |
|---|---|
| 库文件可写、可创建组件 | `V2_COMPILE_LIBRARY_UNWRITABLE` |
| `Noto Sans SC` 各字重可 `loadFontAsync` | `V2_COMPILE_FONT_UNAVAILABLE` |
| 源模板指纹与探针记录一致 | `V2_COMPILE_SOURCE_DRIFT` |
| 差异可被 8 项能力表达 | `V2_COMPILE_CAPABILITY_UNEXPRESSIBLE` |

### D8 幂等与重跑

- 以 `<项目> / <部件>` 名字 + `plugin data(gisop).source = {fileKey, nodeId, fingerprint}` 识别既有产物。
- 重跑：创建新组件（名字追加 `-v2`、`-v3`），旧组件保留并标记 `gisop.deprecated = true`，新 key 覆盖配置。
- 不原地改已发布组件的结构（改结构会静默影响所有在用文档）。

### D9 标号：容器按 `1:14` 形态统一补，摆位留后续统一解决

归一化模板的章节图区 SHALL 预置一个标号容器，形态取自官方 `1:14` 的 `气泡` FRAME（命名 `气泡`、空内容、几何按图区相对位置固定）。

- 源模板本来是 `badgeSlot=manual`（散落标号）时，编译**补**上这个空容器，把 `manual` 统一成 `container`。
- 摆位（标号具体落在图的哪个点）**不在本变更解决**，留到后续统一处理。
- 能力值不手写：D5 的产物探针会把它判成 `container`，与源模板 `manual` 的差异进 `gaps`。

```
{ "what": "标号容器：源模板 manual → 产物 container", "why": "容器按 1:14 形态统一补齐", "impact": "标号摆位留后续统一解决" }
```

### D10 MCP 工具面：一个工具，两个 phase

```
figma_compile_template({
  phase: 'compile' | 'verify',
  source: { fileKey?, nodeId },          // 项目模板根（只读）
  samples?: string[],                    // 2~3 份文档样本 nodeId，用于确认母版重复度
  library: { fileKey, pageId? },         // 我们的库文件
  project: string,                       // 极简项目名，用于组件命名
  parts?: ['top','chapter','cluster','footer'],  // 缺省全量，footer 可省
  write?: boolean                        // 缺省 false = 干跑，只出计划与缺口
})
```

- 写入类工具：`write: true` 才动画布，且必须先 `commitUndoCheckpoint`。
- `write: false`（干跑）返回：将创建的组件清单、将收编的实例清单、将打的锚点、预计能力差异、拒绝原因。
- 复用现有探针作为产物校验，不复制判定逻辑。

## Risks / Trade-offs

| 风险 | 说明 | 应对 |
|---|---|---|
| 库发布权限不确定 | 团队套餐 / 角色不满足则整条链路不可用 | D1 的 T1 前置一次性确认；缺失时拒绝并给明确提示 |
| 人工粘贴走样 | 人可能粘错节点、漏粘零件、粘到错的页面 | 粘贴后先干跑：插件核对「4 部件齐全 + 母版结构特征 + 零件清单」，缺什么报什么 |
| 变体集重建不全 | 变体名 / 属性名还原错 → 能力名存实亡 | 重建后跑一次「变体名 ↔ 原变体名」逐项比对，不一致即拒绝 |
| `detachInstance` 不可逆 | 拆了回不去 | 只在库文件里拆，`_staging` 保留原始粘贴副本作为回滚点 |
| 组件属性丢失 | 原组件上的文字属性 / 布尔属性 `detach` 后不存在 | 逐项比对并报缺口；必须保留的用 `addComponentProperty` 重建，重建不了的拒绝 |
| key 漂移 | 删组件 / 整份复制文件会让 key 变 | D6 key 稳定性纪律 + D8 追加式重编 |
| 14000 节点扫描超时 | `796` 约 17s，超时降级 1/4 预算 | 编译阶段对源模板**只读母版子树**，不做全文档扫描；样本仅用于核对重复度 |
| 切换页面会报错 | `figma.currentPage = page` 在 `documentAccess: dynamic-page` 下抛错：`Use figma.setCurrentPageAsync instead`（真机已踩） | 编译若需切页一律走 `figma.setCurrentPageAsync` |
| 部件携带原稿内容 | 编译是"克隆母版"，所以章节部件里仍带着该项目当时的文案、截图实例与全部簇 | **采编阶段有尺寸闸门**（>600×400 视为内容，不收编、不复制进库）；残留内容由渲染变更在填充前清空 —— 与本变更并列的已知债务 |
| 契约过窄 | 第 3 个项目出现第 4 种差异 | D7 + 「拒绝而非扩张」：不临时加能力 |

## Migration Plan

1. T1 确认库文件与发布权限，记下 `fileKey`。
2. 先编 `1:14`（最容易：根就是 COMPONENT）——产物探针必须全绿、能力全缺省。用它当编译链路的自检。
3. 再编 `798:17608`（含收编：标签组件集 + `num` 三角）。人工粘贴 → 干跑核对 → 实跑 → 人工发布 → `verify` 回填。
4. 用 `796:12489` 做压力核对（14110 节点，只读母版子树）。
5. 三条链路都通后，才动渲染变更。
6. 现有渲染行为不变：没有 `template.json` 的项目仍走旧路径。

## Open Questions

- 收编后的零件是否需要版本号跟随（`<项目> / 零件 / 三角-v2`）？暂定不跟随，零件升级 = 新增零件 + 父部件新版本。
- 组件属性的重建范围：只重建「文字属性」还是也包括布尔 / 实例交换属性？暂定只重建文字属性，其余报缺口。
- `samples`（2~3 份文档样本）的具体用途要不要收紧为「只核对母版重复度」？暂定是，不做内容级比对。
