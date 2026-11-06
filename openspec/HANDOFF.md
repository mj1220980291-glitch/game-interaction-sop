# 交接说明（2026-11-03）

## 产品汇报图补充（2026-11-06）

新增 `docs/architecture/leadership.html`，与原有架构海报分开，主图固定 16:9，面向管理者解释使用流程、后台协作和经验复用。术语采用「AI 协作助手 / 规则化内容中枢 / 文档自动生产」，不在主图展示工程标识。附讲解备注、全屏与高清导出，配套预览和 4K 图片。内容依据当前 SOP 阶段文件及渲染、校验、同步实现；保留人工确认、冲突处理和知识维护的能力边界，不涉及功能和版本变更。对应规范：`openspec/specs/leadership-architecture/spec.md`。

## 当前状态快照（2026-11-04 10:57，换对话先读这一节）

**一句话**：回执 E1–E7 / S1–S5 与 0.4.1 验收不通过项（B/P1/P2/P3）**全部关闭并签收**。引擎 `0.4.6`、skill `2.4.3`、`requiredSkillVersion 2.4.0`。

**0.4.6（2026-11-06，0.4.5 验收返工）**：0.4.5 修完假阳性后**过量跳过** — 审计从章节节点起走，章节上方的根帧（默认白）与章节外框（#161616）不在子树里，章节自身 `fills=[]`，于是「无实心祖先」整章跳过；恰好把 11-04 白底浅字事故屏蔽掉（验收用例 B 第二条判据不可达）。修法：`auditTextContrast` 新增 `inheritedBackground`（章节外框内层 fill → docBackground → #FFFFFF），脚本以它作起始背景，章节内实心底仍优先。顺带：截图 `retryTransient` 3×3s（真机两次 `Unable to establish connection … 10 seconds`）；文档写清 `V2_W_RENDER_RETRIED` = 已自动重试成功无需干预、`V2_W_SCREENSHOT_FAILED` = 画布是好的别重渲染。回归 84 files / 659 tests。

**0.4.5（2026-11-06，验收返工）**：0.4.4 验收打出**假阳性** — 正常配置下 3 章 98 条 `W_TEXT_CONTRAST_LOW`，数据恒为「文字 #FFFFFF / 背景 #FFFFFF / 1.00:1」。根因：`buildContrastAuditScript` 把 TEXT 自己的填充当成背景传下去，`ratio(fill, fill)` 恒等于 1；与 `geometry` 在不在无关，正好解释「缺不缺数值一样」。修法：`nextBg` 只由非 TEXT 节点决定、比值一律用祖先 `bg`、无实心祖先计 skipped；脚本提成可单测的 `buildContrastAuditScript` + 7 条真脚本回归（假 figma 树）。回归 84 files / 657 tests。**待验收**：0.4.5 重跑，正常配置应为 0 条对比度告警，缺 geometry 时应报「`#EEEEEE` / `#FFFFFF` / 约 1.1:1」。遗留：9.5.1 bridge 快照缓存、9.5.2 截图 10s 连接超时（`V2_W_SCREENSHOT_FAILED`，非渲染失败）。

**0.4.4 / skill 2.4.3（2026-11-05）**：`template-pack-baseline-and-audit` 代码线落地 — 六級查找（第 5/6 级为随引擎分发的基线包 `assets/packs/default.json`，官方 1.14）、`V2_TEMPLATE_KEY_STALE`、观感自检（`W_PACK_GEOMETRY_DEFAULTED` / `W_TEXT_CONTRAST_LOW`）、只读工具 `audit_template_pack`。0.4.4 验收：用例 1/3/5/6 通过，用例 2/4 因对比度假阳性阻塞 → 0.4.5 修掉。**仍待办**：两套基线包重编（官方1.14 补 placeholder/bubbleGrid/docPadding/footerGap；蛋仔缺包）+ `captureGeometryFromKeys` 透传 `sectionSourceId` + `deep` 的 fingerprint 比对。

**0.4.3 / skill 2.4.2（2026-11-04，已实施待真机）**：`fail-fast-bridge-liveness` 的 P0 全部落地。现场：变色龙项目渲染恒报 `V2_RENDER_RUNTIME_ERROR / Cannot connect`、`enginePid` 每调都变。日志真相是宿主 60.000s 请求超时 → `self-heal triggered … -32001` → 重启整个 MCP；触发原因是「插件 socket 在、sandbox 假死」。修法：活链判定改为插件回环往返（`pluginConnected` / `lastRoundtripMs`）、渲染探活默认开（`GISOP_PREFLIGHT=0` 才关）、单次 exec 客户端上限 `插件 timeout + 5s` 返回 `V2_BRIDGE_NO_REPLY`、诊断补第三态、返回体带 `bridge` 快照、worker boot 探活不阻塞。回归 80 files / 631 tests 全绿。**待真机**：假死机上确认 20s 内拿到 `V2_BRIDGE_NO_REPLY` 且宿主日志无 `self-heal triggered`。

**验收凭据（M1/M2/M3，enginePid 40712，bridge 9223）**：

| 项 | 观测 |
|---|---|
| B adopt 真跑 | `knfkg9iz` ok:true、无 `SCRATCH_MISMATCH`；5 条 `needs-new-node` + `V2_W_RECONCILE_NO_CREATE`（降级通过）；画布 949→949、标号 18→18、preserved 全在 |
| dryRun 一致性 | `y4yalzov` changes `[]`、conflicts 7 条与真跑逐 path/kind 相同 |
| 幂等 | `lp1aor57` `changes: []`；M2 `72g666bt` → `9nr3vchu` 同 |
| P1 清单 | reconcile 带 `bubbles`：M1 18（4/6/4/4）、M2 9（3/6）、M3 16（6/7/3），40/40 nodeId 画布复核一致 |
| P2 | 旧文案只剩单路径（`V2_TEMPLATE_FILE_UNREACHABLE`）；5 次同步无 `packMissing` |
| P3 | 锚点文案命中「adopt 模式跳过标号重排」；`02/2/#12` 三次同步无二次 `FIGURE_IMAGE_LOST` |

**关键修复记忆点**：`dryRun` 不跑 scratch、真跑才跑 → adopt（无包）时计划过、真跑炸。现在 `planReconcile({canCreate})` 在**计划阶段**判定能不能建节点，不能建就记 `conflicts[kind=needs-new-node]`，两种模式结论一致。这条已写进 `docs/figma-mcp-pitfalls.md` 陷阱 8。

**遗留（不阻断）**：
1. M1 的 5 处 `needs-new-node` 待模板包配回后重跑补齐：`02/1/#3`、`02/2/#6`、`02/2/#12`、`02/5/#5`、`04/1/#3`
2. 环境侧：验收机 git/npm 不在 PATH，构建走绝对路径 `node + npm-cli.js`（非引擎缺陷）；同一台机器的 `PATH` 还缺 `C:\Program Files\nodejs`，裸 shell 下 worker `spawn npx` 会 ENOENT
3. 环境侧：host 若同时配独立 `figma-console` MCP 条目，它常驻占 9223 → 引擎子进程退到 9224 → 3 次 boot 后 `fatal`，表现为「引擎 MCP 连接失败」（工具全不在列表里）。排障见 `packages/figma-mcp-server/docs/INSTALL.md`「引擎 MCP 在 host 里连接失败」
4. 删图恢复不丢图、`####` 自动降级、worker↔bridge 解耦、parts 同步 harness —— 仍为旧遗留

**代码状态**：build ✓；`npx vitest run --no-file-parallelism` 79 files / 621 tests 全绿（并行会被 Windows 临时文件锁吃掉 7 个文件，必须串行）。

---

## 上一轮快照（2026-11-03 14:45）

**一句话**：`inline-suffix` 职能实现完成（引擎 `0.4.0`）：职能拼在**第一条普通正文句尾**并上色，同步侧同口径。新 change `implement-inline-role-suffix` 待真机验收。

**实现要点**（用户澄清后修正的认知）：蛋仔这类模板**没有职能组件位**，职能以 `@GUI @程序` 跟在条目后面、且带色；机制早就有一半（`paintRoleTokens` 上色），缺的是「拼上去」这一步。

- `v2/role-suffix.ts`：`withInlineRoleSuffix` 跳过配图与 `@职能` 条目，只拼第一条普通正文
- `expectedItems({inlineRoles})` + `PlanOptions.inlineRoles`：同步按同一文本比对，否则幂等会来回重写
- `V2_W_ROLE_ANNOTATION_UNSUPPORTED` 停止发射（能力已实现）

**待验**：蛋仔包渲染 → 首条正文以 ` @GUI @程序` 结尾且带色；同 md 两次同步 `changes: []`；改一条正文只更新那一条且后缀仍在。

**其余遗留不变**：删图恢复不丢图（stamp schema）、`####` 自动降级、worker↔bridge 解耦、parts 同步 harness。


**一句话**：主串联联调收口。`fix-figure-slot-geometry-and-item-index`（0.3.6 签收）与 `fix-reconcile-fill-and-role-fallback`（0.3.9 复验）**两个 change 都已归档**；同步补图链路打通，M1 配图 20/39。引擎 `0.3.9`，已推送 `fbc22e9`。

**P1 真因（值得记住）**：不是对象被冻，而是 `PARTS_PROFILE.figureSlot` 写死 `'rect'` —— `named-group` 模板的配图条目是 `GROUP`，同步把它当裸矩形，`rectId = group.id`；GROUP 没有 `fills`，赋值抛 `object is not extensible`，退化路径拿同一 id 同错。修法：`figureSlotShape(nodeType, profile)` 按节点类型判，档案只兜底。

**本轮新增能力（都真机验过）**：
- 同步补图可用（0.3.9：两图落上、`errors/warnings` 空、二次幂等、引擎图 vs 手工图区分正确）
- 删除带图配图 → `V2_W_FIGURE_IMAGE_LOST`（0.3.8 验过）
- `inline-suffix` 职能丢失 → `V2_W_ROLE_ANNOTATION_UNSUPPORTED`（0.3.7 验过）
- 章节左列 HUG / 配图槽绝对坐标归一 / 同步条目序号 / Bridge 端口所有权（0.3.6 基线）

**遗留（明确未做，等决策）**：
1. `inline-suffix` **实现**（拼进 `#Title_Main` 还是新增一行）——需设计确认，蛋仔投产前必须定
2. 「删图→恢复不丢图」——要 stamp schema 存 `{assetKey, imageHash}`，或改「删除即隐藏保留像素」
3. `####` 在 `clusterGroups: none` 上自动降级展平——需先定语义
4. worker 与 bridge 生命周期解耦
5. parts 同步的进程内 harness（技术债）

**代码状态**：build ✓，`npm test` 72 files / 573 tests 全绿，`openspec validate --all --strict` 22/22。

---

## 上一轮快照（2026-11-03 13:40）

**一句话**：0.3.6 已签收归档并推送（`0086553`）。0.3.7 回执：P3 ✅、P1/P2 ❌ → 已定位 P1 真因并修（填图脚本把「落图」和「改布局属性」写在同一个 try，`layoutSizingHorizontal` 在非 auto-layout 父级下抛 `object is not extensible`，整张图跟着丢）；P2 告警点前移到**删除时**。引擎 `0.3.8`。

**本轮两条**：

1. 填图拆成「落图（硬失败）」+「收尾（`soft()` 逐步吞错，记 `softFails`）」；`layoutSizingHorizontal` 只在父级真 auto-layout 时设；裁剪导出失败退整图导出；`softFails` 非空 → `V2_W_FIGURE_FILL_FALLBACK`；两条路都挂才报 `FILL_FAILED`（message 带两层错误）
2. `V2_W_FIGURE_IMAGE_LOST` 前移到删除带 `imageHash` 的配图条目时；重插若仍有留痕再发一次

**回归口径**：39 槽 39/39、组高 323、告警 0、四章 1200 HUG、两次同 md `changes: []` —— 这些是已签收基线，改填图脚本后必须仍然成立。

**技术债（未做）**：`####` 在 `clusterGroups: none` 上自动降级展平（需先定语义）；worker 与 bridge 生命周期解耦；parts 同步进程内 harness。

**代码状态**：build ✓，`npm test` 72 files / 569 tests 全绿，`openspec validate --all --strict` 22/22。

---

## 上一轮快照（2026-11-03 13:20）

**一句话**：`fix-figure-slot-geometry-and-item-index` **0.3.6 真机签收通过并已归档**（specs +7）；剩余三条遗留（reconcile 填图必挂 / 重插配图槽丢图 / `inline-suffix` 静默丢职能）落在新 change `fix-reconcile-fill-and-role-fallback`，引擎 `0.3.7`。

**签收证据**（用户回执）：39 槽绝对坐标 39/39、占位组高统一 323、几何告警 0；create + reconcile ×3 四章左列恒 1200 HUG / 行 MIN；两次同 md `changes: []`；端口 `fallback:false` 且 3 次 render 无需 taskkill。

**新 change 已做（未真机验）**：

1. reconcile 槽级填图失败 → 退化 `rasterizeNodeToImageFill`（图不丢）+ `V2_W_FIGURE_FILL_FALLBACK` —— 解开「旧文档补图只能重渲」
2. 重插配图槽原本有图但无资产 → `V2_W_FIGURE_IMAGE_LOST`（`Plan.warnings` 新通道）
3. `roleAnnotation: inline-suffix` → `V2_W_ROLE_ANNOTATION_UNSUPPORTED`（蛋仔包投产前必须决定「拼标题 vs 新增一行」，只告警不实现）

**代码状态**：`npm run build` ✓，`npm test` **72 files / 569 tests** 全绿，`openspec validate --all --strict`（归档后待复跑）。工作区待提交。

**下一步**：提交本轮（含归档）；用户侧装 0.3.7 验 ①补图 ②删图恢复告警 ③蛋仔包告警。

**技术债**：parts 同步的进程内 harness 仍缺（条目序号/重插丢图只能真机验）；worker 与 bridge 生命周期解耦仍未做。

---

## 上一轮快照（2026-11-03 12:45）

**一句话**：0.3.5 验收基本全绿（Bug 1 / Bug 2 / 端口层 / create 路径 Bug 3），只剩一个真缺陷：**reconcile 路径没复位左列 HUG**（create 后 1200，4 次同步后 6716 / 10917 FIXED）。已修，引擎 `0.3.5` → `0.3.6`。

**本轮两处**：

1. `stretchLeftColumn`（两列底边对齐）对**自动布局章节直接跳过** —— 它就是 `resizeNode(left, w, taller)` 把 HUG 改成固定高的元凶；reconcile 收尾对**每章**跑 `normalizeChapterLayout`，排在全部写入之后、写文档标记之前
2. `summary.figureSlotsUnhealthy`：归一后仍不合格的槽数（应为 0），验收不用写脚本

**判据修订**（用户侧提的）：整篇高度不再要求「2 万量级」——39 槽 × 323 ≈ 12.6k 是硬下限；改为「占位槽组高统一 323 + 章节高 = 内容高」。

**代码状态**：`npm run build` ✓，`npm test` **71 files / 567 tests** 全绿，`openspec validate --all --strict` 22/22 ✓。工作区未提交。

**下一步**：用户侧装 0.3.6，跑「create → reconcile ×2」，四章左列恒 HUG 且高 = 标题 + 主图 → 签收，归档 change。

**已知未做**：worker 重启时 bridge 子进程与 worker 生命周期解耦（两次回执都提过，值得单独立项）。

---

## 上一轮快照（2026-11-03 12:20）

**一句话**：0.3.4 验收回执：端口 ✓、Bug 3（左列 HUG）✓；Bug 1 根因换成 **GROUP 子节点坐标写在父级坐标系**（不是 auto-layout）；另抓出 0.3.4 的 `gap` 未定义崩溃 + summary 丢两个凭据字段。已全部修，引擎 `0.3.4` → `0.3.5`。

**本轮四条**：

1. 归一以**组原点**为基准平移子节点：`GROUP` → `rect.x = group.x / rect.y = group.y`；`FRAME` 才用 0 基局部坐标。顺序固定「先矩形、再文案」
2. 校验改用**绝对坐标**：`rectAbs - groupAbs ≈ (0,0)`、`hintAbs.y ≥ rectAbs.bottom`、`groupAbs.h ≈ 内容高` —— 0.3.4 的 60 条告警正是拿局部坐标判「不在组内原点」造成的误报
3. 修 `gap is not defined`：两份插件脚本（单槽/批量）合并成 `figureNormalizeScript`，从根上消掉漂移；`render.ts` 的 summary 白名单补 `figureSlotsNormalized` / `chaptersNormalized`
4. 假后端补 GROUP 父级坐标语义 + 新增「槽的父级坐标不是原点（y=814）」用例

**代码状态**：`npm run build` ✓，`npm test` **70 files / 564 tests** 全绿，`openspec validate --all --strict` 22/22 ✓。工作区未提交。

**下一步**：用户侧装 0.3.5 → 先看 `get_skill_requirements().bridge.fallback === false` → 再验 `figureSlotsNormalized` 与几何、整篇高度（应回 2 万量级）、同步两次幂等且章节高度不变。

**已知未做**：worker 重启时 bridge 子进程与 worker 生命周期解耦（回执 §1 建议）；parts 同步的进程内 harness。

---

## 上一轮快照（2026-11-03 11:30）

**一句话**：第三份反馈是 Bridge 端口 9223 所有权竞争（render 间歇 `Cannot connect`、插件被迫手连、双活 supervisor 制造「升级无效」）。已修：端口回退自动自愈（清占用者 + 重拉子进程 + 轮询回正）、`E_BRIDGE_PORT_CONFLICT` 可读错误、`get_skill_requirements` 回 `bridge` 诊断、supervisor pid 单例。引擎 `0.3.3` → `0.3.4`。

**本轮关掉的三条**（回执 §2/§3）：

1. 子进程退到 9224 时以前只写一行 stderr → 现在 worker 探测到 `portFallbackUsed` 就结束同类占用者、**重拉子进程**、3×2s 轮询回正；回正不了也不让 worker 退（自我放大循环的源头）
2. 报错只有 `Cannot connect` → 现在 `E_BRIDGE_PORT_CONFLICT`，`details.bridge` 带 `port / holderPid / enginePid / supervisorPid / recovery` + 两平台清理命令
3. 双活 supervisor → `~/.game-interaction-sop/supervisor.lock`，第二份让位 exit 0

**明确未做**：桥进程与 proxy 的 lock 复用（`GISOP_BRIDGE_HOST=1` 仍实验）、插件侧退避重连（在 Figma 插件仓库）。

**上一轮的两条仍等真机复验**（被端口问题阻塞）：配图槽收尾批量归一 + 章节高度自愈。凭据字段 `summary.figureSlotsNormalized` / `chaptersNormalized`。

**代码状态**：`npm run build` 通过，`npm test` **70 files / 563 tests** 全绿，`openspec validate --all --strict` 22/22 通过。工作区未提交。

**下一步**：让用户侧装 0.3.4 → 确认 `get_skill_requirements().bridge.fallback === false` → 再跑几何验收。

---

## 上一轮快照（2026-11-03 11:00）

**一句话**：用户侧 0.3.2 验收回执：Bug 2（同步条目越界）通过；Bug 1（配图几何）**未修好**且零告警；另报新 Bug 3（左列被拉成整章高）。
已按回执做第二轮：克隆期归一只覆盖「克隆那一刻」，改为**渲染收尾批量再归一**；新增章节高度自愈；新增 `summary.figureSlotsNormalized` 作为「新 build 真在跑」的凭据。引擎 `0.3.2` → `0.3.3`。

**二轮三条改动**：

1. `normalizeFigureSlots`（后端，一次 exec 批量 39 槽）：矩形回原点、文案贴下方、组高随内容；**已填图被压到个位数高度的槽恢复到 ≥100px**。渲染 `layout` 之后对全篇每个 `配图` 槽执行，逐槽校验 → `V2_W_FIGURE_SLOT_GEOMETRY`（带簇 + `#序号`）
2. `normalizeChapterLayout`：章节根 `counterAxisAlignItems=MIN` + 纵向 HUG，栏目 `AUTO/HUG/layoutGrow=0` —— 修左列 `1920×10873`
3. 可观测：`summary.figureSlotsNormalized` / `chaptersNormalized`。**回执里 `warnings` 全空的可疑点**：0.3.2 的告警只在克隆期发，且旧 server 进程（PID 49544）可能仍在服务；这两个计数为 0 而文档有配图 ⇒ 连的是旧 build / 旧进程

**Bug 2（已通过，随本次归档）**：`expectedItems` 加 `includeSubtitles`，parts 传 `false`；越界报 `V2_RECONCILE_ITEM_OUT_OF_RANGE`。回执确认幂等 `changes: []`、无 `scratch node not found`。

**明确未修**（回执 P1/P2）：端口 9223 竞争与旧进程残留（→ 另开 `E_BRIDGE_PORT_CONFLICT` change）；parts 同步的进程内 harness 仍缺。

**代码状态**：`npm run build` 通过，`npm test` **69 files / 552 tests** 全绿，`openspec validate --all --strict` 22/22 通过。工作区未提交。

**下一步**：让用户侧按新提示词验收（先看 `figureSlotsNormalized`），绿了再归档本 change。

---

## 上一轮快照（2026-11-03 02:20）

**一句话**：处理用户反馈 #3（引擎 bug 报告：一簇多配图塌陷 + `####` 簇同步必崩）——两条同源缺陷已修，单测锁死，真机验收未跑。

**两条真因**：

1. 配图槽克隆后**从不归一几何**：全仓只有 `fillFigurePlaceholder`（有资产时）会调尺寸，缺资产分支只刷灰板 → 第 2 张起 rect 漂到 y=814/1987、h=27/37、文案压成 1~6px，零告警。修法：新后端方法 `normalizeFigureSlot`（单次 exec，间距真值从克隆源量），克隆 / 占位 / 文案拉宽三处统一走它；归一后仍不合格 → `V2_W_FIGURE_SLOT_GEOMETRY`。
2. parts 同步**条目序号错位**：打标清单不含 `####` 子标题（`stamp-parts.ts:85`），计划侧 `expectedItems` 却把标题算一条（`layout.ts:69`）→ `ref.i` 越界，dryRun 过、真跑崩。修法：`expectedItems` 加 `includeSubtitles`，parts 传 `false`；越界改报 `V2_RECONCILE_ITEM_OUT_OF_RANGE`。

**顺带修掉**：parts 路径从不 `imageSeed.flush`，每簇多留一个模板原生空 `配图` 框。

**代码状态**：`npm run build` 通过，`npm test` **69 files / 552 tests** 全绿，`openspec validate --all --strict` **22/22** 通过。版本引擎 `0.3.2`。工作区未提交（含上一轮 `fix-role-block-and-badge-layering` 的归档移动）。

**下一步**：真机重渲 M1 到 `4216:41110`，逐槽核几何；对新稿 `4356:21777` / `4356:24493` 或旧稿 `4221:51589` 跑同步验条目序号；再归档本 change。

---

## 上一轮快照（2026-11-02 20:30）

**一句话**：处理用户反馈 #2（`引擎问题反馈-角色组件与标号.md`）——修完「parts 路径不认职能组件」「主图实例压住标号」「配置问题无法对账」三个缺陷，真机用真实配图验收通过并推送。配套修了同步的两个连带问题（`@职能` 重复插入、主图换 id 后 stamp 丢失）。

**代码状态**：`npm run build` 通过，`npm test` **68 files / 542 tests** 全绿，`openspec validate --all --strict` **22/22** 通过（活跃 change 5 个）。最近提交 **`8696f7e`**（fix(render)，30 files +1186/-116），本地 = GitHub = GitLab `main`。工作区干净。

**版本**：skill `2.3.3` / 引擎 `0.3.1` / `manifest.engineVersion ^0.3.0`（semver 已覆盖 0.3.1）。

**本会话（11-02 下午）做完的事**：

1. 建 `fix-role-block-and-badge-layering`（proposal / design / specs 3 份 / tasks 30 项），全部实现并验收
2. **P0-1 真因**：`render/parts/index.ts` 调 `fillCluster` 时把 `roleBlocks` 写死 `undefined`，parts 模式从不认 `variantKeys` / `componentSetId`；报错前缀走兜底值 `职能标记=`，把用户引向「配置没生效」
3. 角色运行时结构化：`loadRoleBlocks` 返回 `ok/failure`（`not-in-target-file` / `no-variants` / `no-valid-roles`），错误码分流 `V2_ROLE_BLOCK_SET_NOT_IN_TARGET_FILE` vs `V2_ROLE_BLOCK_UNAVAILABLE`；克隆前按 IR 角色预检，`details.missingRoles`，失败不落节点
4. 返回体新增 `resolvedRoleBlock{mode,source,componentSetId,variantPrefix,labelTextName,roles}` + `configPath`（env 来源 `env:<path>`）+ `enginePid`
5. **P1-3 真因**：`placeInstance` 用 `appendChild` 放主图实例 → 跑到父级末尾压住 `气泡`。改为 `insertChild(原索引)` + `inst.name = ph.name`（槽名保留），脚本抽成 `buildPlaceInstanceScript` 便于测试
6. `applyAsset` 返回是否真的落图；parts 的 `imagesPlaced` 改用它；`summary` 优先用 parts 结果（此前被 legacy `summarize` 覆盖成 0）；新软告警 `V2_W_MAIN_SLOT_MISSING`
7. **同步连带修复**：①parts 的 `@职能` 不再参与文本对齐（`expectedItems({includeRoles:false})`），否则幂等同步每轮重复 `insert` ②主图实例替换后 stamp 写到新节点，否则下轮报 foreign + 缺 main 槽 ③`describeAsset` 支持 `figma_instance`
8. 文档：tool description、`template-contract.md` 新增「职能标记组件调用规则」、`phase3` 锚点取值建议、`phase4` 多实例排查 + 同步不支持改写成 `@职能`、CHANGELOG

**真机验收（`kiroro主串联` / 页「11月版本草稿」`4294:13387`）**：

| 项 | 结果 |
|---|---|
| 验收文档 | `4341:17968`（**仍留在文件里**，用户可打开复查；不需要时让下一轮删掉） |
| 结构 | 3 章 / 9 簇 / 9 标号，标号全部默认可见 |
| 主图 | 3 章全部真实组件实例，实例名保留 `主图占位`，层级在 `气泡` 之前 |
| 配图 | `figuresPlaced 19 / figuresPlaceholder 0`（用用户选中的 3 个 1920×1080 设计组件 + 按锚点裁切） |
| 职能 | `职能标记=程序`、`职能标记=策划` 各 1 个，正文正确 |
| 返回体 | `resolvedRoleBlock.mode="set"`、7 角色、`configPath` 指向 `~/.game-interaction-sop/template.json` |
| 幂等同步 | `@职能` 不再产生 insert；`preserved` 为空 |
| 锚点 | 9 个标号坐标与 `badgeAnchors` 换算值逐项一致（误差 0） |

**已知遗留 / 风险**：

1. **parts 主图槽 stamp 没记 `asset`** → 带 `assetMap` 的同步每轮多一条 `01/#main asset` 计划，画面不变。修法：`stampPartsDoc` 接收 `assetMap` 并在 main slot stamp 记 `asset` + `captureHash`
2. `01/1` 锚点 `(0.5,0.5)` 压在菜单第二行 `Global Settings` 上，建议 `y≈0.42` 或 `x≈0.44`（内容问题，非引擎）
3. **多实例仍在**：`figma_get_status` 实测 3 个引擎（9223/9226/9227，端口漂移），截图曾连续失败；`enginePid` / `configPath` 已可用于排查
4. 锚点跨 md 版本复用错位（上一轮遗留，未处理）
5. 例外判定散在四处的债务（上一轮遗留，未处理）

**讨论过但未启动**：把「组件库更新 → 引擎规范同步」固化成流程。结论：能，但只能半自动（Figma 无发布 API）。三档：①只做库变更体检（约 1 天）②契约进模板包 + 指纹扩到槽位/变体/几何 + 3 份样板门禁（约 3–5 天，推荐）③设计系统同源（更久，不划算）。用户当时选择**先不做**。

**升级提醒**：引擎行为有改动，已安装方需重跑 `npm run install-mcp` 或重启 MCP；skill 文档也改了，需重跑 `npm run install-skill`。

**下一步建议**：
1. 用户复查 `4341:17968`，确认无问题后执行 `/opsx:archive fix-role-block-and-badge-layering`
2. 处理遗留 1（主图 asset stamp），否则每次带图同步都会多算一次
3. 若决定做库同步规范，直接从「方案 2」开 change，方案 1 作为第一步

---

## 历史快照（2026-11-02 18:56）

**一句话**：交互文档 SOP 的三件事全部交付并归档——①设计稿优先 + 每簇默认配图 + 渲染后配图审计（skill `2.3.0`）；②标号锚点 `badgeAnchors` 及其同步修复（`2.3.1`）；③开场上线 `Preflight` 版本自检 + 引擎工具 `get_skill_requirements`（`2.3.2`，引擎升到 `0.3.0`）。代码与 spec 已对齐，两仓同步。

**代码状态**：`npm run build` 通过，`npm test` **66 files / 526 tests** 全绿，`openspec validate --all --strict` **21/21** 通过（活跃 change 4 个）。最近提交 **`cc4991f`**（test(server)：工具集断言 + engine spec drift 同步），本地 = GitHub = GitLab `main`。工作区干净。

**版本**：skill `2.3.2` / 引擎 `0.3.0` / `manifest.engineVersion ^0.3.0`。

**本会话（11-01 → 11-02）做完的事**：

1. 归档 `resolve-sections-under-shell`，delta spec 并入 `render-reconcile-parts`
2. 实现 `skill-design-first-and-figure-audit`（skill `2.3.0`）并归档：Phase 1 开场先要设计稿、Phase 2 每簇默认配图（例外写法 `配图：无（理由：…）`）、Phase 4 截图配图审计 + 缺图提醒。经**三轮外部验收**返工，共修 4+2+1 条 CRITICAL（细节见下方历史段落）
3. 引擎配合改为「声明式无配图」：`isDeclaredNoFigureBullet` / `isFigureSlotBullet`，不建槽、不画灰板、不计 `figuresPlaceholder`、不占 `NN/C/K` 的 K 号
4. 标号锚点 `badgeAnchors`（远程提交 `023751e` 起的特性）+ 本地补修：md 没改时同步也按锚点重摆、已有标号给锚点就移动（不给则保留设计师坐标），归档为 `add-badge-anchors`
5. 拉入远程 `de62111`（`v2.3.2`：`style-default.md` frontmatter、`SKILL.md` Preflight、引擎 `get_skill_requirements`），并修掉它带着的红测试与 spec drift（工具集 2 → 5）

**遗留待办（4 个活跃 change，全部需要人为制造条件或更细的 mock）**：

| change | 剩什么 | 怎么验 |
|---|---|---|
| `make-pack-resolution-observable` | 1/22 | 把 `GISOP_TEMPLATE_PACK` 指到坏文件（要改 MCP 环境变量后重启），看 `V2_TEMPLATE_PACK_MISSING` 是否列全 4 路径 |
| `figure-slot-lifecycle` | 4/27 | ①同步删槽后的几何重算断言 ②HEIGHT 自适应的章节总高断言 ③legacy 路径三态计数 |
| `sanitize-inherited-style` | 2/19 | ①清描边失败降级为 `W_FILL_STROKE_RESIDUAL`（现在会直接抛错）②HEIGHT 高度断言 |
| `render-call-surface` | 1/21 | 渲染途中重启 Desktop Bridge，看是否自动重试并回 `V2_W_RENDER_RETRIED` |

**已知风险 / 债务（本轮明确不做）**：

1. 例外判定散在 render / stamp / reconcile / parts 四处各自调 `isFigureSlotBullet`，应收敛到 `parser.ts` 生成 IR 时分流
2. **锚点文件跨 md 版本复用会错位**：`.interaction-sop/anchors/<需求名>.json` 在 md 增删簇后键整体平移，老键仍能匹配到新簇 → 标号静默指错控件、无任何告警。当前只靠 Phase 4 截图审计兜。备选修法：锚点条目记簇标题比对 / 文件头存簇结构指纹（倾向前者）
3. `parseBadgeAnchors` 对非法键与非法值静默丢弃（`badge-anchor.ts:52-72` 注释承诺的「空对象告警」未实现）；键由 agent 生成、非用户输入，故优先级低
4. 旧文档迁移：用 `3f2aa21` 及更早渲染的文档含「例外灰板」，升级后首次同步干净则 delete、手改过则进 `conflicts`（`kind: figure`），属正常

**用户待验收（我这侧做不了）**：
1. 手改一条正文 + 换一张配图 → 同步 → 文字/图不被覆盖，`preserved` 出现两条 `hand-edit`
2. md 加一条规则、删一条 `配图：` → 同步 → 位置正确、下方内容跟着移动、不留空洞，`changes` 有 `insert`/`delete`
3. 真跑一轮需求，验证「开场先要设计稿」话术与「配图审计清单」在真机上可读

**Figma 现场（11-01 起未变）**：`kiroro主串联` `32LjMNqRsQOFEwbx3k3iQ3` 页「SOP引擎验收 1031」`4231:55123` 只剩 M1 `4233:58395`（`(0,0)`，高 18773）。设计稿源节点：`4216:41127/41128/41130/41131/41132/41133/41134`。M1/M2 md 在 `F:\vibecoding\kiroro\主串联\`。

**升级提醒**：引擎行为有改动（声明式无配图、锚点同步），已安装的需重跑 `npm run install-mcp` 或重启 MCP；skill 需重跑 `npm run install-skill`。

---

## 历史快照（2026-11-01 17:50）

**一句话**：M1 真实文档（4 章 18 簇 18 图）真机全链路跑通并验收；10-30 那份「引擎问题反馈」11 条 + 2 条新发现的隐藏 bug 已修完并推送；遗留只剩 7 条「需要人为制造条件」的真机项。

**代码状态**：`npm run build` 通过，`npm test` **65 files / 517 tests** 全绿，`openspec validate --all --strict` **22/22** 通过。最近提交 **`b926ec4`**（fix(render,sync)：56 files，+3089/-125），已推送 GitLab + GitHub。工作区干净。

**本会话（10-31 → 11-01）做完的事**：

1. 把 `引擎问题反馈.md` 的 11 条拆成 5 个 change（P0 合并、P1 按修复面拆），逐个实现 + 单测 + 真机验收
2. **模板包可观测**：`resolvePackWithTrace`（4 候选带 `missing/invalid/incomplete/hit` 轨迹）；返回 `pack{path,origin,project,components,capabilities}`；`$GISOP_TEMPLATE_PACK` 坏路径 → `V2_TEMPLATE_PACK_MISSING`；`template.*` 与 pack 无关时给 `W_TEMPLATE_ARG_IGNORED`
3. **配图槽三态**：filled / placeholder / hidden；`loose` 从「按条目顺序」改成「子树配图组 − 已认领」求差集——真机 27 个空框就是这么漏的；新增 `W_FIGURE_ASSET_MISSING` + `summary.figuresPlaceholder`
4. **样式归一化**：正文写入带 `align=LEFT` + `autoResize=HEIGHT`（一次 exec）；新增后端 `clearStrokes`，主图填图后清 `strokes`/`dashPattern`
5. **调用面**：`position` / `autoPlace` 落点；`renderWithRetry`（撤销点移进 try）；报错 message 一行 + `details`
6. **发现并修掉两个反馈里没有的 bug**（见坑 29 / 30）：正文被 `growHintTexts` 当占位文案处理；`sectionShell` 下同步认不到章节
7. 同步语义定稿：新增条目走 scratch 新建槽、删除未手改整组删、手改报冲突、只改描述不重建节点（都是既有行为，补规范 + 4 条测试锁定）
8. `vitest.config.ts` 注入 `GISOP_TEMPLATE_PACK=off`：机上的 `default.json` 不再把老测试带进 parts 路径

**真机验收结果（`kiroro主串联` / page「SOP引擎验收 1031」`4231:55123`）**：

| 项 | 结果 |
|---|---|
| M1 全量渲染 `4233:58395` | 4 章 / 18 簇 / 18 图 / `figuresPlaceholder 0` / warnings 空 |
| 正文对齐 | **71/71 LEFT**（修复前 71/71 CENTER） |
| 空配图槽 | 36 个 `配图` 组 → 18 个 `visible=false` |
| 主图描边 | 4/4 `strokes` 与 `dashPattern` 全空 |
| 打标 | 176 stamp / 4 section；`章节外框` 带 `{kind:slot,role:template}` |
| 同步幂等 | dryRun 与正式同步均 `changes:[] preserved:[]`（修复前报 4 条 `designer-deleted`） |
| 落点 | `position{0,8000}` 精确；`autoPlace:below` = 页面底 + **100**（rootGap 默认） |

**遗留待办（7 条，全部需要人为制造条件或更细的 mock）**：

| change | 剩什么 | 怎么验 |
|---|---|---|
| `make-pack-resolution-observable` | 1/22 | 把 `GISOP_TEMPLATE_PACK` 指到坏文件（要改 MCP 环境变量后重启），看 `V2_TEMPLATE_PACK_MISSING` 是否列全 4 路径 |
| `figure-slot-lifecycle` | 4/27 | ①同步删槽后的几何重算断言 ②HEIGHT 自适应的章节总高断言 ③legacy 路径三态计数 |
| `sanitize-inherited-style` | 2/19 | ①清描边失败降级为 `W_FILL_STROKE_RESIDUAL`（现在会直接抛错）②HEIGHT 高度断言 |
| `render-call-surface` | 1/21 | 渲染途中重启 Desktop Bridge，看是否自动重试并回 `V2_W_RENDER_RETRIED` |

`resolve-sections-under-shell` 已归档（`openspec/changes/archive/2026-11-01-resolve-sections-under-shell`），delta spec 已并入主 spec `render-reconcile-parts`。

`skill-design-first-and-figure-audit` 已归档（`openspec/changes/archive/2026-11-01-skill-design-first-and-figure-audit`），delta spec 已并入主 spec `skill-sop-workflow`（新增 Phase 1 设计稿优先 / Phase 2 每簇默认配图 / Phase 4 配图审计，并改写了 Phase 3 配图定位要求）。

- 第一轮外部验收提的 4 条 CRITICAL（Phase 1 双模板对冲、Phase 2 例外清单反向冲销、opt-out 两阶段口径不一致、Phase 2 无 opt-out 出口）+ 6 条 WARNING 已修完
- 第二轮外部验收提的 2 CRITICAL + 2 WARNING：①`配图：无（理由：…）` 引擎侧无落地路径 → 选了改引擎（A 方案），`reconcile/stamp.ts` 新增 `isDeclaredNoFigureBullet` / `isFigureSlotBullet`，legacy 与 parts 两条渲染路径都不再为该条建槽 / 画灰板 / 计 `figuresPlaceholder` / 抛 `V2_W_FIGURE_ASSET_MISSING`，也不占 `NN/C/K` 的 K 号；单测 `tests/v2/render-figure-assets.spec.ts`「声明式无配图」用例锁定 ②opt-out 只豁免审计、没豁免 warnings 逐条说明 → `phase4-figma.md:173` 加短路 ③CHANGELOG 三处与实现相反已按现状重写 ④W3 未收录「配图：本界面主图，<区域>」→ `markdown-v2-spec.md` 与 `phase3-asset.md` 补该形态与映射规则
- **引擎已改，不再是纯文档 change**：升级安装后需重跑 `npm run install-mcp`（或重启 MCP）才会生效；旧版引擎遇到例外写法仍会画一块「配图占位：无（理由…）」灰板并报缺图
- 第三轮外部验收（`3ecf773` 之后）又发现 3 条，均已修（见 `tasks.md` 第 9 节）：①例外条目在 legacy 非嵌套路径被写进正文（`render.ts` 的 `visibleBullets` 只在 `nestedShell` 时过滤）②例外判定把正文含「理由：」的正常描述误判成例外（`配图：失败提示（理由：网络断开）` 会静默丢图）③裸 `- 配图：无` 仍按图槽处理
- **已知债务（本轮不做）**：例外判定目前散在 render / stamp / reconcile / parts 四侧各自调 `isFigureSlotBullet`，第三轮就是"漏一处"。后续应在 `parser.ts` 生成 `SemanticCluster` 时就把声明式无配图分流出去，让三侧天然一致
- **旧文档迁移**：用 `3f2aa21` 及更早渲染的文档里存在例外灰板。升级后首次同步会把该条目按 `itemClean` 判定——干净则 delete（灰板消失），手改过则进 `conflicts`（`kind: figure`）。**首次同步报一条 figure 冲突属正常**，按冲突处理走即可
- 仍待实际跑一轮需求验证话术与审计输出

**标号锚点（2026-11-02，`add-badge-anchors` 已归档）**：`render_v2_markdown_to_figma` 新增可选入参 `badgeAnchors`（`"NN/C"` → 主图归一化 `{x,y}`），标号不再固定按网格斜排。同时修了两个漏：①md 没改时同步直接返回 `changes:[]`、锚点不生效（现在有锚点就放行并重摆）②`placeBadges` 对已存在标号只复用不移动（现在给锚点就移动，没给锚点保持设计师手拖坐标）。skill 侧 `phase3-asset.md` 第 5 步逐簇确认、落盘 `.interaction-sop/anchors/<需求名>.json`，`phase4-figma.md` 渲染前读入并并入入参。主 spec 已同步 `engine-mcp-server` 与 `render-reconcile-parts`。

**用户待验收（我这侧做不了）**：
1. 手改一条正文 + 换一张配图 → 同步 → 文字/图不被覆盖，`preserved` 出现两条 `hand-edit`
2. md 加一条规则、删一条 `配图：` → 同步 → 位置正确、下方内容跟着移动、不留空洞，`changes` 有 `insert`/`delete`

**Figma 现场（本轮新增）**：`kiroro主串联` `32LjMNqRsQOFEwbx3k3iQ3` 页「SOP引擎验收 1031」`4231:55123` 只剩 M1 `4233:58395`（`(0,0)`，高 18773），5 个探针已删。设计稿源节点仍在：`4216:41127/41128/41130/41131/41132/41133/41134`。M1/M2 md 在 `F:\vibecoding\kiroro\主串联\`。

**历史快照（2026-10-30 22:50）**：蛋仔包全链路打通、库按项目分页、同步真机验证完成、4 个 change 归档；当时新踩坑 27（模板包缺失静默回落），已在 10-31 修掉。


**本会话（10-30）做完的事**：
1. 蛋仔包发布 → 回填（新 keys + `rootGap`/`docPadding`/`footerGap`/`bubbleGrid`/`badgeSize`）→ 真机对齐原稿
2. 占位文案：颜色跟灰板亮度 + 框拉到板宽居中（parts 与 legacy 两条路径）3. 图上标号：章节补 `气泡`（`121:9337`）+ `标号/母版`（`121:9338`），`badgeSlot: container`；母版必须 `clipsContent=false`
4. 模板库按项目分页：`官方1.14` `125:9364` / `蛋仔派对` `125:9365`，旧 `部件/零件` 页删除，**所有 key 未变**
5. 蛋仔顶部补 `需求组` 行（值文本命名 `需求组名称`），渲染实测写入 `局内交互`
6. 同步真机验证：插入章节、`foreign` 保留、`hand-edit` 保留、`conflicts` 报出
7. `reconcileWithRetry`（中途掉线整轮重试一次）；探活保留但默认关闭
8. 归档 4 个 change（engine-multi / slim-parts / adaptive-shell / geometry-capture）
9. 端口退让自检（坑 26）
10. 常驻桥宿主（`GISOP_BRIDGE_HOST=1`，默认关）：真机跑通但边角未清（见待办）
11. **补 `~/.game-interaction-sop/templates/default.json`**（= 官方1.14 包）：任何没配置的项目现在默认走库模式，不再要求打开模板文件（坑 27）

| 类别 | 内容 |
|---|---|
| shared 规则 | `src/v2/template/runs.ts`：`splitRuns()` 唯一边界规则，编译 / 渲染 / 同步共用 |
| 编译瘦身 | 保留第一个完整 run，其余连根删；正文条数保持模板原样；孤儿职能帧随 run 删除 |
| 配图归一 | 产物配图一律 GROUP（矩形 + 占位文案）；截图实例先换同尺寸矩形再包壳——**一次 exec 完成**（`groupFigure`） |
| 几何采集 | 主图尺寸 / 占位色从**产物**量；标号点位从**原稿**量（`geometry.badgeSourceId`） |
| 章节外框 | `geometry.sectionShell`（padding + fill），渲染按层套回 |
| **文档外边距** | 新增 `geometry.docPadding`：根帧内边距 + 宽度含左右边距（蛋仔 `0/60/0/60`，总宽 2329） |
| **结尾前留白** | 新增 `geometry.footerGap`：结尾前插一块同宽透明帧（蛋仔 200）。根帧只有一种 `itemSpacing`，表达不了单处大空隙 |
| **章节间距** | `geometry.rootGap`（蛋仔 60）——字段早有，这次才填上 |
| 填图 | 主图 / 配图都真机验过；填图后文案删除、槽 GROUP 高度跟随、未用槽隐藏 |
| **占位文案** | 颜色按灰板亮度推导（`placeholderHintPaint`，深板 `#ABABAB`）；框拉到板宽并水平+垂直居中（`centerHint`），legacy 路径的 `growHintTexts` 同步居中；新增后端 `setTextAlign` |
| **标号** | 蛋仔章节补了 `气泡`（`121:9337`）+ `标号/母版`（`121:9338`，黄三角 63×63 + `#Number`）；母版必须 `clipsContent = false`，否则三角被裁只剩一角 |
| 端口 | worker spawn 前抢回 `9223` + 等端口真能 bind；supervisor 监听 dist 变化换 worker（`touch` 任一 `dist/**/*.js` 就能自愈，不必让用户重启） |
| 官方1.14 | 顶部 `103:297` / 章节 `103:306` / 簇 `103:342`（keys `105c8a75…` / `96173277…` / `76c4ed91…`） |

**Figma 现场（接手先核对）**：

| 位置 | 现状 |
|---|---|
| `交互SOP模板库` `jQf7zj33pzOGsGKO4d73OO` | **已按项目分页**：`_staging` `3:10` / `官方1.14` `125:9364` / `蛋仔派对` `125:9365`；旧的 `部件 0:1`、`零件 3:9` 已删 |
| `官方1.14` 页 | 顶部 `103:297` / 章节 `103:306` / 簇 `103:342` |
| `蛋仔派对` 页 | 顶部 `110:74` / 章节 `110:86` / 簇 `110:114` / 结尾 `110:119` + 零件 3 个（`-完成` / `标签` / `num`） |
| `_staging` `3:10` | 官方1.14 原稿 `94:3500` + 蛋仔原稿 `5:5495`（顶部 `5:5497` / 标题 `5:5501` / 文档说明 `5:5524` / 章节 `5:5778` / 章节标题 `5:5533` / 簇 `5:5784` / 结尾 `5:5987`） |
| `SOP 校验沙盒` `0eoR7aPlpzIva8IdWATWkL` | 素材占位 `63:59`、HUD 验稿 `90:2985`（23 个配图文案已手工居中）、用户原稿副本 `99:4230`、蛋仔终版 `116:4219`（含 `03` 章节 + 手改/冲突验证痕迹）、`122:2760`（需求组槽位验证）。**`模板` 组件 `85:1494` 已丢失**（用户明确不重建） |
| `~/.game-interaction-sop/templates/官方1.14.json` | `103:*` keys + geometry（含 `sectionShell`）；备份 `.bak-20261029` |
| `~/.game-interaction-sop/templates/蛋仔派对.json` | `110:*` keys + geometry（`rootGap 60` / `docPadding` / `footerGap 200` / `bubbleGrid` 三点 / `badgeSize 63`），`badgeSlot: container`；备份 `.bak-20261030` |
| `.interaction-sop/template.json` | 当前为 `官方1.14`（临时切项目时改它，验证完记得切回） |
| `~/.game-interaction-sop/template.json` | **legacy 用**（`resolveTemplateConfig`），本次新建了一份 = 官方1.14；模板包查找**不看**这个文件（见坑 27） |
| `~/.game-interaction-sop/templates/default.json` | **本次新建**：= 官方1.14 包。任何没有本地配置的项目都会走库模式（不再要求打开模板文件） |
| 多窗口现场（22:50 观测） | 三个桥：9223 `39504`、9224 `33496`、9225（当前会话，`portFallbackUsed: true`）；插件连在 9225 的 `kiroro主串联` |

**坑位（累积）**：1（端口，已修）/ 2（`phase=verify` 不可用）/ 3（发布后 import 假死，沙盒要去 `Assets → Libraries` 关开一次）/ 4（大图截图用 `exportAsync`）/ 5（补标号容器要扫产物）/ 6（`overview.*` 标在 `#Content`）/ 7（模板空槽标 `template`）/ 8（配图按填充类型判断）/ 9（簇级改动两种路径）/ 10（标号网格按 1920×1080 定义）/ 11–14（run、归一化、配图判定、badgeSlot 传参）/ 15（verify + 截图要切 active file）/ 16–18（外框、标题间距、文案框）/ 19（编译要库文件 active）/ 20–21（配图实例一次 exec、几何来源）/ 22（端口，已修）/ **23（母版 frame 默认裁剪：三角/数字落在框外会被裁掉，母版必须 `clipsContent = false`）** / **24（改库后不发布 → 跨文件 import 挂 30s；发布 + Libraries 关开才能好）** / **25（手工改 `.interaction-sop/template.json` 时不重拷就会用旧副本，`bubbleGrid` 曾因此不生效）** / **26（worker 重启后旧 bridge child 不死：新旧 child 分占 9223 / 9224，插件只连其中一个 → 渲染报 `Cannot connect`，而代理的 `figma_execute` 正常。判定方法：看报错里的端口号与 `figma_get_status` 的端口是否一致；处理：杀掉所有 `figma-console-mcp` 子进程再 `touch dist` 换 worker。**已加自检（`36431bd`）**：worker 起来后异步读一次子进程端口，退端口就清掉占位者并留一条可搜的 `WARNING: bridge child fell back`——不自动重启子进程，实测抢不回端口还拖慢启动）** / **27（找不到模板包会**静默**退回「克隆模板文件里的 `1:14`」老路，于是报「请打开模板文件插件」，让人误以为组件库没生效。模板包查找顺序：`$GISOP_TEMPLATE_PACK` → `<cwd>/.interaction-sop/template.json` → `~/.game-interaction-sop/templates/<项目名>.json` → `templates/default.json`；**注意 `~/.game-interaction-sop/template.json` 不在这个顺序里**（那是给 legacy 的 `resolveTemplateConfig` 用的）。已补 `templates/default.json`，但代码仍是静默降级，未改成显式报错）** / **27-fix（2026-10-31，`make-pack-resolution-observable`）：模板包查找改为带轨迹（`resolvePackWithTrace`，4 个候选各记 `missing` / `invalid` / `incomplete` / `hit`）；渲染返回 `pack{path,origin,project,components,capabilities}`，缺包时 `packMissing:true` + `packCandidates`；`$GISOP_TEMPLATE_PACK` 显式路径坏掉 → `V2_TEMPLATE_PACK_MISSING`（不再被 `default.json` 顶上）；`template.fileKey/nodeId` 与 pack 查找无关，命中时传了给 `V2_W_TEMPLATE_ARG_IGNORED`。**另外 vitest 里加了 `GISOP_TEMPLATE_PACK=off`**，机上的 `default.json` 不再污染老测试（以前「用完必须删」的注意事项作废））** / **28（多开 CodeMaker 窗口 = 多套引擎 = 多个 figma-console 子进程，各自占 9223/9224/9225；插件只会连其中一个，于是「我这边的工具调用」可能连不到你正在看的文件。判定：`figma_get_status` 里 `otherInstances` 非空、`portFallbackUsed: true`。临时处理：只留一个窗口跑图，或杀掉全部 `figma-console-mcp` 再重启当前窗口的 MCP）** / **29（`growHintTexts` 被喂了正文 id：`finishBlockFigures` 收尾时传的是 `updates.map(nodeId)`，正文被拉宽到 ≥480、设 `HEIGHT`、**设 `CENTER`**、还按组居中挪位。真机「102 条正文全居中」的真凶是它，不是样式继承。已修：只传占位文案 id（`hintUpdateIds`）。2026-10-31）** / **30（多部件 + `sectionShell` 时同步恒为空却报成功：`snapshot.ts` 只扫容器直属子级、`layout.ts` 用「第一个章节的父级」推容器，而每章各有一层「章节外框」。症状是 `ok:true, changes:[]` + 所有章节 `designer-deleted` + 每层壳 `foreign`。已修：章节按 stamp 全树收集、结构层不进 foreign、渲染期给壳补 `template` 标（`resolve-sections-under-shell`）。2026-10-31）**

**接入 / 推广清单（给其他团队装的时候照着走）**：

前提认知：**开插件的是「目标文件」（要写进去的那份文档），不是模板文件**。组件库按 key 导入，不需要打开库文件或模板源文件。

| # | 步骤 | 怎么验 | 漏了会怎样 |
|---|---|---|---|
| 1 | 装 MCP（`figma-interaction-doc-engine`），`FIGMA_BACKEND=figma-console` + `FIGMA_ACCESS_TOKEN` | `figma_get_status` 返回 connected | 所有 figma_* 工具不可用 |
| 2 | 放模板包：`~/.game-interaction-sop/templates/default.json`（含本团队库的组件 key），或项目内 `<项目>/.interaction-sop/template.json` | 渲染 warnings 里没有模板包相关告警 | **静默退回克隆 `1:14`，然后要求打开模板文件（坑 27）** |
| 3 | **库权限**：`交互SOP模板库`（`jQf7zj33pzOGsGKO4d73OO`）分享给使用者，或让他们复制组件到自己库并生成自己的 key | 目标文件里 `importComponentByKeyAsync('<chapter key>')` 成功 | key 解析失败 / import 挂 30s |
| 4 | 改库后必须**发布**，使用方文件 `Assets → Libraries` 关开一次 | 渲染 warnings 为空 | 跨文件 import 假死（坑 3） |
| 5 | 打开**目标文件**的 Desktop Bridge 插件 | `figma_get_status.connectedFiles` 里有目标文件 | 渲染报 `Cannot connect` |
| 6 | 冒烟：渲染一份 3 行示例 md | `sectionCount` / `clusterCount` 正常、无 warning | — |

**推广时的两个隐性坑**：
- 库 key 指向**你的**库文件；对方没权限就什么都拉不到（步骤 3）
- 对方同时开多个 CodeMaker 窗口会出现多个桥抢端口（坑 28），表现为「插件明明开着却说连不上」

**待办清单（按优先级）**：

- [x] **把「找不到模板包」从静默降级改成显式告警/错误**（2026-10-31，`make-pack-resolution-observable`）：返回值带 `pack` 摘要 / `packMissing` + `packCandidates`；`$GISOP_TEMPLATE_PACK` 指向坏文件 → `V2_TEMPLATE_PACK_MISSING`
- [ ] 常驻桥继续做的前提：先解决「child 抖动时 worker 退出」与「supervisor 重试耗尽后整个服务消失」；否则保持 `GISOP_BRIDGE_HOST` 关闭
- [ ] 用真实需求 md（7 章 / 20+ 簇 / 多配图）跑一遍完整渲染 + 同步，验证长文案换行、标号数量、配图排版、同步耗时
- [x] **同步（reconcile）真机验证**（2026-10-30 15:25，`116:4219`）：dryRun 计划正确；插入新章节 `03` 成功（章节标题 / 标号 / 簇全带上）；`底部留白` 作为 foreign 保留；设计师手改 → `preserved: hand-edit` 且画布不被覆盖；md 与画布都改 → `conflicts` 列出、画布保留。**已知坑：桥中途掉线时同步会在 `fill.chapterN` 报 `Unable to establish connection to Figma after 10 seconds`，重试即可（不是同步逻辑问题）**
- [x] **桥抖动两道防线**：同步中途掉线整轮重试一次（`reconcileWithRetry`，只对瞬时连接错误，5s 间隔，3 条测试覆盖）；开写前探活代码保留但**默认关闭**（`GISOP_PREFLIGHT=1` 才开）——真机上出现过「探活报 Cannot connect、直连 figma_execute 正常」的假阴性
- [x] **Worker 重启后旧 bridge 子进程不死**（本会话耗掉约 1 小时）：已加端口自检 `36431bd`——起来后异步读子进程端口，退到 9224 就清掉占位者并打 `WARNING: bridge child fell back`；不自动重启子进程（实测抢不回端口、还拖慢启动）
- [x] **蛋仔顶部 `需求组名称` 槽位**：在库组件里补（克隆 `策划` 行，标签 `需求组` + 值 `需求组名称`），渲染 `122:2760` 实测写入 `局内交互`，warning 消失
- [x] **`官方1.14 / 顶部` 的总览槽位**：复查发现早已齐（`功能背景` / `核心交互` 各带 `#Title` + `#Content`），渲染 warnings 为空，无需重编
- [ ] figma-console 常驻 sidecar：**已写但默认关闭**（`GISOP_BRIDGE_HOST=1` 才启用，代码在 `src/server/bridgeHost.ts` + `bridgeSocketTransport.ts`，5 条测试）。真机跑通了一轮（宿主 → 子进程占 9223 → MCP 握手成功），但暴露四个新边角：① 固定中转端口会被别的软件占（豆包占过 9222）→ 改临时端口 + 端口公告文件；② Windows 上 `spawn('npx')` 必须 `shell: true`；③ child 一抖 worker 就 exit，宿主重启 child 造成抖动；④ supervisor 重试耗尽后整个 MCP 消失。要继续做，先解决 ③（宿主 child 退出时不要一刀切掉客户端 socket）和 ④（supervisor 起不来时保底仍能服务）
- [ ] 职能标签做成模板那种「彩色 chip」（现渲染是彩色文字；用户看过实际效果后认为已足够像模板，**暂不做**）
- [ ] 可选：蛋仔图上标号 63px 偏小（用户确认**不改**）
- [x] **4 个 change 已归档**（2026-10-30）：`engine-multi-part-template-render` / `template-compile-slim-parts` / `template-adaptive-shell` / `template-geometry-capture` → `openspec/changes/archive/2026-10-30-*`；主 spec +21 增 / ~2 改。归档时把 geometry-capture 的 MODIFIED 头从「配置文件形状」改成主 spec 里实际存在的「项目模板包」，否则合并失败

**门槛**：`npm run build` + `npm test`（484）+ `openspec validate --all --strict`（17）

## 上一轮快照（2026-10-29 20:10）

**一句话**：簇的 run 契约已落地并真机验收——编译保留**一个完整 run**（正文不裁、配图 GROUP 保住矩形+占位文案、孤儿职能帧清零），渲染未使用的配图槽**整组隐藏**；`官方1.14` 已重编、发布、回填 key，沙盒渲染 `87:583` 结构正确。

**代码状态**：`npm run build` + `npm test` **454/454** 通过，`openspec validate --all --strict` **18/18** 通过。`slot-run-contract` 已实现、真机验收并归档（`openspec/changes/archive/2026-10-29-slot-run-contract`），提交 `6b87c9b`。

| 类别 | 内容 |
|---|---|
| 共享规则 | 新增 `src/v2/template/runs.ts`：`splitRuns()` 唯一边界规则 + `isCompleteRun` / `firstCompleteRun` / `runMemberIds` / `isFigure`；编译 / 渲染 / 同步三端共用 |
| 编译瘦身 | `slimParts` 按 run 保留第一个完整 run，其余连根删；取消「正文裁到 1 条 / `#Title` 裁到 1 个」 |
| 配图归一 | 产物里的 `配图` 一律 GROUP（矩形 + 占位文案）；新增后端 `groupNodes` / `createText`，裸矩形包壳；删掉 `replaceWithPlaceholder` |
| 探针 | `compile/run-contract.ts` 两段：写画布前预检原稿、瘦身后校验产物；违反 → `V2_COMPILE_RUN_CONTRACT_BROKEN`（瘦身后失败会留下已建组件，报告列 id） |
| 渲染 | `fillGroupSlots` 用共享规则；未使用的配图槽按「矩形 IMAGE 填充 + 占位文案对账」判定后**整组隐藏**（只藏矩形会留下「配图占位：待手动替换」） |
| 官方1.14 | 顶部 `103:297` / 章节 `103:306` / 簇 `103:342`，keys `105c8a75…` / `96173277…` / `76c4ed91…`，已回填 `官方1.14.json` 与 `.interaction-sop/template.json`（无 BOM）；`94:*` / `100:*` / `102:*` 三组旧组件已删除 |
| 章节外框 | 模板的「黑色边距 + 卡片底色」来自两层外框（`Comp_1` pad 64 / `#000000`，`需求目标` pad 64 / `#161616`）。`TemplateGeometry.sectionShell` 采集 padding + 填充，渲染按层建框并刷色（3690 → 3562 → 3382，左右 128/180，上下各 128，段间 256）；无采集值的老包不受影响 |
| 标题间距 | `buildChapterShell` 的 `左列 itemSpacing`：标题在章节内时按「主图顶 − 标题底」算（官方1.14 = 40），不再写死 24 |
| 渲染实测 | 真机文档 `变色龙通用HUD规范` → 沙盒 `90:2985`：1 章 7 簇、16 个配图占位（与 md `配图：` 数一致）、2 个无图簇的空槽全隐藏、标号 1–7 不重叠、主图占位文案在位 |
| 配图文案 | 占位文案框从定宽单行改成「组宽 − 40 + `textAutoResize = HEIGHT`」，长描述不再被省略号截断（`setTextAutoResize` 是新增后端方法） |

**Figma 现场（接手先核对）**：

| 位置 | 现状 |
|---|---|
| `交互SOP模板库` / `部件` `0:1` | `官方1.14` 新三件（`100:*`，published）+ 三个 `94:*（旧）` 回滚点 |
| `交互SOP模板库` / `_staging` `3:10` | `官方1.14 模板（_staging）` `94:3500`（标题 `94:3501` / 总览 `94:3518` / 界面说明1 `94:3530` / 说明块01 `94:3532` / 章节标题 `94:3608` / 气泡 `94:3599`）+ 蛋仔原稿 `5:5495` + 蛋仔模板 `6:8172` |
| `SOP 校验沙盒` `0eoR7aPlpzIva8IdWATWkL` / `Page 1` | 素材占位 `63:59`、真机验收稿 `90:2985`（其余实验产物已删） |
| `~/.game-interaction-sop/templates/官方1.14.json` | 新 keys + geometry；上一版备份 `官方1.14.json.bak-20261029` |
| `.interaction-sop/template.json` | 当前为 `官方1.14`（本轮已从蛋仔切过来） |

**本轮新增坑（都踩过）**：

11. `cloneSlimPart` 在插件里还有一份「按名字裁簇」的旧逻辑（`bullets.slice(1)` / `#Title slice(1)`），会在引擎瘦身之前先把 run 裁坏 → 已删掉该分支，簇只由 `slimParts` 处理
12. 归一化的「内容行」判定只排除**第一个**配图槽，第二段 run 的 `配图占位文案` 会被改名成 `正文/规则` → 现在排除全部 `配图` 子树
13. 配图槽的「用没用上」不能读 GROUP 的 fills（组恒为空），也不能只按序号 → 用「组内 `配图占位` 矩形 `hasImageFill`」+「占位文案是否等于 `配图占位：<md 描述>`」对账
14. 编译给「散落标号」模板补容器时，能力值必须传 `badgeSlot: manual` + `badgeContainerSourceId`，传 `container` 会跳过补容器并留下 `V2_RENDER_BADGE_MASTER_MISSING`
15. `phase=verify` 仍不可用（坑 2），本轮用「沙盒 import 三个 key + 手写 pack」；`figma_capture_screenshot` 要先把 active file 切到沙盒（`figma_navigate`），否则报 `Node not found`
16. 「章节没有黑色边距」的根因不是渲染丢了 padding，而是**编译只产出了最里层 `界面说明1`**，外面两层带 padding 的框（`Comp_1` / `需求目标`）没被带出来；修法是把这条 padding 链采进 `geometry.sectionPadding`，渲染套回
17. `buildChapterShell` 里标题与主图的间距旧公式只在「标题在章节外」时成立（`src.y - titleBottom`），标题本来就在章节内时会算成负数并回落到写死的 24 → 现在补了「主图顶 − 标题底」分支（官方1.14 = 40）
18. 配图占位文案的框是模板给的定宽单行，长描述会被省略号截掉；写入后要 `resizeNode` 到组宽并 `textAutoResize = HEIGHT`，否则「配图占位：准备阶段与猎人…」这种一眼看不到关键信息
19. 编译必须在**库文件为 active file** 时跑：active 在沙盒时 `staged` 节点会全部报「在库文件里找不到」（节点其实还在）；渲染则相反，要切回目标文件
20. 原稿的配图位常常是**截图实例**（蛋仔 872×490），实例不能当填图目标；而且「换矩形 → 包 GROUP → 摆文案」分三次 RPC 做会读到没结算的坐标，文案必错位（真机连踩两次）。已收成一个后端方法 `groupFigure`，一次 exec 内完成
21. 几何采集别用原稿当唯一测量源：原稿没有统一槽位名时 `主图占位` 找不到 → 主图尺寸/占位色从**产物**量，标号点位从**原稿**量（`badgeSourceId`）
22. ~~端口不稳：同时存在两个 worker 时 probe 说「已连 9224」但 execute 去 9223~~ **已修**：见坑 1；启动日志会打印 `reclaimed preferred port 9223 from pid=<pid>`，出现 `left as-is` 时说明占用者不是 figma-console 进程

**待办清单（按优先级）**：

- [ ] 小变更 `bridge-port-stability`：`npm run build` 换 worker 时旧进程仍占着 9223，新服务退到 9224 → 插件（只认 9223）永久失联，只能人工重开插件。目标：新 worker 启动前清掉占端口的旧进程 / 固定 9223，让插件自动重连
- [ ] figma-console 改成常驻 sidecar（脱离 worker 存活），免掉「build 后重开插件」这一步
- [ ] 蛋仔派对：新产物 `110:74 / 110:86 / 110:114 / 110:119` 已编译（结构自检通过：配图 GROUP 872×490 + 占位文案在位），**待人工发布 4 个 → 回填 `蛋仔派对.json`（badgeSlot 写 `manual`，没有气泡容器）→ 渲染验证深色底与 GROUP 配图**
- [ ] 蛋仔缺标号容器：`17:1535`（原 1:14 气泡来源）已失效且查询会超时；要修需重新提供气泡或改用 94:3599
- [ ] 职能标签做成模板那种「彩色 chip」（现渲染是彩色文字）
- [ ] `template-geometry-capture` 变更收尾：tasks 4.2–4.4，然后 archive

**门槛**：`npm run build` + `npm test`（454）+ `openspec validate --all --strict`（18）

## 上一轮快照（2026-10-29 18:00）

**一句话**：parts 文档的**同步**（上一轮）与**几何/色彩采集**（这一轮）都已跑通真机；`官方1.14` 已按新流程重编并发布，渲染出来的底色 / 占位色 / 标号点位与模板一致。**卡住的下一块**是「簇的 run 结构」：编译瘦身把模板里的 run 拆坏了，渲染因此拿不到「小标题组 + 职能标签 + 正文 + 配图」的包裹关系。

**代码状态**：`npm run build` + `npm test` **437/437** 通过，`openspec validate --all --strict` 17/17 通过。最新提交 `db7d912`。

**这一轮做完的（都已提交）**：

| 类别 | 内容 |
|---|---|
| 同步（上一轮归档） | `parts-doc-reconcile-sync` 已 archive：parts 文档可 `target.rootId` 同步，手改保留 / 只改变化 / `V2_PACK_MISMATCH` 全验过 |
| 几何采集 | 新变更 `template-geometry-capture`（未归档）：`pack.geometry` 存 `docBackground` / `chapterWidth` / `mainImage` / `placeholder` / `bubbleGrid`（比例）/ `badgeSize` / `rootGap`；编译期实测 + sidecar 传给 verify 写 pack；渲染优先用、缺项回落旧常量 |
| 官方1.14 重编 | 顶部 `94:3785` / 章节 `94:3793` / 簇 `94:3829`，keys 已回填 `官方1.14.json`（旧包 `.bak`，旧组件改名带「（旧）」保留） |
| 编译修正 | 标号容器改为**扫产物**判断（造壳会丢 `气泡`）；`overview.*` 标打在 `#Content` 正文而非外层框 |
| 渲染修正 | 根帧 `counterAlign: CENTER`（部件宽度不同时不再贴左）；未使用的 `配图` 槽按**填充类型**判断后隐藏（有 IMAGE 的绝不能被藏）；总览 / 正文去掉 md 项目符号，避免「· - 文本」 |
| 渲染实测 | `85:1372`：底色 `#1E1E1E`、主图与配图占位 `#454545`、标号落模板点位 (761,164)/(636,267)、章节宽 3382 |

**下一个对话的第一件事：开变更 `slot-run-contract`（用户已同意方向，代码未动）**

已确认的缺陷（对比 `Agent草稿 / 1:44 说明块01` 与编译产物 `94:3829`）：

1. **`配图` GROUP 被拍平成 RECTANGLE**，`配图占位文案` 丢失 → 渲染没有占位文案、结构不符
2. **run 内正文从 ×2 变 ×1**：瘦身按「一条」收，没按 run 长度
3. **第二个职能帧 `Frame 427319721` 既没改名也没删**（孤儿节点）
4. **第二组的 `#Title` / 配图全删**，但不是按「保留一个完整 run、删整个多余 run」的方式

根因：`run` 概念只存在于渲染端的私有函数 `splitSlotRuns`（`render.ts`），编译端的 `slimParts` 完全不知道它。

提议的方案（写进新变更）：

- 新增共享模块 `src/v2/template/runs.ts`：`splitRuns(children)` 作为**唯一**边界规则
  - run 起始 `#Title`，内容 `职能标记` + `正文/规则`(≥1) + 可选 `配图`(GROUP)
  - `clusterGroups=none` → 整簇一个 run；`inline-subtitle` → `#Title` 当正文首行前缀，不产生 run
- 编译瘦身：**保留第一个完整 run**，其余整个 run 连根删；run 内条目数量保持模板原样；`配图` 必须保 GROUP + 占位文案
- 渲染填充：档数 = md `####` 组数，不够克隆 run、多了删 run
- 探针拦截：识别不出 run / run 内无正文 / 配图被拍平 → `phase=compile` 直接报 gap，不产出半截组件
- 测试固化：把 `1:14` 的两 run 形状做成 fixture（同 `danzi-shapes.ts` 套路），断言编译后=一个完整 run、渲染两档=两个 run、配图 GROUP 不被拍平

**做这个变更要付出的手工步骤**：改完 `slimParts` / 新增 `runs.ts` 后，需要**重编 `官方1.14` → 用户在 Assets 面板发布一次 → 回填新 key**（`phase=verify` 工具当前不可用，见坑 12，改用「key 在沙盒 import 冒烟 + 手写 pack」）。

**Figma 现场（接手先核对）**：

| 位置 | 现状 |
|---|---|
| `交互SOP模板库` / `部件` `0:1` | `官方1.14 / 顶部|章节|簇`（新，published）+ 三个带「（旧）」的旧组件 |
| `交互SOP模板库` / `_staging` `3:10` | `官方1.14 模板（_staging）` `94:3500`（含 标题组件 `94:3501` / 设计总览组件 `94:3518` / 说明说明1 `94:3530` / 说明块01 `94:3532` / 章节标题 `94:3608` / 气泡 `94:3599`）+ 蛋仔原稿 `5:5495` + 蛋仔模板 `6:8172` |
| `SOP 校验沙盒` `0eoR7aPlpzIva8IdWATWkL` / `Page 1` | `素材占位（验收用）` `63:59`（assetMap 用的假图源）+ 最近一次渲染 `85:1372` |
| `~/.game-interaction-sop/templates/官方1.14.json` | 新 keys + `geometry` 段（这是本轮的可见成果） |
| `.interaction-sop/template.json` | 当前指向**蛋仔**；做官方1.14 相关实验前先换过去（改完记得换回，且**不能带 BOM**） |

**已知坑（这一轮新增的，都踩过）**：

1. ~~`npm run build` 后 worker 换新，Bridge 常掉线~~ **已修（`bridge-port-stability`）**：worker 在 spawn 前抢回 9223（`reclaimPreferredPort`）并等到端口真能 bind（`waitUntilPortBindable`，避 TIME_WAIT），新服务固定落在 9223，不会再退回 9224。**边界**：worker 换人时子进程退出、插件 socket 必断，插件不自动重连，所以 build 之后仍需重开一次插件——但现在重开一定连对，也不会再出现「probe 说 9224、execute 打 9223」。彻底免掉重开需把 figma-console 做成常驻 sidecar（另开变更）
2. **`phase=verify` 走 worker 连接，插件重连后必报 `Cannot connect`**；等价做法：拿 key 在沙盒 `importComponentByKeyAsync` 冒烟 + 手写 pack
3. 发布后库同步期 `importComponentByKeyAsync` 会假死；沙盒看不到新库版本时，用户需在 `Assets → Libraries` 刷新或关标签页重开
4. `figma_capture_screenshot` / `exportNodeImage` 对整篇大图经常 10s 超时；可靠做法是 `figma_execute` 里 `exportAsync`（缩到 ≤1200px），输出会被持久化成文件，再用 PowerShell 解码成 PNG
5. 编译「补标号容器」不能按能力表判断，要扫产物（造壳会丢 `气泡`）
6. `overview.*` 必须标在 `#Content` 正文 TEXT 上，标到外层框 → 每次同步都报 `preserved: hand-edit`
7. 模板常驻空槽（配图 / 隐藏标号 / 主图占位文案）一律标 `template`，打成 `item` 会让同步每轮生成空 `delete` 或报 foreign
8. 判断「哪个配图槽放了图」必须按**填充类型**，按序号猜会藏掉真图
9. 簇级改动路径两种形态：插入 `01/3`、删除 `01/-簇四`
10. 标号网格是 1920×1080 定义的（第 3 个在 1700,280），缩放后 (1063,186) 是**正常值**

**待办清单（按优先级）**：

- [ ] 开 `slot-run-contract` 变更并实现（run 语法 + 共享 `splitRuns` + 瘦身按 run 裁剪 + 探针拦截 + fixture 测试）
- [ ] 重编 `官方1.14` → 发布 → 回填 key → 渲染对比（配图 GROUP、两档 run、职能 chip）
- [ ] 职能标签做成模板那种「彩色 chip」：现渲染是彩色文字，模板是带底色的标签（可加圆角背景填充，或回填 `roleBlock` 组件变体）
- [ ] 蛋仔包补 `geometry`（它的原稿标号被收口，量不到点位，其余项可采）
- [ ] `官方1.14` 的三个「（旧）」组件确认无回滚需求后删除
- [ ] `template-geometry-capture` 变更收尾：tasks 4.2–4.4，然后 archive

**门槛**：`npm run build` + `npm test`（437）+ `openspec validate --all --strict`（17）

## 旧快照（2026-10-29 04:00）

**一句话**：parts 文档现在**能同步了**（`target.rootId` 不再一律被 `V2_NOT_STAMPED` 拒），链路 A 全段真机跑通：渲染 → 手改一句 → 同步 → `preserved` 保住手改、`changes` 只含 md 改动的条目；模板重编后同步被 `V2_PACK_MISMATCH` 拒。

**代码状态**：进行中的变更是 `openspec/changes/parts-doc-reconcile-sync`（proposal/design/specs/tasks 齐，代码已落，`npm run build` + `npm test` **431/431** 通过）。

**这一轮做完的**：

| 类别 | 内容 |
|---|---|
| 打标 | parts 渲染结束调 `stampPartsDoc`：`doc` 带 `structure:'parts'` + `parts.packHash`；章节 / 簇 / 条目 / 槽位（顶部 header.*、说明栏 column、`#Title_Main`、主图、气泡、标号、母版 template）全打 |
| 结构档案 | `reconcile/structure.ts`：`LEGACY_PROFILE` / `PARTS_PROFILE`；`figureSlot` 区分「GROUP 包矩形」与「单层矩形」 |
| 入口 | 按 `doc.structure` 分派；`packHash` 不一致 → `V2_PACK_MISMATCH`；无标记仍 `V2_NOT_STAMPED`（不实现 adopt） |
| 快照 | parts 的条目在内容层里（`Group 1253` / `Frame 808`），按子孙遍历取条目；插入 / 移动落到 `itemsParent`；「有引擎子孙的外壳」不再算 foreign |
| scratch | 新增界面 / 簇时用 parts 管线造临时文档并打标，不引 `1:14` |
| 几何 | `parts/geometry.ts` 抽出章节高度、左列贴合、标号摆放；同步后对受影响章节重算，簇集合变了再 `relayoutBadges`（只重摆本次新增的标号，设计师挪过的不动） |
| 稳定性 | 冷启动首次进子树（scan / 删隐藏池）会超 Bridge 10s → 读操作套 `retryTransient`；隐藏池逐个删、删不掉只记 `V2_W_HIDDEN_POOL_LEFT` 软告警，不再整篇失败 |

**本轮真机验收（2026-10-29 午间，沙盒 `0eoR7…`，文档 `69:269`）**：
| 场景 | 期望 | 实测 |
|---|---|---|
| 打标对位 | 2 章 3 簇 4 条目 | `structure:parts` / `packHash` / section×2 / cluster×3 / item×4 ✓ |
| 无变化同步 | `changes: []` | ✓ |
| 手改保留 | `preserved: hand-edit` | ✓ |
| 改文字 | `update` 只动那一条 | ✓ |
| 换图 | `asset`，哈希 9d800e→a9785d，描边清空 | ✓ |
| 删条不重建 | `designer-deleted` 且跨多次同步粘住 | ✓ |
| 新增簇 | `01/3 insert`，标号 +1 在网格位 | ✓ |
| 删除簇 | 标号随之减少 | ✓ |
| 拖动标号 | 后续同步坐标不变 | ✓ |
| 包指纹变化 | `V2_PACK_MISMATCH` | ✓ |

**已知小尾巴（不影响验收）**：
- 标号 1/2 落在同一列（默认 8 气泡网格按 1920×1080 定义，缩到 1200×719 后会挤）—— 属网格数据，未动
- `需求组名称` 槽位蛋仔模板本身没有，渲染会出软告警（`V2_W_HEADER_SLOT_MISSING`）
- 顶部 `-未开始` 在零件实例内部，不可编辑，保持模板原样
- 同步时画布上的 `标号/母版` 会被报成 foreign（新渲染的文档已把母版标成 `template`，旧文档重渲一次即消失）

**链路 B 半程（2026-10-29 14:00，用 `官方1.14` 现成包，未重编）**：

| 项 | 实测 |
|---|---|
| 包切换 | `.interaction-sop/template.json` 换成 `官方1.14.json`（注意去 BOM）后 `loadPartsPack()` 正确识别 |
| 渲染 | `74:468`，2 簇 2 标号；`overview=two-frames` / `roleAnnotation=component-variant` 走通 |
| 幂等同步 | `changes: []`、`preserved: []`（修完三条后零噪音） |
| 手改保留 + 只改变化 | `preserved: hand-edit` + `changes: [01/2/#1 update]` ✓ |

**链路 B 逮到的问题（已修 2 条）**：

1. **模板常驻的空 `配图` 组被当成条目**：官方1.14 的簇带一个空配图槽，md 没写 `配图：` 时它还在；打标记成 `figure` 条目 → 每次同步都生成一条空的 `delete`。修法：未与 `配图：` 配对的配图槽标 `template`
2. **隐藏的残留标号 / 主图占位文案被报 foreign**：都是模板残留，改为标 `template`
3. **（未修，属编译输入缺失）** `官方1.14 / 顶部` 只有 9 个文本槽，**没有「功能背景 / 核心交互」**：编译时 `staged.topIntro`（源模板里的 `设计总览组件` `1:32`）没给，所以 `overview=two-frames` 与部件不符，渲染报 `V2_W_OVERVIEW_SLOTS_MISSING` 且总览内容丢失。要修就得把 `1:32` 一起粘到 `_staging` 后重编

**链路 B 全量重编（2026-10-29 15:20，官方1.14）**：

| 项 | 结果 |
|---|---|
| 重编输入 | `_staging` 上新粘的 `官方1.14 模板（_staging）` `94:3500`；staged = 标题组件 `94:3501` / 设计总览组件 `94:3518` / 界面说明1 `94:3530` / 说明块01 `94:3532` / 章节标题 `94:3608` / 气泡 `94:3599` |
| 产物 | 顶部 `94:3785`（`c0909c9f…`）、章节 `94:3793`（`87069e71…`）、簇 `94:3829`（`6f30cd0d…`）；旧的三件已改名带「（旧）」，未删 |
| 修复 1 | 章节走「造壳」后 `气泡` 不会跟着搬，而 `alreadyHasContainer` 按能力表判断说"有" → 现在改成**按产物实测**有没有容器 |
| 修复 2 | 总览槽 `overview.*` 的标必须打在 `#Content` **正文 TEXT** 上（旧路径如此）；打在框上会让每次同步都判成手改 |
| 渲染 | `80:436`：**总览回来了**（`1.功能背景 / 2.核心交互` + 正文）、职能标记 2 个组件变体、标号 (960,60)/(960,180) |
| 同步 | 幂等 `changes: []`；手改保留 `preserved: hand-edit`；md 只改总览一句 → `changes: [overview.coreInteraction update]` |
| 回填 | `phase=verify` 工具侧报 worker 连接失效，改用等价流程：新 key 在沙盒 import 冒烟通过 → 手写 `官方1.14.json`（旧包存 `.bak`） |

**下一步（下一个人从这里接）**：

- **进行中变更 `template-geometry-capture`**：schema/采集/渲染已落地并提交，真机验收只差蛋仔侧（它的原稿标号被收口成母版，量不到点位，仍走默认网格）
- **几何数据现状（2026-10-29 17:20）**：`官方1.14` 包已带 `geometry`——底色 `#1E1E1E`、主图/配图占位 `#454545`、标号落模板点位 (761,164)/(636,267)、章节宽 3382；蛋仔包仍无 `geometry`，行为同前
- **还需一块**：职能标记（`@GUI` 等）渲染成彩色组件变体要靠 `roleBlock` 回填；现在 `官方1.14` 渲染出来是纯文字
- `官方1.14` 的 `（旧）` 三件确认无回滚需求后可删
- 每次改动前的门槛：`npm run build` + `npm test`（437）+ `openspec validate --all --strict`

**这一轮新增的坑（别重踩）**：

1. **`template.json` 带 BOM 会静默失效**：`loadTemplatePack` 读不出 → 回落 legacy 路径，报的是「缺少设计总览 / 缺 @角色 行」这类无关错误。改配置文件用不会加 BOM 的方式写
2. 冷启动簇 key 后，第一次 `scanSubtree` / `deleteNodes` 会卡满 Bridge 10s；只重试读操作不够，**可重放的删除也要重试**（克隆重放会多一份，不能重试）
3. `npm run build` 后 worker 换新，Bridge 常需 10~20s 重连（端口还会在 9223/9224 之间跳）；渲染前先 `figma_get_status` probe 一次
4. 同步的 `place` 找不到锚点，多半是**条目容器层选错**：parts 的条目不在簇根节点下，插入要落到 `itemsParent`
5. 部件计数 / 指纹类判断错了症状最隐蔽：不报错，而是把引擎自己的节点当成「设计师删掉了」记进 `preserved.designer-deleted`
6. 配图 `item` 标必须 `captureHash`：不记 `imageHash` 的话，换图每次都被判成 conflict
7. 簇级改动路径有两种形态：插入 `01/3`、删除 `01/-簇四`；判定「簇集合变了」要用 `^\d{2}\/[^/]+$`，只认 `NN/N` 会漏掉删除
8. 标号网格是 1920×1080 定义的（第 3 个在 1700,280），换算到 1200 宽主图后是 (1063,186)——**不是** bug，别当缺陷改
9. **模板常驻的空槽不是条目**：配图槽、隐藏标号、主图占位文案都是「引擎自己的东西」，打标一律 `template`；打成 `item` 会让同步每轮都想去删一条空条目、或把它们报成 foreign
10. **`overview.*` 标的是正文 TEXT（`#Content`），不是外层框**：标到框上 → 每次同步都报 `preserved: hand-edit`
11. 编译的「补标号容器」不能按能力表判断「已有」，要**扫产物**：章节走造壳路径时 `气泡` 不会搬过来，能力表却说 container
12. `figma_compile_template` 的 `phase=verify` 走 worker 连接，插件重连后会报 `Cannot connect`（父进程 probe 正常）；等价做法是拿 key 在目标文件 `importComponentByKeyAsync` 冒烟 + 手写 pack

**旧快照（2026-10-28 23:30，仅作历史参考）**：

**一句话**：蛋仔这套模板已经**跑通完整链路**（编译 → 发布 → 刷库 → verify 回填 → 渲染 → 截图逐项目视），并修完了那一轮返工暴露的全部结构问题；三项「防返工」改进也做完了。下一步是端到端验收（见文末「验收剧本」）。

**代码状态**：最新提交 `0a04fb9`，`npm run build` + `npm test` **419/419** 通过。

**这一轮修掉的（都已在真机验证）**：

| 类别 | 内容 |
|---|---|
| 编译·空壳化 | 簇里的原稿媒体（3 张截图 + 小图）收成 **1 个 `配图` 槽**；`figure=none` 时全删 |
| 编译·顶部 | `策划 / UX` 行保留、值写 `/待补充`；槽位文本一律占位（`文档标题`/`YYYY.MM.DD`/`簇标题`/`正文占位`/`#单号`）；`文档说明` 里的区块标题（含「界面说明」）**拆平实例并保住文字** |
| 编译·章节 | 说明栏空壳高度归零；标题与图间距按原稿反推（蛋仔 60）；`气泡` 缩到主图尺寸（1200×719） |
| 编译·簇 | 标题让位给编号；角标与标题**中线对齐**、水平仍靠左 |
| 编译·顶部居中 | 「职能注意 + 标签行」整行居中，且**避让同行右侧块**（审核者） |
| 归一化 | `文档说明` 里的长单号认作 `易协作单号链接`；文档标题取标题行里那块大字 |
| 能力重算 | 说明栏被清空后，`figure / hiddenPool / numberBadge` 不再被误判成 none |
| 渲染 | 深色模板根帧用 `docBackground`（蛋仔 `#232429`）；主图占位按底色取灰阶；`@GUI` 等职能按 `ROLE_COLORS` 上色；嵌套空壳的配图就地填、多余槽删掉 |
| 契约 | 校验按模板能力放宽（`overview=none` 免总览、`roleAnnotation=inline-suffix` 免 `@角色` 行） |
| 工程 | **父进程常驻 + 可替换 worker**：`npm run build` 自动换 worker，不用再人工重启；渲染默认返回整篇截图；发布后 import 假死自动重试 |

**三项改进（防返工）**：`tests/v2/fixtures/danzi-shapes.ts` 固化蛋仔形状 + `tests/v2/danzi-shapes.spec.ts` 7 条断言；渲染默认出图；`src/server/workerLoop.ts` + `worker.ts` 免重启。

**已知小尾巴（不影响验收）**：
- 标号 1/2 落在同一列（默认 8 气泡网格按 1920×1080 定义，缩到 1200×719 后会挤）—— 属网格数据，未动
- `需求组名称` 槽位蛋仔模板本身没有，渲染会出软告警（`V2_W_HEADER_SLOT_MISSING`）
- 顶部 `-未开始` 在零件实例内部，不可编辑，保持模板原样

**下一步（下一个人从这里接）——两条端到端验收，都还没跑**：

- **链路 A · 日常使用（建议先跑）**：按 `~/.game-interaction-sop/templates/蛋仔派对.md-contract.md` 写一份真实 md（2~3 章、职能句尾、1~2 处 `配图：`）→ `render_v2_markdown_to_figma`（**默认回整篇截图**）→ 逐项看图（底色/占位/标号/标题/重叠/职能色）→ `assetMap` 指真实节点验配图 → 让用户在 Figma 手改一句 → 传 `target.rootId` 同步一次，验「手改保留 / 只改变化 / conflicts」
- **链路 B · 新项目生成模板**：建议拿 **官方1.14** 当被测（已有包，重编不破坏旧能力，风险最低）：重粘 `_staging` → 干跑看缺口 → 实跑 → 人工发布 → 刷库 → `verify` 回填 → 写配置 → 渲染 → 与重编前对比（总览 / 组件化职能 / 分组不能被改坏）
- 每次改动前的门槛：`npm run build` + `npm test`（419）+ `openspec validate --all --strict`（15）

**这一轮新增的坑（别重踩）**：

1. 渲染前复制的 `default.json` **必须用完立刻删**，否则 72 个老测试走 parts 路径全红（本轮又踩了一次）
2. 库发布后 Figma 后台同步期间，`importComponentByKeyAsync` 会**假死 30–40s** → 已加自动重试；人工排查时先等 10s 再下结论
3. 沙盒的库缓存有时 Assets→Libraries 刷不掉，需要**关掉文件标签页重开**
4. 常驻父进程**自己不能热替换**，只有 worker 能（改 `index.ts` 仍需重启一次；改其它文件不用）
5. `detachInstance` 会把实例的文字覆盖重置成组件默认值 → 拆平前后要**存/写文字**
6. 说明栏被空壳化清空后，能力重算**不能**把 `figure/hiddenPool/numberBadge` 判成 none
7. 「标签行居中」要按**可用宽度**算（避让同一行右侧块），且必须在**占位文本替换之后**算
8. 渲染的 inline 配图路径假设「正文是簇直接子级」；嵌套空壳（蛋仔 `Frame 808`）要走就地填充

**旧快照（2026-10-28 14:50，仅作历史参考）**：

**一句话**：蛋仔这套模板的自适应外壳 + 章节/顶部结构改造已经写完并 369 测试全绿，**但最后一轮重编验收没跑完**——库里蛋仔的 4 个部件被我清掉了，等下一个人重编 → 发布 → 回填 → 渲染。

**代码状态**：最新提交 `e4a2fb3`，`npm run build` + `npm test` 369/369 通过，`openspec validate --all --strict` 15/15 通过。

**Figma 现状（重要，接手先核对）**：

| 位置 | 现状 |
|---|---|
| `交互SOP模板库` / 部件 `0:1` | 只剩 `官方1.14 / 顶部|章节|簇` 三个；**蛋仔 4 个已删除** |
| `零件` 页 `3:9` | 空 |
| `_staging` 页 `3:10` | `局内相关交互` `5:5495`（蛋仔原稿副本）+ `模板 6:8172` |
| `~/.game-interaction-sop/templates/蛋仔派对.json` | **key 已失效**（指向已删除的 `50:*` 组件），等回填 |
| `~/.game-interaction-sop/templates/官方1.14.json` | 未动，仍然可用 |
| `SOP 校验沙盒` `0eoR7aPlpzIva8IdWATWkL` | 页面已清空，库里还有 `28:244` 的旧渲染垃圾可随时删 |

**下一步（按顺序，缺一步就白跑）**：

1. **重编蛋仔**（`figma_compile_template`，`write: true`）：

   ```json
   {
     "phase": "compile",
     "project": "蛋仔派对",
     "source": { "fileKey": "UYCJok3MXTWITMfeJSqEF6", "nodeId": "796:12489" },
     "library": { "fileKey": "jQf7zj33pzOGsGKO4d73OO", "pageId": "0:1" },
     "partsPageId": "3:9",
     "staged": {
       "top": "5:5501",
       "topBanner": "5:5497",
       "topIntro": "5:5524",
       "chapter": "5:5778",
       "chapterTitle": "5:5533",
       "cluster": "5:5784",
       "footer": "5:5987"
     },
     "badgeContainerSourceId": "17:1535",
     "capabilities": {
       "overview": "none", "clusterGroups": "none", "badgeSlot": "manual",
       "numberBadge": "instance", "roleAnnotation": "inline-suffix",
       "figure": "none", "hiddenPool": "ignore", "column": "right"
     },
     "write": true
   }
   ```

   注意 `badgeSlot` 必须传 `manual`（让编译补 `气泡`），补完产物会重算成 `container`；传 `container` 会跳过补容器，章节里就没有标号舞台。
   `_staging` 里原来的 `5:5538` / `5:5564` 已丢失，现用同目录的 `Group 2364`（`5:5778`）与 `Frame 1243`（`5:5784`）顶上。

2. **人工发布**：库文件 Assets 面板点一次发布（新增 4 部件 + 3 零件）。
3. **verify 回填**（`phase: "verify"`，`verifyFileKey: "0eoR7aPlpzIva8IdWATWkL"`，`components` 传刚发布的 4 个 key）。
4. **写配置**：`~/.game-interaction-sop/templates/蛋仔派对.json` 换成新 key，**`badgeSlot` 写 `container`**（产物里气泡与母版都在；探针因为气泡嵌在舞台里认不出，会保留 `manual`）。
5. **沙盒刷新**：`SOP 校验沙盒` → Bridge 插件关开 → `Assets → Libraries` 关开一次（否则跨文件 import 挂死）。
6. **渲染验收**：临时把 `蛋仔派对.json` 复制成 `default.json` → `render_v2_markdown_to_figma` → **用 `figma_capture_screenshot` 出图逐项目视** → 立刻删 `default.json`（不删会有 72 个老测试走 parts 路径而红）。
7. **清库**：`蛋仔派对 / 零件 / …` 旧变体集若残留，一并删掉再发布一次。

**这一轮改了什么（供验收对照）**：

- 章节：`左列(标题 + 舞台) | 说明栏` 的横向自动布局，根与左列都 HUG；舞台装 `主图占位`（灰底虚线）与 `气泡`（`标号/母版` 在里面）
- 顶部：`Banner + 标题行 + 文档说明` 纵向合成一个部件（新增 `staged.topBanner` / `staged.topIntro`）
- 顶部归一化：自由排版也能认（日期正则→更新时间、面积最大→文档标题、`UX/UI` 后 `/名字`→设计师）；只清「值」（`/人名`、`-状态`）和 `文档说明` 里的旧链接，标签保留
- 簇：原稿大截图（≥400×300 的实例）就地换成同尺寸 `配图占位`；编号在实例内部时，渲染按「父级是 Number 载体」结构写入，不依赖改名
- 标号：网格按主图实际矩形等比缩放（蛋仔 1200×745），不再全部落在 x=960 一列
- 根帧：纵向自动布局 + 白底；宽度建帧时一次算好，之后不再 `resizeNode`

**还没做的（决策项）**：`figure`（配图）仍然 `none`。蛋仔的配图槽是裸矩形（`43:41` 那一类），渲染端只认「GROUP 内含 `配图占位`」的形状。两条路早已对比过：A 编译期把矩形包成 GROUP（要重编+发布）；B 渲染端兼容裸矩形（约 30 行，零重编）。当时倾向 B，最后没定。

### 为什么这一轮反复返工（根因，写下来防止重犯）

1. **结构模型只来自官方1.14 一套模板**。章节=图区+说明栏、顶部=5 字段+总览、簇=平铺行，全是官方形状；蛋仔的 banner / 文档说明 / 章节标题外置 / 编号在实例里全部落在假设之外，于是每撞一条就补一次补丁。
2. **验证只到「出图成功」，没到「像不像」**。前几轮看的是 `summary`（几章几簇）和坐标不重叠，黑底、黑洞占位、标号漂成一列、顶部旧文案都是人眼看截图才发现的。
3. **缺蛋仔形状的测试**。fixture 全是官方形状，真机发现的每种新结构都是「先修代码再补测试」，测试没跑到前面。
4. **Figma 侧硬限制只能真机撞**（见下节坑清单）。

### 三项待办（优先级从高到低）

**① 把蛋仔形状写进测试矩阵**
- 目标：真机每发现一种结构差异，先在 `tests/v2/fixtures` 里有一个形状，再改代码
- 待覆盖：顶部三块合成 / 章节左列+舞台+说明栏 / 簇内大截图换占位 / 编号在实例内部 / 章节标题外置 / 气泡比主图宽 / 舞台与主图同宽
- 验收：新增 fixture 后，故意改坏对应逻辑能让测试红

**② 渲染后自动截图并逐项目视**
- 目标：渲染这类「看得见」的产物，不再只看 `summary`
- 做法：渲染完成后固定调 `figma_capture_screenshot`（节点 = rootId），把图贴进对话/交接记录；至少检查：底色、占位、标号位置、章节标题、有无重叠
- 验收：下一次渲染验收这一步不能再漏

**③ 免手动重启引擎**
- 现状：引擎进程启动时把 `dist/*.js` 读进内存，改代码必须人工重启（实测 CodeMaker **不会**自动拉起已退出的引擎，杀掉只会让工具报「服务器未连接」）
- 目标：`npm run build` 之后直接调工具就能生效
- 做法：父进程常驻持有 MCP 会话，业务子进程负责渲染/编译与 figma-console 子进程；父进程监听 `dist` 变化时换掉子进程（现有 proxy 层可复用），子进程通过内部 stdio 与父进程通信
- 已有半成品：`src/server/autoRestart.ts`（默认关闭，`GAME_SOP_AUTORESTART=1` 才启用；直接退出进程这条路已验证不可行，留着当参考）

### 本轮新增/加深的真机坑（都已写进代码）

| 现象 | 根因 | 处理 |
|---|---|---|
| 编译卡 10 秒，报 `Unable to establish connection` | 实例子层 id（`I123;456`）在 dynamic-page 下 `getNodeByIdAsync` 永不返回 | `deleteNodes` 跳过含 `;` 的 id；`normalize` 判定实例子层不改名；`slim` 候选过滤 |
| `chapter.fit` 压高度压坏 | 部件根是固定高 | 编译期上 auto layout，渲染跳过 fit |
| 章节宽度被算成 4206 | 开自动布局瞬间绝对定位子级仍参与排版 | 记原宽度、设完绝对定位再写回 |
| `layoutPositioning` 报错 | 父级未开自动布局时不允许设绝对定位 | 先开布局再设绝对定位，坐标另存再写回 |
| 根帧高度变 1 | `resizeNode` 把 HUG 翻成 FIXED | 宽度建帧时定好，之后不 resize |
| 归一化把 `气泡`/`舞台` 改名成 `主图占位` | 宽度相同/更宽，被当成图区 | 已有统一名就不再认领；`widestImageSlot` 排除气泡 |
| 顶部旧文案残留 | 自由排版认不出槽位且渲染静默跳过 | 归一化补启发式 + 只清值 + `fillTop` 出软告警 |

---

## 一句话现状（2026-10-26 的旧版本，保留作背景）


两个变更已完成并归档：**模板契约 + 只读探针**、**编译到组件库**。引擎现在能把任意 `ready` 的项目模板编译成我们库里 4 个原子组件并登记 key；**多部件渲染已实现并测试通过**（见文末「多部件渲染」一节），真机重编与验收待做。

已真机接入两套模板：`~/.game-interaction-sop/templates/蛋仔派对.json`、`官方1.14.json`。

## 关键地址（换对话后直接可用）

| 用途 | 值 |
|---|---|
| 源项目文件 | `Agent草稿` / `UYCJok3MXTWITMfeJSqEF6` |
| 模板库 | `交互SOP模板库` / `jQf7zj33pzOGsGKO4d73OO`；页：`部件` `0:1` · `零件` `3:9` · `_staging` `3:10` |
| 校验沙盒 | `SOP 校验沙盒` / `0eoR7aPlpzIva8IdWATWkL`（verify 只在这里跑） |
| 模板节点 | `796:12489` 局内相关交互（蛋仔派对）· `1:14` 模板（官方1.14） |
| 已发布组件 | 蛋仔派对 4 个 + 零件 3 个；官方1.14 3 个（无结尾） |
| 已登记配置 | `~/.game-interaction-sop/templates/{蛋仔派对,官方1.14}.json` |
| Bridge 端口 | 首选 `9223`；连不上先查僵尸进程（见下） |

当前工作区干净，最新提交 `ba44bbc`。

---

## 已完成

变更 `template-contract-and-probe` → 归档在
`openspec/changes/archive/2026-10-26-template-contract-and-probe/`

主 spec 已同步：

```
openspec/specs/template-contract/spec.md   6 条需求（新）
openspec/specs/template-probe/spec.md      6 条需求（新）
openspec/specs/engine-mcp-server/spec.md   +2 条需求（探针工具）
```

测试：`packages/figma-mcp-server` 231/231 通过；`openspec validate --all --strict` 11/11。

---

## 代码落点

```
packages/figma-mcp-server/src/v2/template/schema.ts     契约类型 + 8 能力枚举 + parseTemplatePack
packages/figma-mcp-server/src/v2/template-config.ts     四级查找 + loadTemplatePack（新增）
packages/figma-mcp-server/src/v2/probe/tree.ts          规约树 + walkStructured（INSTANCE 当叶子）
packages/figma-mcp-server/src/v2/probe/detect.ts        章节/簇/母版/能力判定（核心）
packages/figma-mcp-server/src/v2/probe/fingerprint.ts   形状指纹（不含文本）
packages/figma-mcp-server/src/v2/probe/index.ts         probeTemplate / probeFromTree / 报告
packages/figma-mcp-server/src/server/createServer.ts    注册 figma_probe_template
packages/figma-mcp-server/src/server/figmaConsoleBackend.ts  serNode 改同步 + characters 截 400
packages/skill/references/template-contract.md          契约权威文档（人/agent 读）
packages/skill/references/template-1-14.md              声明为「契约实现 #1」
packages/skill/phases/phase4-figma.md                   preflight 增加探针步骤
```

测试：

```
tests/v2/probe.spec.ts              20 例（两套真机结构 fixture + 三态 + 指纹 + badge 边界）
tests/v2/probe-readonly.spec.ts      3 例（零写入）
tests/v2/probe-tool.spec.ts          5 例（MCP 工具注册/入参/草案可落盘）
tests/v2/template-pack.spec.ts      10 例
tests/v2/template-pack-lookup.spec.ts 8 例
tests/v2/fixtures/probe-trees.ts   真机结构快照（1:14 / 798:17608）
```

---

## 契约要点（记住这四条就够）

```
1. 4 个原子部件：top / chapter / cluster / footer，各一个组件库 key
   （不用组件集+变体名，避免运行时"找不到变体"）
2. 8 项能力枚举，缺省值 = 官方 1:14：
   overview / clusterGroups / badgeSlot / numberBadge /
   roleAnnotation / figure / hiddenPool / column
3. 样式不进配置：字体/颜色/间距/标号形状靠克隆继承
4. 结构差异才进契约；新差异不能表达就拒绝，不临时加能力
```

类型 / 判定细则见 `openspec/changes/archive/2026-10-26-template-contract-and-probe/design.md` 的 **D12**（5 条真机判据）。

---

## 真机验收结果（可直接复跑）

```
figma_probe_template({nodeId:"1:14"})       ready · 1 章节 / 2 簇 · 能力全缺省
figma_probe_template({nodeId:"798:17608"})  ready · 2 章节 / 8 簇 ·
    none/none/manual/instance/inline-suffix/first-non-text/reuse/right
figma_probe_template({nodeId:"796:12489"})  ready · 3 章节 / 15 簇 · 14110 节点 · 17s
figma_probe_template({nodeId:"999:999"})    code=V2_PROBE_NODE_NOT_FOUND
```

指纹（证明只读）：`1:14 → 216c7c73…` / `798 → 8a371ee4…` / `796 → c47d41e9…`

---

## 未提交

工作区有未提交改动（12 个修改 + 12 个新增），**没有 commit**。换对话后第一件事可能需要：

```
git add -A && git commit -m "feat(template): contract v1 + read-only template probe"
```

---

## 下一个变更：`engine-multi-part-template-render`

渲染改成「导入 4 部件 → detach → append」，落地 8 项能力（含 `clusterGroups` / `hiddenPool` 两个填充算法的函数级分叉）。

开工前必须处理的三条已知债务：

1. **部件带着原稿内容**：编译是克隆母版，章节部件里仍有该项目当时的文案、截图实例与全部簇，渲染填充前必须清空
2. **标号摆位**：容器已统一（`badgeSlot=container`），但标号落点没算，渲染要做
3. **`md-contract.md`** 仍未生成（契约里只定义字段集与「模板结构为准」）

编译侧遗留（不阻塞渲染）：

- `1:14` 的部件仍依赖草稿里的组件（该模板无可收编的实例），所以 verify 只能在沙盒里跑
- 收编独立性（删源组件后不塌）未实测，已缓办

---

## 编译阶段落点（第二个变更）

```
src/v2/compile/index.ts        compileTemplate(compile|verify) 编排；含两页自动排版
src/v2/compile/parts.ts        planParts / buildParts（克隆→变组件→可见→锚点）
src/v2/compile/intake.ts       进门检查（齐全 / 类型 / 尺寸对探针 / 标号容器）
src/v2/compile/adopt.ts        adoptNestedParts（跨部件去重、变体集重组、内容闸门）
src/v2/compile/font-normalize.ts  Noto Sans SC 三档 + 字重映射
src/v2/compile/badge-container.ts 从 1:14 气泡克隆空容器
src/v2/compile/anchor.ts       三档锚点降级 + anchors 只写降级项
src/v2/compile/verify-capabilities.ts 产物能力重算（判不出的保留源值并记缺口）
src/v2/compile/preflight.ts    四条前置校验
src/v2/compile/backfill.ts     真 import 冒烟 + template.json 组装自检
src/v2/compile/errors.ts       8 个错误码
```

后端新增能力（`figmaConsoleBackend.ts`）：`createComponentFromNode`（GROUP 先套 FRAME）、
`combineAsVariants`、`setPluginData`、`renameNode`、`readComponentKey`、`importComponentByKey`、
`normalizeFontsInSubtree`、`adoptInstances`（`getMainComponentAsync`）、`createInvisibleAnchor`、
`setNodeVisible`、`arrangePageChildren`。

SOP：`packages/skill/references/template-compile.md`。

测试 304 例，全部通过。

### 编译阶段真机验收（2026-10-27）

```
蛋仔派对 796:12489  4 部件 + 收编 标签6变体/num/-完成 + 跳过 72 个内容实例
                    发布 → verify 4 key 全取到 → 登记配置
官方1.14 1:14       进门检查 3 项尺寸全对 → 3 部件（无结尾）
                    发布 → 沙盒 verify 3 key 全取到 → 登记配置
能力                numberBadge:instance / roleAnnotation:inline-suffix /
                    clusterGroups:none 均如实保留；唯一差异 badgeSlot manual→container（预期）
源模板              preflight 指纹一致，零写入
```

踩过并已修的真机坑（都写进了代码或文档）：

1. `createComponentFromNode` 拒绝 GROUP 直转 → 先套同尺寸 FRAME
2. `mainComponent` 在 dynamic-page 下必须 `getMainComponentAsync`
3. 隐藏的簇母版克隆后要强制可见，否则整簇隐形
4. 图层还嵌在 COMPONENT 里时不能转组件 → 先挪到零件页
5. 部件里看不到 `overview` / `roleAnnotation` 时不能判 `none`，要保留源值
6. 冒烟在源文件里 import 会因依赖成环超时 → 改沙盒
7. 项目名含 `:` 无法做配置文件名 → 命名闸门

---

## 已知遗留

- **项目名更正（2026-10-27）**：`796:12489` / `798:17608` 属于 **蛋仔派对**，归档变更里写的「惊魂寻宝队」是错的。归档文件不改（当作历史），现行文档与库内组件命名已改为 `蛋仔派对 / 顶部|章节|簇|结尾`、`蛋仔派对 / 零件 / …`。
- **端口漂移（2026-10-26 踩过）**：连续重启 MCP 时旧进程不退、继续占 9223–9232，新进程一路上漂（9229→9230…），插件只认 9223，表现是「重启后插件连不上 / 显示已连接但工具报 Cannot connect」。排查与清理命令见 `packages/figma-mcp-server/docs/INSTALL.md`「重启引擎后 Bridge『坏了』」。本次已一次性清掉 7 个僵尸进程。
- 14000 节点文档扫描约 17s；超时自动降级到 1/4 预算并把结论降为 `needs-anchor`（不会误判 non-conformant）
- `badgeSlot=manual` 的项目，图上标号仍需人工摆位（`796` / `798` 都是）
- 一项目一套模板；多套留到之后
- `md-contract.md` 的生成逻辑未做（契约里只定义了字段集与「模板结构为准」原则）
- `796` 的 `1:14` 判定里 `#Name` 在 `#Name/界面名称` 框内、主图在 `rec组` 内，fixture 已按真机结构重写，勿按旧文档假设改回

---

## 多部件渲染（2026-10-27，代码完成，真机待验收）

变更：`openspec/changes/engine-multi-part-template-render/`（proposal / design / specs / tasks 齐备）。

代码落点：

```
src/v2/template-slots.ts             统一槽位命名表（唯一真源）
src/v2/compile/normalize-slots.ts    编译期改名（幂等、关键槽位缺失即拒绝）
src/v2/compile/badge-container.ts    + ensureBadgeMaster（容器收口唯一隐藏母版）
src/v2/compile/md-contract.ts        md-contract.md 正文生成
src/v2/render/parts/index.ts         导入 → detach → 拼装 / 清空原稿 / 标号 / 两遍布局
src/v2/render.ts                     按模板包分派 parts|legacy（stderr 打印 render mode）
```

行为要点：

- 有模板包（top/chapter/cluster 三 key 齐全）走 parts；否则**完全回落旧路径**
- 槽位只按统一名取；缺失报 `V2_RENDER_PART_SLOT_MISSING`，不猜形状
- 冲突在建画布前拒绝：`V2_RENDER_OVERVIEW_UNSUPPORTED` / `V2_RENDER_SUBGROUP_UNSUPPORTED`
- 标号：容器内克隆隐藏母版、按 8 宫格摆位；无母版报 `V2_RENDER_BADGE_MASTER_MISSING`
- `md-contract`：`verify` 报告带 `mdContract`；新增只读 `phase: "contract"`（不连 Figma）

测试：`packages/figma-mcp-server` 334/334 通过，含 `render-parts-equivalence`（同一份 md 在 1:14 上新旧路径的槽位文本一致）。

真机待做（tasks 10.x）：

1. 沙盒里用 `官方1.14` 包渲染样例 md，新旧路径逐节点比对
2. 重编 `蛋仔派对`（改名 + 母版收口）→ 人工发布 → 沙盒 `verify` → 回填 key
3. 落盘两份 `md-contract.md`，抽查禁写清单
4. 已知限制：`badgeSlot=manual` 仍不摆标号；parts 文档暂不支持 reconcile 同步

### 真机进度（2026-10-27 晚）

已完成：

- `官方1.14` 四部件在沙盒渲染成功（root `5:501`，顶层不重叠、原稿已清空、标号 1/2 正常）
- `蛋仔派对` 重编成功并**已发布**，新 key 已回填 `~/.game-interaction-sop/templates/蛋仔派对.json`（旧配置备份 `.bak`，旧 4 个组件已从库里删除）
- 新 4 个 key 在沙盒 `importComponentByKeyAsync` 冒烟通过（8–143ms）
- 归一化实测正确：`Frame 1243 → Text`、`Slide 16:9 - 25 → 主图占位`、`序号 → #Title_Main`、`image 37964 → 配图`、`num`(+内层文本) `→ Number`、`Frame 4273… → 职能标记`
- `md-contract.md` 已生成到 `~/.game-interaction-sop/templates/蛋仔派对.md-contract.md`

卡住的点（**下次优先解决**）：

蛋仔章节部件编译后仍有 **7235 个节点**（原模板 5 个簇全带进来了）。渲染在它上面扫描/删除时插件被压垮，报
`deleteNodes(39): Unable to establish connection to Figma after 10 seconds`。

结论：**部件应该在编译期就做成空壳**，而不是让渲染去删：

| 部件 | 编译期应收口到 |
|---|---|
| `chapter` | 图区 + 空 `Text` 说明栏 + `气泡`(仅母版) — 不留任何簇 |
| `cluster` | 编号 + 标题 + 1 条 `正文/规则` + 1 个 `#Title`(若有) + 1 个 `配图`；隐藏备用池保留 |

顺带确认的坑：

- `figma_reconnect` / 引擎内部 backend 与直接 `figma_execute` 是两条通道，库文件发布会短暂让跨文件 import 挂起 → 沙盒里 Assets→Libraries 关开一次即可
- 扫描预算默认 500 会触发逐节点 BFS（几千次 RPC）；已提到 20000，删除已分批、超时 30s
- 沙盒里 `蛋仔验收` 页与半成品已清掉；`5:501`（1.14 验收产物）保留

下一步建议（新变更 `template-compile-slim-parts`）：

1. 编译期空壳化 4 部件（上表）
2. 重编蛋仔 → 发布 → 冒烟 → 回填
3. 再跑蛋仔样例渲染验收

### 2026-10-28 更新：蛋仔真机渲染已通

- 编译改为「造壳」：`buildChapterShell` 新建同尺寸外框 + 空图区矩形 + 同属性空说明栏，**不再克隆 7000 节点章节**（克隆会撞 Bridge 10s 传输上限）
- 簇改用小簇 `Frame 1245`（5:5564），归一化/空壳化都在秒级
- 蛋仔新 key（已发布 + 沙盒 import 冒烟通过）：
  - 顶部 `2756b03240e7d6135f43e540fd22ea3e23ad0c04`
  - 章节 `e815d0e4ece7fc4dc0bfcf9fc6ec4a7be29be903`
  - 簇 `2f2354780b9b2b7df7aaeeeadd059c743f35b1a7`
  - 结尾 `8727d5780ce22edb83c762f6d1bf37489b125fc6`
- 沙盒渲染成功：root `19:1123`（2209×12992，两章不重叠、3 簇、标号 1/2 按网格、原稿无残留）
- 库已清理：删掉 52 个废弃组件，只留 官方1.14×3 + 蛋仔×4 + 蛋仔零件 9
- 配置与契约已更新：`蛋仔派对.json`（`badgeSlot: container`、`figure: none`）、`蛋仔派对.md-contract.md`

尚未做：章节高度贴合内容 + 标号克隆改名（`c699e1a` 已提交，下次重启引擎生效）；`figure` 暂为 none（配图槽是裸矩形，渲染暂不填）。

---

## 当前状态快照（2026-10-28 02:00，换对话前）

### 代码

- 最新提交 `e7dd1b5`（`git log --oneline -8` 可见最近一串小提交）
- 工作区干净；`npm run build` 通过；`npm test` **342/342**；`openspec validate --all --strict` **14/14**
- 两个变更目录：
  - `openspec/changes/engine-multi-part-template-render/`（主体，tasks 仅剩 10.2/10.4 未勾）
  - `openspec/changes/template-compile-slim-parts/`（空壳化，tasks 剩 6/7 真机项）
- 关键实现：
  - `src/v2/template-slots.ts` 统一槽位名
  - `src/v2/compile/normalize-slots.ts` 编译期改名（幂等；说明栏被掏空也能认）
  - `src/v2/compile/slim-parts.ts` 空壳化
  - `src/v2/compile/parts.ts` → 章节走 `buildChapterShell`（造壳，不克隆 7000 节点），簇走 `cloneSlimPart`
  - `src/v2/render/parts/index.ts` 多部件渲染（阶段前缀 + 回滚上报 root）
  - `src/server/figmaConsoleBackend.ts`：`createFrame` / `resizeNode` / `clearFills` / `cloneSlimPart` / `buildChapterShell`；clone/createComponent 超时 60s；scan 预算 20000

### 真机

- 库 `jQf7zj33pzOGsGKO4d73OO`：只剩「官方1.14 ×3（17:1465/1547/1583）+ 蛋仔 ×4（43:24 顶部 / 43:28 章节 / 43:2869 簇 / 43:2874 结尾）+ 蛋仔零件 9 个（43:2899 起）」，废弃组件已清 52 个
- 蛋仔 pack（已回填、已发布、沙盒 import 冒烟通过）：
  - top `2756b03240e7d6135f43e540fd22ea3e23ad0c04`
  - chapter `e815d0e4ece7fc4dc0bfcf9fc6ec4a7be29be903`
  - cluster `2f2354780b9b2b7df7aaeeeadd059c743f35b1a7`
  - footer `8727d5780ce22edb83c762f6d1bf37489b125fc6`
  - capabilities：`overview none / clusterGroups none / badgeSlot container / numberBadge instance / roleAnnotation inline-suffix / figure none / hiddenPool ignore / column right`
- 沙盒 `0eoR7aPlpzIva8IdWATWkL` / Page 1：**唯一产物 `19:1123`**（蛋仔样例，两章、3 簇、标号、无残留）
- 渲染跑法（模板包查找只认 cwd/`GISOP_PROJECT`/default）：临时把 `蛋仔派对.json` 复制成 `~/.game-interaction-sop/templates/default.json` → 渲染 → **用完必须删**（否则 72 个老测试会走 parts 路径而红）

### 下一步（按优先级）

1. 插件状态恢复后重渲染蛋仔，确认 `c699e1a` 的「章节高度贴合 + 标号改名」生效（不需要重编/发布）
2. 让 `figure` 真正可用：`配图` 目前是裸矩形，渲染的 `finishBlockFigures` 期待 GROUP（含 `配图占位`）。两条路：编译期把矩形包成 GROUP，或渲染支持裸矩形
3. 归档两个变更（`openspec-archive-change`），并把 `template-render` 主 spec 同步
4. 未做：parts 文档的 reconcile 同步、跨文件自动搬运

### 真机踩坑（新增）

- Bridge 单次 `figma_execute` 超过 ~10s 就会被判「Unable to establish connection」，**后端 timeout 设多大都没用** → 大块操作必须拆小或改成「造壳」
- 库重新发布后，沙盒的库引用要 **Assets→Libraries 关开一次**，否则跨文件 import 挂死
- 扫描预算默认 500 会退化成逐节点 BFS（几千次 RPC），已提到 20000
- 多部件渲染失败必须上报 root id 才能回滚（`e7dd1b5` 已修）



