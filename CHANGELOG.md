# CHANGELOG

## v2.4.1 — 2026-11-03

**0.3.8 回执：同步填图两条路同错 → 真因是槽形态判定，不是布局属性。** 引擎 `0.3.8` → `0.3.9`。

### 1. 真因：parts 结构档案把 GROUP 槽当成了裸矩形

`PARTS_PROFILE.figureSlot` 写死为 `'rect'`，于是 `named-group` 模板的配图条目（`GROUP`）在同步里被当成「条目节点自己就是要填图的矩形」，`rectId = group.id`。Figma 的 GROUP 没有 `fills` 属性，赋值抛 `TypeError: object is not extensible`；退化路径 `rasterizeNodeToImageFill` 拿同一个 id 去写 `fills`，同错。create 正常是因为渲染器按运行时结构找矩形。

- 新增 `figureSlotShape(nodeType, profile)`：`RECTANGLE` → 裸槽；`GROUP` / `FRAME` → 容器槽；类型未知才用档案兜底
- `plan.figure()` 改用它，`配图占位` 矩形与占位文案按容器槽正常解析
- 填图/刷图脚本兜底：目标不接受 `fills` 时自动下沉到组内矩形（防御性，不再信任传入 id）

### 2. 错误信息带步骤标签

`fillFigurePlaceholder[export|setFills]`、`rasterizeNodeToImageFill[setFills]`，`setFills` 失败时附 `targetType / id / hasFills`；`getGroup` / `getRect` 也各自带标签。以后同类问题一条 message 就能定位。

### 3. 测试与版本

- `figureSlotShape` 单测（GROUP/FRAME/RECTANGLE/未知类型 4 条）
- 72 files / 573 tests 全绿；`openspec validate --all --strict` 22/22
- 引擎 `0.3.8` → `0.3.9`

## v2.4.0 — 2026-11-03

**0.3.7 回执：同步填图仍挂（`object is not extensible`）、删图恢复仍静默。** 引擎 `0.3.7` → `0.3.8`。

### 1. 填图：把「图落上」与「收尾」拆开

真机 create 能填、reconcile 必挂。原因不是索引口径，而是填图脚本把**收尾步骤**（`group.layoutSizingHorizontal = 'FIXED'`、`group.resize`、`rect.x` 居中、`hint.remove`）和落图写在同一个 try 里：目标文档里的槽若不在 auto-layout 父级下，这些赋值会抛 `TypeError: object is not extensible`，整张图跟着丢。

- 落图（`rect.fills`）单独失败才算失败；其余步骤改成 `soft()` 逐步 try/catch，失败只记 `softFails`
- `layoutSizingHorizontal` 只在**父级真是自动布局**时才设
- 带裁剪导出失败 → 退化整图导出（记 `export.crop` 到 `softFails`）
- `fillFigurePlaceholder` 返回 `softFails`；reconcile 有值即发 `V2_W_FIGURE_FILL_FALLBACK`（图已落上、收尾失败）
- 退化路径也失败时 message 同时带两层错误

### 2. 删除带图配图槽：当场告警

配图删掉后像素不可恢复（标记里只有 `imageHash`），所以告警点从「重新插入时」前移到**删除时**：

- 删除带 `imageHash` 的配图条目 → `V2_W_FIGURE_IMAGE_LOST`，message 含条目文本、hash 前缀与「加回来时请给 assetMap」
- 重插时若旧标记里仍有 hash 且无资产，再发一次（同一告警码）

### 3. 测试

- `figure-crop.spec.ts` 修正 sizing 断言（无 auto-layout 父级时不再设 `FIXED`）
- 72 files / 569 tests 全绿

### 4. 版本

- 引擎 `0.3.7` → `0.3.8`；`ENGINE_VERSION` 与 `package.json` 同步

## v2.3.9 — 2026-11-03

**0.3.6 签收通过后的三条遗留：同步填图必挂、重插配图槽丢图、`inline-suffix` 静默丢职能。** 引擎 `0.3.6` → `0.3.7`。

### 1. reconcile 填图失败不再丢图

真机：同参数 create 能填，reconcile 报 `figma_execute failed: TypeError: object is not extensible`，整张图丢掉，只能新建重渲。

- 槽级填图（`fillFigurePlaceholder`：resize 组 + 删文案 + 清描边）失败时，**退化为 `rasterizeNodeToImageFill`** 只把图刷进矩形：图还在，尺寸不再按源图比例调
- 退化成功发 `V2_W_FIGURE_FILL_FALLBACK`（含原错误原文），失败才回到 `V2_W_FIGURE_FILL_FAILED`
- 这条同时覆盖「已存在文档补图」的主路径：不必再为新配图重渲整篇

### 2. 重插配图槽丢图改为显式告警

md 里删掉 `配图：` 再补回来，新槽是空槽，旧图不会自己回来（以前无声）。

- 计划阶段发现「同一条目的旧标记里记过 `imageHash`、本次又没给 `assetMap` 键」→ `V2_W_FIGURE_IMAGE_LOST`，message 带 assetKey
- `Plan` 新增 `warnings`，同步结果里与解析/快照告警合并返回

### 3. `roleAnnotation: 'inline-suffix'` 不再静默

模板声明把职能拼进标题，引擎只实现了 `component-variant`；以前 md 里的 `@GUI @程序` 直接消失且零告警（真机：蛋仔包「进入提示」）。

- 该能力下若有职能条目 → `V2_W_ROLE_ANNOTATION_UNSUPPORTED`，message 列出被丢掉的职能
- 实现留待单独排期（要定拼进标题还是新增一行，属设计决策）

### 4. 测试与版本

- 新增 `tests/v2/role-inline-suffix.spec.ts`（2 条：有职能 → 告警；`component-variant` → 不告警）
- 72 files / 569 tests 全绿；`openspec validate --all --strict` 22/22
- 引擎 `0.3.6` → `0.3.7`

## v2.3.8 — 2026-11-03

**同步路径把左列又拉回固定高；补 `figureSlotsUnhealthy` 计数。** 引擎 `0.3.5` → `0.3.6`。

### 1. reconcile 收尾复位章节 HUG

0.3.5 只在 create 收尾做了复位。同步里 `refreshChapterGeometry` 仍会跑「两列底边对齐」的 `stretchLeftColumn`，把左列 HUG 改成固定高：真机 create 后 1200 HUG，4 次 reconcile 后变 6716 / 10917 FIXED，手动改回 HUG 立刻恢复 1200。

- `stretchLeftColumn`：自动布局章节**直接跳过**（非自动布局的老模板保留对齐）
- reconcile 收尾：**每个**章节都 `normalizeChapterLayout`（不只检测到超限的），位置在全部写入之后、写文档标记之前

### 2. `summary.figureSlotsUnhealthy`

验收方不用写脚本判「是否真归一」：`figureSlotsNormalized` = 通过数、`figureSlotsUnhealthy` = 仍不合格数（应为 0）、`chaptersNormalized` = 复位章节数，三者从 parts 结果透传到 create 返回体。

### 3. 测试

- 新增 `tests/v2/chapter-left-column.spec.ts`：自动布局章节不再被拉伸 / 老路径保留对齐 / 收尾复位把 8000 拉回 1200
- 71 files / 567 tests 全绿

### 4. 版本

- 引擎 `0.3.5` → `0.3.6`；`ENGINE_VERSION` 与 `package.json` 同步
- 已安装方需重跑 `npm run install-mcp` 或重启 MCP

## v2.3.7 — 2026-11-03

**配图槽归一改用 GROUP 的坐标系；修 0.3.4 的 `gap` 未定义崩溃；summary 透传两个凭据字段。** 引擎 `0.3.4` → `0.3.5`。

### 1. GROUP 子节点坐标写在父级坐标系里（真机实测）

`rect.y = 814` 而 `rect.absoluteBoundingBox === group.absoluteBoundingBox` —— 视觉上贴在组原点，坐标却是父级偏移。0.3.4 把子节点「归零」，实际是把它挪到**父级顶端**，于是 60 条 `V2_W_FIGURE_SLOT_GEOMETRY` 全在误报坐标，占位槽的组高也差 16+70。

- 归一以组原点为基准平移：`GROUP` → `rect.x = group.x, rect.y = group.y`；`FRAME` 才用 0 基局部坐标
- 顺序固定：先摆矩形、再按矩形当前位置算文案 `y`（反序会让组 bbox 顶部漂移，间距算错）
- 校验改用**绝对坐标**：`rectAbs - groupAbs ≈ (0,0)`、`hintAbs.y ≥ rectAbs.bottom`、`groupAbs.h ≈ max(rectAbs.bottom, hintAbs.bottom) - groupAbs.y`

### 2. 修 0.3.4 的启动即崩

批量归一脚本里 `hint.y = rect.height + gap` 用了未定义的 `gap`（该作用域叫 `slotGap`），FRAME 槽走到这一行直接 `ReferenceError`。用户侧已本地热补——本版把两段脚本合并成一份 `figureNormalizeScript`，从根上消掉两份实现的漂移。

### 3. summary 透传

`v2/render.ts` 的 create 路径重新组了一个白名单 summary，把 `figureSlotsNormalized` / `chaptersNormalized` 丢了 —— 按「缺字段 = 旧进程」的判据会误判。已透传。

### 4. 测试

- 新增「槽的父级坐标不是原点」：模板槽落在 `y=814`，断言矩形/文案/组高都跟着组走，且零告警
- `figureSlotGeometryProblems` 单测改为绝对坐标口径（局部 y≠0 也算合格）
- 假后端补 GROUP 的父级坐标语义（子节点坐标即父级坐标、组 bbox 由子节点回算）
- 70 files / 564 tests 全绿

### 5. 版本

- 引擎 `0.3.4` → `0.3.5`；`ENGINE_VERSION` 与 `package.json` 同步
- 已安装方需重跑 `npm run install-mcp` 或重启 MCP

## v2.3.6 — 2026-11-03

**Bridge 端口所有权：渲染间歇性 `Cannot connect`、插件被迫手连、双活 supervisor 制造「升级无效」。** 引擎 `0.3.3` → `0.3.4`。

### 1. 端口回退改成主动自愈

子进程抢不到 9223 会**静默退到 9224/9225**，而 Figma 插件只认 9223 —— 我们连着自己的子进程，子进程连不上插件，于是只有走 `figma_execute` 的 render 失败，代理工具全部正常。旧实现只写一行 stderr 就放过。

- worker 启动时探测 `figma_get_status`：`portFallbackUsed=true` → 结束占用者（只认 figma-console 同类进程，别的程序占端口绝不强杀）→ **重拉子进程** → 最多轮询 3×2s 确认端口回正
- 恢复结果写进 `bridge.recovery`，stderr 留 `bridge recovery` 一行
- 回正不了也不让 worker 退出：渲染失败 ≠ 进程该退（旧的自我放大循环正是这么来的）

### 2. 可读错误码 + 可对账的桥状态

- `figma_execute` 报 `Cannot connect` 且存在端口回退时抛 **`E_BRIDGE_PORT_CONFLICT`**（`details.bridge` 带 `port / preferredPort / holderPid / enginePid / supervisorPid / recovery`），message 附两平台清理命令
- `get_skill_requirements` 新增 `bridge: { port, preferredPort, fallback, holderPid?, enginePid, supervisorPid?, recovery? }`：`fallback=true` 时 render 必失败、几何修复无关；`enginePid` 常变 = 多引擎在接请求

### 3. supervisor 单例

`~/.game-interaction-sop/supervisor.lock`（`{ pid, startedAt }`）：活着的所有者不是自己就让位 exit 0，pid 已死 / 文件损坏则覆盖。双活正是「`engineVersion` 报新版本、行为是旧代码」的根源。

### 4. 测试与文档

- 新增 `tests/server/bridge-state.spec.ts`（11 条）：诊断文案、端口回退归因、清理指引、锁让位 / 覆盖 / 释放
- `phase4-figma.md` 补：`bridge.fallback=true` 时不要判成几何或模板缺陷，先修端口
- 未做：桥进程与 proxy 共用的 lock 复用（`GISOP_BRIDGE_HOST=1` 的常驻宿主仍是实验开关）、插件侧退避重连（在 Figma 插件仓库，不在本仓）

### 5. 版本

- 引擎 `0.3.3` → `0.3.4`；`ENGINE_VERSION` 与 `package.json` 同步
- 已安装方需重跑 `npm run install-mcp` 或重启 MCP

## v2.3.5 — 2026-11-03

**二次反馈：0.3.2 的克隆期归一不够——填图后被压成 5px、缺资产槽被拉成 2500px，且零告警；同时左列被章节拉成整章高。** 引擎 `0.3.2` → `0.3.3`。

### 1. 收尾再归一 + 可观测凭据

克隆期归一只管「克隆那一刻」，之后填图（`fillFigurePlaceholder`）、文案拉宽（`growHintTexts`）、外层 auto-layout 拉伸都会再把槽弄坏。真机 0.3.2 验收：已贴图的槽被压成 5~7px，缺资产槽整组撑到 1035~2504px，`warnings` 里一条 `V2_W_FIGURE_SLOT_GEOMETRY` 都没有。

- 新增后端 `normalizeFigureSlots`（**一次 exec 批量**，39 槽逐个往返会顶穿 10s 连接上限）
- 渲染收尾（`layout` 之后）对文档内**每个**配图槽再归一：矩形回原点、文案贴下方、组高随内容；被压到个位数高度的已填图槽恢复到 ≥100px
- 逐槽校验，不合格 → `V2_W_FIGURE_SLOT_GEOMETRY`（带簇 +#序号）
- `summary.figureSlotsNormalized`：通过校验的槽数。**这是「代码真的跑了」的凭据**——文档有配图而它为 0，说明连的是旧进程 / 旧 build（本次验收就踩到：旧 server 进程 PID 49544 仍在服务）

### 2. 章节高度不再被相邻栏目拉长

横向章节里高的一栏会把另一栏拉成整章高：真机左列 `1920×10873`（`primaryAxisSizingMode: FIXED` / `layoutSizingVertical: FIXED`），内容只有一张 1920×1080 主图，主图下面几千 px 空白，整篇 53757（旧稿 19336），且同步会把这个固定高当既成事实越滚越大。

- 新增后端 `normalizeChapterLayout`：章节根 `counterAxisAlignItems = MIN` + 纵向 HUG；章节内自动布局栏目 `primaryAxisSizingMode = AUTO` / `layoutSizingVertical = HUG` / `layoutGrow = 0`
- 渲染收尾对每章执行一次，`summary.chaptersNormalized` 计数

### 3. 测试

- `render-figure-slot-geometry.spec.ts` 扩到 8 条：假后端复现「克隆槽 y 漂移 + 填图后压成 5px」两种真机症状，断言收尾归一救回（≥100px）并计入 `figureSlotsNormalized` / `chaptersNormalized`
- 未单独复现（缺进程内 parts 同步 harness，且端口竞争属进程层）：留在真机验收项

### 4. 诊断口径

- 验收先看 `enginePid` 是否每次渲染都变、`figureSlotsNormalized` 是否等于文档配图数；两者任一不对，先清进程再判定缺陷
- 端口竞争（9223）未在本轮修：归入待办，症状是「代理工具正常、render 报 Cannot connect」

### 5. 版本

- 引擎 `0.3.2` → `0.3.3`；`ENGINE_VERSION` 与 `package.json` 同步
- 已安装方需重跑 `npm run install-mcp` 或重启 MCP

## v2.3.4 — 2026-11-03

**修真机反馈：一簇多张配图时第 2 张起整组塌陷，以及带 `####` 的簇同步必崩。** 引擎 `0.3.1` → `0.3.2`。

### 1. 配图槽克隆后几何归一（`V2_W_FIGURE_SLOT_GEOMETRY`）

克隆模板的 `配图` GROUP 只带走子节点相对坐标，不带走模板槽当年的布局结算；而引擎只在**有资产**时调尺寸（`fillFigurePlaceholder`），缺资产分支只刷灰板和居中文案。于是第 2 张起 `配图占位` 的 y 沿文档流累加到 1987、矩形高剩 27、`配图占位文案` 压成 1~6px 或丢失，整组溢出簇框，`warnings` 还是空的。

- 新增后端方法 `normalizeFigureSlot`（单次 exec）：按克隆源的相对几何取间距真值，矩形回组内原点、文案贴矩形下方、组高 = 槽高 + 间距 + 文案高；auto-layout 组只固定尺寸，位置交给布局引擎
- 克隆分支、占位灰板分支、占位文案拉宽三处统一走归一（`centerHint` 独立居中逻辑删除）
- parts 路径补 `imageSeed.flush`：以前从不清理克隆源，每簇多留一个模板原生空 `配图` 框
- 归一后仍不满足不变式 → 软告警 `V2_W_FIGURE_SLOT_GEOMETRY`（含簇路径与实测尺寸），不再静默

### 2. parts 同步的条目序号与打标清单同源

打标条目清单只收 `正文/规则` + `配图`，计划侧却把 `####` 子标题算成一条 `subtitle`；`ref.i` 按「含标题」生成、解析时按「不含标题」取值，布局 7 条 vs md 9 条 → `scratch node not found`，dryRun 通过、真跑崩。

- `expectedItems` 新增 `includeSubtitles`，parts 侧传 `false`
- 越界改报 `V2_RECONCILE_ITEM_OUT_OF_RANGE`，message 带 `s/c/i`、簇标题与实测条目数（不再被包成 `V2_RECONCILE_RUNTIME_ERROR`）

### 3. 测试

- 新增 `tests/v2/render-figure-slot-geometry.spec.ts`：3 张配图全缺资产 / 缺图与填图混合 / 无占位文案 / 不变式函数单测
- `parts-backend` 复现真机症状（克隆槽 y 漂移）并提供归一实现；`expectedItems` 增补子标题用例
- `render-adaptive` 的「文案压在灰板正中」改为「文案贴在灰板下方」

### 4. 版本

- 引擎 `0.3.1` → `0.3.2`；`ENGINE_VERSION` 与 `package.json` 同步；`manifest.engineVersion` 仍为 `^0.3.0`
- 已安装方需重跑 `npm run install-mcp` 或重启 MCP

## v2.3.3 — 2026-11-02

**修用户反馈 #2 的三个阻断/体验缺陷：多部件渲染不认职能组件、主图实例压住标号、配置问题无法对账。** 引擎 `0.3.0` → `0.3.1`。

### 1. 多部件渲染支持职能标记组件

`render/parts` 此前调 `fillCluster` 时把 `roleBlocks` 写死成 `undefined`，导致 parts 路径下 `- @职能：…` 一律抛 `V2_ROLE_BLOCK_UNAVAILABLE`；报错里的 `variantPrefix` 还恒为兜底值 `职能标记=`，把用户引向「配置没读到」。

- 角色运行时由渲染入口解析一次，显式传到章节 / 簇填充
- `roleBlock.variantKeys`（跨库，`importComponentByKeyAsync`）优先于 `roleBlock.componentSetId`（仅渲染目标文件内）
- 页面文案与实际行为一致：parts 与 legacy 产出相同的组件实例

### 2. 主图实例保位，标号默认可见

`placeInstance` 原来用 `appendChild` 放主图实例再删占位，节点被移到父级末尾，直接盖住同父的 `气泡` ——9 个标号全部不可见，需要手工提层。

- 改为按占位原索引 `insertChild`，并继承占位节点名称（`主图占位` 槽位名保住）
- 连带修掉打标报「缺槽位 main」与主图统计归零

### 3. 角色 / 配置诊断可对账

- `loadRoleBlocks` 返回结构化结果，错误码区分：`V2_ROLE_BLOCK_SET_NOT_IN_TARGET_FILE`（跨库组件集）/ `V2_ROLE_BLOCK_UNAVAILABLE`（缺角色、非法键）
- 角色覆盖在克隆模板前预检，`details` 带 `missingRoles`，失败不落任何节点
- 渲染返回新增 `resolvedRoleBlock{mode,source,componentSetId,variantPrefix,labelTextName,roles}`、`configPath`、`enginePid`
- 主图槽缺失且有资产 → 新软告警 `V2_W_MAIN_SLOT_MISSING`；`imagesPlaced` 改按「实际落图」计
- **同步配套**（真机验收时发现）：parts 文档的 `@职能` 条目不再参与文本对齐（否则幂等同步每轮重复 `insert`）；主图实例替换后 stamp 写到新节点（否则下一轮报 foreign + 缺 main 槽）；`describeAsset` 支持 `figma_instance`

### 4. 文档

- tool description 补 `variantKeys` 跨库写法与优先级、锚点取值建议、`badgeAnchors` 整表缺省语义（不传 = 不告警）
- `template-contract.md` 新增「职能标记组件的调用规则」表
- `phase3-asset.md` 补锚点取值建议；`phase4-figma.md` 补多实例排查（`enginePid` / `configPath`）与「同步不支持把正文改写成 `@职能`」

### 5. 版本

- 引擎 `0.3.0` → `0.3.1`；`ENGINE_VERSION` 与 `packages/figma-mcp-server/package.json` 同步
- `manifest.engineVersion` 仍为 `^0.3.0`（semver 已覆盖 0.3.1）
- 已安装方需重跑 `npm run install-mcp` 或重启 MCP

## v2.3.2 — 2026-11-02

**默认文风（`style-default.md`）补齐 frontmatter；新增 Preflight 版本自检工具链。** 引擎 `0.2.0` → `0.3.0`。

### 1. `style-default.md` 带配置的 frontmatter

出厂默认文风此前只有 `## 簇结构约定` + `## 职能标注` 两段正文，frontmatter 只有 `schema_version` 与 `name`，agent 读到后把职能标注当「软建议」处理，职能拆分不触发。

本次 frontmatter 补齐三组机器契约字段：

- `verbosity.level: normal` / `bullets_per_cluster: 3-6`
- `role_annotation.mode: selective` + `when` 清单（8 条，覆盖配表 / 阈值 / 触发规则 / 新资源 / 动效）+ `never` 清单（通用交互 / 图上可见外观）
- `wording.tone: 直述` / `person: 无人称` / `sentence: 短句` + `banned` 禁用词（尽量 / 建议 / 大概 / 基本 / 差不多 / 待确认 / 待定 / 视情况 / 酌情）

落地效果：Phase 2 自检清单第「`role_annotation` 与 `- @职能：` 条目一致」项有可执行约束，职能标注会自动按清单拆成 `- @程序：…` / `- @策划：…` 条目；不再因为「default 没写明」而退化为模型直觉。

### 2. 新增引擎工具 `get_skill_requirements`（engine 0.3.0）

只读、无入参，返回 `{ requiredSkillVersion: "2.3.2", engineVersion: "0.3.0" }`。SKILL.md Preflight 会在会话开场调用它、比对本地安装的 skill `manifest.json` 版本号，低于 `requiredSkillVersion` 时提示升级。

契约细节：

- 常量 `REQUIRED_SKILL_VERSION` / `ENGINE_VERSION` 定义在 `src/server/createServer.ts` 顶部，与 `packages/figma-mcp-server/package.json` 的 `version` 手工对齐（review 时核对）
- 引擎 < 0.3.0 不提供此工具，Preflight 收到 `TOOL_NOT_FOUND` 后退化为「引擎版本较旧」的提示，不阻断

### 3. SKILL.md 新增 Preflight 段

在 `## 何时启用本 skill` 之前新开 `## Preflight — 开场版本自检（每次会话首轮必做）`：三步校验（读本地 manifest / 调引擎 / 比对），版本落后时输出软警告（含完整升级命令），用户确认后继续 Phase 0；不阻断、不替用户执行。

冷启动说明：本次 2.3.2 发布时，老用户（2.3.1 及更早）本地 SKILL.md 没有 Preflight 代码，因此本次升级靠团队公告而非 Preflight 自动触发。从 2.3.2 开始，后续所有版本切换都能被 Preflight 自动提醒。

### 4. 其他

- 版本 `2.3.2`（根包 / skill 包 / manifest / package-lock.json 需要本地 `npm install` 刷新）
- `manifest.engineVersion` 从 `^0.2.0` 升到 `^0.3.0`
- 引擎 `0.2.0` → `0.3.0`（新增工具属 API surface 变化，走 minor bump）

### 5. 已清理的技术债（同日补修）

- `openspec/specs/engine-mcp-server/spec.md` 原写「原生工具集 SHALL 恰好为 {validate_v2_markdown, render_v2_markdown_to_figma}」，与实际 5 个工具不符（存量 spec drift）。已同步为 5 个工具的清单，并把「不得改动已有工具契约」单独写成约束。
- `packages/figma-mcp-server/tests/server.spec.ts` 的「工具集合」断言已更新为 5 个（含 `get_skill_requirements`）。

## v2.3.1 — 2026-11-02

**标号按控件真实位置摆放（`badgeAnchors`）。** 引擎 `0.2.0`，本次改渲染入参与同步行为。

### 1. 新增可选入参 `badgeAnchors`

键 `"NN/C"`（章/簇，1 起），值为主图归一化坐标 `{x, y}`（0–1，左上原点），可带 `note`。命中就按锚点摆标号；某簇没给 → 退回模板网格并报 `V2_W_BADGE_ANCHOR_MISSING`；越界 → 夹到图内并报 `V2_W_BADGE_ANCHOR_OUT_OF_RANGE`；整表不传 → 行为与旧版完全一致。此前标号只由簇序号决定，每章永远排成一条斜线。

- skill 侧：`phase3-asset.md` 第 5 步逐簇确认锚点并落盘 `.interaction-sop/anchors/<需求名>.json`；`phase4-figma.md` 渲染前读该文件并入入参，不再重复问

### 2. 修正：只改标号位置时同步不生效

`reconcileV2` 在 markdown 没有改动时直接返回 `changes:[]`，锚点根本没写进画布。现在：传了 `badgeAnchors` 且 md 未改，同步仍会按锚点重摆标号（`changes` 仍为空，报告语义不变）。

### 3. 修正：已有标号不跟锚点走

`placeBadges` 此前对已存在的标号只复用不移动。现在给了锚点的簇会移动已有标号；没给锚点的簇保持画布原坐标（不覆盖设计师手拖）。同步只改部分锚点时不再逐簇刷「缺锚点」告警。

### 4. 其他

- 版本 `2.3.1`（根包 / package-lock.json / skill 包 / manifest）
- 主 spec 增补：`engine-mcp-server`（`badgeAnchors` 契约）、`render-reconcile-parts`（同步按锚点重摆）

## v2.3.0 — 2026-11-01

**开场先要设计稿；每簇默认配图；交付前必做配图审计。** 引擎同步改动（仍 `0.2.0`）：识别声明式「配图：无」，不再为该条建槽/画灰板/报缺图。

### 1. Phase 1 开场改为设计稿优先

第一回合先问"有设计稿 / Figma 链接吗"，拿到图就按路径 A 以图为骨架提问，策划文档降为规则补充源；用户明确没图才转路径 B。设计稿**不是硬前置**，不阻塞流程。开场话术只出现一次，用户已主动贴图时改写为确认句。

### 2. Phase 2 每簇默认配图

每簇（`###`）至少一条 `- 配图：`；例外两种：整簇无可指认视觉对象，或用户显式要求本次不配图。两种都写 `- 配图：无（理由：…）`（判据四类：纯配表数值 / 纯服务端规则 / 纯环境演出 / 用户要求本次不配图），不准静默省略。主图已覆盖的簇仍要写一条 `配图：` 指向主图区域，或走例外。自检清单新增「每簇配图已覆盖」并按簇列出未覆盖项。与 W3 叠加：W3 管配图放哪，本规则管有没有。

### 3. Phase 4 新增配图审计

渲染成功与同步完成后，先读引擎统计（`summary.figuresPlaced` / `figuresPlaceholder` + `V2_W_FIGURE_ASSET_MISSING` / `V2_W_FIGURE_FILL_FAILED`），再按章节截图核对正文旁是否仍有灰板/虚线占位，合并成缺图清单（章节 / 簇 / 描述 / 状态 / 该做什么）报给用户，并提醒「别忘了手动配图」。审计只读画布、不拦交付、不触发重渲染；用户说"先这样"直接进 Phase 5。`figure_opt_out` 为真（Phase 2 要求不配图 / Phase 3 说"配图先不贴"）时整节审计跳过，配图类软告警也不逐条说明，只报一句"按你要求本次不配图"。

### 4. 其他

- `phase3-asset.md` 配图资产段改为"只做映射"，不再问"要不要配图"
- `SKILL.md` description / Phase 切换规则 / 输出契约 / 严禁跨 Phase 同步（Phase 1 索要设计稿仅为取材，不等于 Phase 3 资产确认）
- 版本 `2.3.0`（根包 / package-lock.json / skill 包 / manifest），`engineVersion` 不变
- 引擎（`0.2.0`）：`配图：无（理由：…）` 不建图槽、不画灰板、不计 `figuresPlaceholder`、不抛 `V2_W_FIGURE_ASSET_MISSING`；该条目也不计入 `"NN/C/K"` 的 K 序号

## v2.2.2 — 2026-10-26

**默认文风随 skill 分发，新用户零配置即可生效。**

- 新增 `packages/skill/references/style-default.md`（簇结构约定 + 职能标注），作为出厂默认文风
- **加载规则改为**：项目里没有任何 `style*.md` 时，Phase 1 直接加载这份内置文件，不再回落到"skill 通用默认表述"；因此新下载 SOP 的用户无需任何配置就能得到同一套文档结构
- `style-mod-schema.md`「默认 style.md 模板」改为指向该文件（不再内联两份）；Phase 5 在项目无文风文件时，先复制它生成 `style.md`，再复制出 `style_own.md` 沉淀
- `manifest.references`、`SKILL.md` 项目级配置与文件索引、`phase1` / `phase2` / `phase5`、`README` / `SETUP` / skill README 同步
- 版本统一 `2.2.2`（根包 / lock / skill 包 / manifest）；引擎仍为 `0.2.0`

## v2.2.1 — 2026-10-26

SOP 增加文风沉淀闭环（新 Phase 5），文风文件改成三角结构，Figma 连接插件改以社区插件为首选。Skill `2.2.1`，引擎仍为 `0.2.0`（无引擎代码改动）。

### 1. 新增 Phase 5 · 文风沉淀（原 Phase 5 模式库顺延为 Phase 6）

**是什么**：Phase 4 交付完成后统一收口，把这一轮被人工改过的**表述**沉进文风文件。两个入口：

- **md 入口**：Phase 2 保存 Markdown 时同时落基线快照 `<项目根>/.interaction-sop/snapshots/<需求名>.md`；Phase 5 用「快照 vs 现行 md」diff，只提取表述层改动（措辞 / 句式 / `@职能` 标注 / 动效句 / 红点四要素 / bullet 粒度），归成条目后**列清单一次确认**
- **Figma 入口**：主动问一句「你在 Figma 里改过表述吗」，用户给链接 / node 后读回文本，与快照逐条比，结论合并进同一张清单

**为什么合并**：原 Phase 2 / Phase 4 各有一道回写闸门，审核轮里反复追问；现在只在 Phase 5 问一次。

**写入规则**：写前备份 `.bak`，只改涉及字段与正文段；`style.md` 任何情况下不写入。

### 2. 文风文件三角结构

| 文件 | 角色 | 写入方 |
|---|---|---|
| `style.md` | 项目默认干净基线，只读 | 仅人工 |
| `style_own.md` | 个人文风，存在即默认生效 | Phase 5 自动沉淀 |
| `style_<name>.md` | 他人 / 分享 / 导入 | 导入，或本次被选中时沉淀 |

选择顺序：只有 `style.md` → 用它；有 `style_own.md` → 用它（不问）；存在任意 `style_<name>.md` → **每份文档问一次用哪份**（默认 `style_own.md`）；一个都没有 → skill 默认文风。首次沉淀以 `style.md` 为基底复制出 `style_own.md`。

契约见 `packages/skill/references/style-mod-schema.md`。

### 3. Figma 连接失败优先社区插件

`figma_list_open_files` 返回 `No files connected`，或渲染报 `V2_BACKEND_UNAVAILABLE` / `V2_TARGET_FILE_UNREACHABLE` 时，先让用户在目标文件里启动
<https://www.figma.com/community/plugin/1695400514520991057>（**网页端即可，不必装客户端**），起不来再回退本地 Desktop Bridge。SKILL.md 全局原则、phase3、phase4、SETUP.md、INSTALL.md、引擎 README 已同步。

### 4. 其他

- `phases/phase5-extract.md` → `phases/phase6-extract.md`，内部 Phase 编号、`deviation-schema` / `index-schema` 引用同步
- `phase3-asset.md` 新增「母版必须放子版」：`COMPONENT` / `INSTANCE` / `COMPONENT_SET` 主图一律 `figma_instance`，`COMPONENT_SET` 先选定变体
- `manifest.json` `engineVersion` 修正为 `^0.2.0`（原先 `^0.1.0` 覆盖不到实际引擎 `0.2.0`）
- 文档同步：根 `README.md`、`packages/skill/README.md`、`agents/openai.yaml`、`V2.md`、`openspec/specs/project-pattern-library/spec.md`

---

## v2.0.0 — 2026-10-23

本次把 SOP 从「必须在本文件渲染」推进到「库引用 + 职能描述 + 文风可学习」。引擎同步升到 `0.2.0`。

### 1. 库引用模式：任意 Figma 文件直接生成，主图保留母版子版关联

**是什么**：模板与「职能标记」发布到组件库后，引擎按 `componentKey` / `variantKeys` 用 `importComponentByKeyAsync` 导入实例。目标文件不再需要预先放模板，只要该文件能访问组件库。

**配置**（`~/.game-interaction-sop/template.json`）：

```json
{
  "template": { "componentKey": "<模板组件发布 key>" },
  "roleBlock": {
    "variantPrefix": "职能标记=",
    "labelTextName": "文本",
    "variantKeys": {
      "程序": "<key>", "GUI": "<key>", "拼接": "<key>",
      "美术": "<key>", "动效": "<key>", "音频": "<key>", "策划": "<key>"
    }
  }
}
```

**实现要点**：

- `target.fileKey` 可省略（写当前活动文件），库引用模式下不再探测目标文件里的模板节点
- 导入的模板实例在 Figma 里是只读结构，引擎先 `detachInstance()` 再填充；detach 会**换节点 id**，渲染全程使用返回的新 Frame
- `roleBlock.variantKeys` 支持别名：`音效 → 音频`、`vx/VX/特效 → 动效`、`开发 → 程序`

**主图用真实实例（`figma_instance`）**：新增 asset 类型，取源节点（COMPONENT 用 `createInstance`，INSTANCE 用 `clone`），挂到 `主图占位` 的父级 `rec组`，等比缩放并居中，删除占位矩形。文档里保留的是**母版的粘贴子版**，不是栅格图片；后续可直接在 Figma 改实例覆盖。

```json
{
  "01": { "type": "figma_instance", "fileKey": "…", "nodeId": "523:7289" },
  "02": { "type": "figma_instance", "fileKey": "…", "nodeId": "523:7288" }
}
```

**图片路径**：插件沙箱无法 `fetch` `file://` 和 `localhost`，`image` 类型的本地路径由引擎服务端读文件转 `data:` URI 后再交给插件。

### 2. `- @职能：正文` 条目：按职能单独成条

**写法**：

```markdown
- @策划：标记类型清单、默认类型、呼出阈值走配表
- @音频：标记落地时播放标记提示音
- @动效：标记落地时图形快速放大落定
```

**规则（T11）**：

- 一个职能一条；两个职能拆两条
- 普通 bullet 不夹带职能归属（"（策划配表）"这类要拆出去）
- 正文自包含，不写"同上""见上一条"
- 不放角色名本身（`@策划：策划负责…` 错）
- 归属不明回 Phase 1 问，不猜

**渲染**：按变体名匹配（`职能标记=#策划` / `职能标记=策划`），原位生成组件实例并写正文 TEXT；实例名统一还原为 `职能标记=<角色>`，保证同步模式可识别。缺组件集或缺变体直接报 `V2_ROLE_BLOCK_UNAVAILABLE`，不静默降级。

### 3. 文风 mod：影响生成的表述方式

**位置**：`<项目根>/.interaction-sop/style.md`（契约见 `packages/skill/references/style-mod-schema.md`）

**三组字段**：

| 组 | 作用 |
|---|---|
| `verbosity` | 精简 / 常规 / 啰嗦；每簇 bullet 数量区间 |
| `role_annotation` | `always / selective / never`；哪些内容该写 `@职能`、哪些不写 |
| `wording` | 语气、人称、长短句、术语替换、禁用词 |

**优先级**：可覆盖 T1 / T3–T9；不可覆盖引擎硬校验（H*/C2）、状态行规则（T10/W7/W8）、T2 丢弃判据。冲突时保留不可覆盖项。

### 4. 修改回写：文风 mod 会学习你的修订

**循环**：

1. 我产出 Markdown
2. 你直接改文档
3. 我对「AI 稿」与「你的修订稿」逐条 diff
4. 把可复用差异写回 `style.md`（一次最多 3 个字段，避免过拟合）
5. 追加「学习记录」：来源、学到什么、落到哪个字段

已积累的规则示例：

- 动效句必须写成 `- @动效：` 条目，不用簇末无前缀句
- 角色 token 只写 `@动效`，口语 `@vx` 不落文档
- 轮盘 / 按钮等界面图标归 `@GUI`，`@美术` 只管立绘、模型、材质、特效

---

### 兼容与回退

- 旧配置（`template.fileKey` + `nodeId`、`roleBlock.componentSetId`）继续可用；删掉 `componentKey` 即回退到同文件模式
- 同步模式（`rootId`）继续支持；本次修复了测试读取开发者本机配置的问题（`GISOP_TEMPLATE_CONFIG=off`）

### 已知限制

- 组件库必须已发布，且目标文件所在团队可访问
- 变体命名须以 `职能标记=` 开头（后缀可带 `#`）
- `配图：`（`NN/C/K`）目前只支持 `figma_node` / `skip`，不支持本地图片与实例
- 库引用模式下模板实例会被 detach，文档与模板后续改动不再联动
- 职能块的实例内部文本暂不参与同步字符比对，会以 `preserved / hand-edit` 出现在同步报告里
