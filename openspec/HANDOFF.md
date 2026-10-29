# 交接说明（2026-10-29）

## 当前状态快照（2026-10-29 04:00，换对话先读这一节）

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



