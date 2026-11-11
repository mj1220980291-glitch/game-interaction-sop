# CHANGELOG

## 0.4.9（引擎，skill 仍 2.5.1）— 2026-11-11

**蛋仔基线包回来了：库已发布就能生成完整包，不再只能整轮 compile。** 现场：本机
`~/.game-interaction-sop/templates/蛋仔派对.json` 丢了（模板包从来不进仓库），蛋仔文档
静默回落到官方 1.14 基线——`ok:true`、只是「长得不对」。而按 key 生成包这条路
（`captureGeometryFromKeys`）本来就**采不到章节外框**，还漏了标号网格。

### 1. verify 补齐原稿透传

- `CompileInput` / `captureGeometryFromKeys` 新增 `sectionSourceId` / `badgeSourceId`
- 原稿节点（章节外框、标号容器）改由**源文件后端**读——此前 `inside` 用库文件后端扫
  `气泡`，永远扫到空，标号网格静默缺失
- 缺 id 时 `gaps` 点名：「缺原稿章节 id（`sectionSourceId`），`sectionShell` 缺失 →
  章节贴边、丢卡片底色」，标号同款
- `verifyPhase` 此前把几何 gaps 丢掉（返回 `gaps: []`），现在原样带出

### 2. `audit_template_pack(deep)` 的 key 冒烟独立成函数

`smokePackKeys(backend, components)`：`footer: null` 之类的合法空跳过、key 在但 import
不到只记一条失败，不抛。工具侧行为不变。

### 3. 新增基线包 `assets/packs/蛋仔派对.json`

按库内已发布组件（`110:74/86/114/119`）重新量，随引擎分发：

| 项 | 值 |
|---|---|
| key 冒烟 | 4/4 import 通过 |
| 几何 | 底色 `#232429`、章节宽 `2209`、主图 `1200×719`、占位 `#F5F5F5`/`#BFBFBF`、标号母版 `63×63` |
| `sectionShell` | 有意为空——蛋仔黑边在**文档根**（左右各 60），不在章节外框上，审计只报这一条可接受项 |
| 能力 | `none / none / container / instance / inline-suffix / none / reuse / right` |

真机验证（沙盒 `0eoR7aPlpzIva8IdWATWkL`，`buzhong.md`）：`ok:true`，2 章 / 3 簇 /
3 标号，根 `135:1663`，无 `V2_W_TEXT_CONTRAST_LOW`。

### 4. 回归

- 新增 `tests/v2/compile-geometry-from-keys.spec.ts`（3 条：采到外框与网格 / 只从源文件读 /
  缺 id 的话术），`pack-audit.spec.ts` +3 条（deep 冒烟）
- 85 files / 669 tests 通过（`--no-file-parallelism`），`tsc` 通过；版本 `0.4.8 → 0.4.9`


## v2.5.1（skill，引擎仍 0.4.6）— 2026-11-10

**三份 base 补齐“结构”这一层。** 2.5.0 的 base 只有 `verbosity / role_annotation / wording` 三组 frontmatter 字段，结构要求写在正文散文里——A/C 靠 frontmatter 差异生效，B（三段式）没有机器可读落点，实测产出退化成一整片平铺 bullet。**本次仅 skill 侧改动，引擎代码零改动。**

### 1. 新增 `structure` 字段（三份 base 都带）

```yaml
structure:
  layout: grouped            # flat / grouped
  sections: [界面信息, 状态, 动效]
  require_sections: true
  role_first: true           # detailed 用
```

- `flat`：簇内平铺，全文不得出现 `####`（regular / detailed）
- `grouped` + `require_sections`：每簇必须分段，段名与顺序同 `sections`，无内容的段可省略，不改名 / 不挪位 / 不加第四段（tri-section）
- 对 base、`style.md`、`style_own.md`、`style_<name>.md` 一律生效；不写时按 `flat` 处理，与旧行为一致

### 2. tri-section 段名换掉撞 W2 的两个词

`显示规则 / 状态说明 / 动效说明` → **`界面信息 / 状态 / 动效`**。

- `显示规则` 在 `markdown-v2-spec.md` 的 W2 死分类词表里，写出来必得 `W2_DEAD_CATEGORY_CLUSTER_NAME`；spec 又写「`####` 可选、超过 6 条才用」——两处规范都对撞，模型于是不敢分段
- base 里补明「`require_sections: true` 覆盖 spec 的『`####` 可选』建议；`####` 本身合法（G1–G3 只限位置 / 长度 / 重复）」
- 删掉旧句「命中 W2/W6 属预期输出，不因警告改名」，改为「出现 `W2_DEAD_CATEGORY_CLUSTER_NAME` 说明段名被改坏，必须改回」

### 3. 三份 base 补齐 own style 有、base 没有的四块

| 补的块 | 内容 |
|---|---|
| `## 结构偏好` | 逐条可执行：簇名名词化 / bullet 数 / 配图紧跟规则 / `@动效` 独立成条落簇末 / 职能条目紧挨规则；tri-section 另加「三段强制、每段 bullet 必须落在 `####` 下、状态写描述文本、动效全在 `动效` 段」 |
| `## 示例` | 每份 1 组好 / 坏对照，坏例点明错在哪 |
| `## 沉淀与迭代` | base 只读的出路：首轮 `cp style-base-<key>.md → .interaction-sop/style_own.md`，之后学进 own；附「学习记录」表格式 |
| `wording.terms` / `wording.replace` | 补空数组 + 用法注释（Phase 2 自检一直在查这两个字段，base 里此前根本没有） |

### 4. 校验与文档对齐

- `phases/phase2-markdown.md`：输出前自检新增「`structure` 已落地」一项
- `references/style-mod-schema.md`：新增 `### structure` 字段说明 + 自检项 + 冷启动反推改为四组字段
- `SKILL.md` / `phase1-analysis.md` / `style-default.md`：三段名同步

### 影响

- `manifest.json`：`2.5.0 → 2.5.1`
- 无引擎改动，`engineVersion` 仍为 `^0.4.4`

---

## v2.5.0（skill，引擎仍 0.4.6）— 2026-11-10

**3 份出厂基础 style + 首次使用新手引导。** 把单份 `style-default.md` 升级为 3 份候选 base，覆盖主流写法；新用户不再默认吃一份 fallback，第一次进入时介绍 3 种让其挑或都生成对比。**本次仅 skill 侧改动，引擎代码零改动。**

### 1. 新增 3 份基础 style（随 skill 分发）

| key | 文件 | 关键差异 |
|---|---|---|
| `regular` | `references/style-base-regular.md` | 3-6 bullet / 簇；选择性 at 职能（动效 / 新资源 / 关键逻辑） |
| `tri-section` | `references/style-base-tri-section.md` | 簇内固定三段 `#### 显示规则 / 状态说明 / 动效说明`；状态用描述文本 |
| `detailed` | `references/style-base-detailed.md` | 5-10 bullet / 簇；每个相关职能一条独立 `- @职能：` |

旧 `references/style-default.md` 改成 3 份 base 的索引（仍随 skill 分发，不丢向后引用）。

### 2. 新增 `.interaction-sop/style.config.json` 轻配置

```json
{ "schema_version": 1, "defaultBaseStyle": "regular" }
```

- 记录当前项目的默认 base，由 Phase 1 新手引导流程写入
- 优先级：`style_own.md` > `style.md` > `style.config.json` > 新手引导
- base 文件本身**只读**，任何 Phase 都不改写；用户调整某份 base 走 Phase 5 沉淀为 `style_own.md`

### 3. Phase 1 首次使用引导

命中条件：`.interaction-sop/` 下既无 `style*.md` 也无合法 `style.config.json`。

- 介绍 3 份 base + 推荐「都生成一次对比」
- 用户三选一 → 写 `style.config.json`
- 用户选「都生成」→ Phase 2 产出 3 份 md（文件名加 `_regular / _tri-section / _detailed` 后缀），落 Figma 后两种落地：（a）挑一种做默认，（b）改一份返还由 Phase 5 沉淀为 `style_own.md`

### 4. 文件选择顺序更新

- `style_<name>.md` 判定**排除基础 3 份 base**（它们只是候选，不参与询问）
- 四级优先：`style_own.md` > `style.md` > `style.config.json` 的 base > 新手引导
- 任一层级下有 `style_<name>.md` → 问一次是否切换

### 5. 影响

- `manifest.json`：`2.4.3 → 2.5.0`，`references` 新增 3 份 base
- `SKILL.md` / `phase1-analysis.md` / `phase2-markdown.md` / `phase5-style-learn.md` / `style-mod-schema.md` / `README.md` / `SETUP.md` / `V2.md`：文件选择顺序、首次使用引导、写入目标表全部对齐
- 无引擎改动，`engineVersion` 仍为 `^0.4.4`

---

## 产品介绍材料 — 2026-11-06

- 新增 `docs/architecture/leadership.html`：面向管理者的 16:9 产品全景图，用大众产品语言呈现需求到交付的六步流程、三个后台协作能力和项目经验复用闭环。
- 单文件离线打开，支持全屏展示、高清图片导出与展开讲解备注；配套 `leadership-preview.png`、`leadership-4k.png` 可用于汇报。
- 本次仅新增介绍材料，不改变引擎、skill 或版本契约。

## 未发布（文档 / 自查）— 2026-11-11

**分享前把三条已知限制从「口头知道」变成「文档里能查到」，并清掉个人路径。** 无代码行为改动。

### 1. 已知限制写进三个落点

| 现象 | 写在哪 |
|---|---|
| 左列只到「标题 + 主图」高，下方空白是卡片底色 | `template-contract.md` 新增「三·六、章节几何」；`INSTALL.md` 新增「看起来像 bug、其实是设计」表 |
| 标号走模板网格（未传 `badgeAnchors`） | `phase4-figma.md` 两处补口径：**只补表走同步重排，不要手拖标号 / 改模板网格 / 调章节尺寸** |
| 偶发 `Unable to establish connection … 10 seconds` | `INSTALL.md` 同表（渲染 3 次 / 退避 3s·9s，同步仍 2 次 / 5s）；`phase4-figma.md` 的 `V2_W_RENDER_RETRIED` 由「上限 2 次」更正为「0.4.8 起 3 次、退避 3s / 9s」 |

### 2. 新增 `docs/onboarding.md`

一页接入：装编译 → 配 MCP（只配一个）→ 起插件 → 渲染 demo（用
`tests/v2/fixtures/buzhong.md`），四步各带验证点；附三条已知限制、模板包选用
（`audit_template_pack`）、卡点分流表。

### 3. 分享前自查

- 清掉 4 处个人路径（`C:\Users\…` / `H:\kk8…`）→ `<用户目录>` / `<旧仓库>`
- `scripts/test-parse-level-system.mjs` 的硬编码 md 路径改成 argv 入参
- `assets/packs/README.md` + `docs/onboarding.md` 标注：`default.json` 的 key 属公司内
  「官方 1.14」库，团队外需自备模板包
- 全仓无 `figd_` token、无 `.env` / `mcps.json` 实例

---

## 未发布（工具链 / 文档）— 2026-11-11

**准备对外分享：安装片段改 node 绝对路径。** `scripts/install-mcp.mjs` 原先输出
`"command": "node"`：目标机器 PATH 里没有 node 时，宿主连 MCP 进程都拉不起来，表现是
「MCP 面板一直连不上」，日志只有 `spawn ENOENT`（本机 11-04 就是这样，排查了一整晚）。

- 安装片段（CodeMaker 表单 / Codex TOML / `mcpServers` JSON / 默认提示）一律输出
  `process.execPath`
- `SETUP.md` 配置表改成「node 绝对路径」并写明原因
- 新增 change `openspec/changes/sop-sharing-readiness/`：分享前剩余项（两套基线包重编、
  已知限制文档、LICENSE/NOTICE、试点验收）

## 0.4.8（引擎）— 2026-11-11

**整轮重试只给了 2 次、退避固定 5s，两次都撞在同一段抖动里。** 0.4.7 验收 13.3：同一配置
连续两次返回 `[fill.chapter1] … Unable to establish connection to Figma after 10 seconds`，
第三次手动成功；期间 `figma_list_open_files` 与轻量 `figma_execute` 正常。

排查结论：`fill.*` **本来就在重试范围内**（判据看整轮错误 message，`isTransientBridgeError`
匹配 `Unable to establish connection`，阶段前缀不参与判断），真实原因是 **首轮 + 默认 1 次
重试全部用尽**。

### 改动

- 整轮尝试上限 `2 → 3`
- 退避 `固定 5s → 3s / 9s 递增`，避免两次重试落在同一个抖动窗口
- 文档写明：`[阶段名]` 前缀不影响是否重试；10s 是 figma-console 自己的重连预算，不归我们调，
  放宽只会让失败更慢

### 回归

- `tests/v2/render-call-surface.spec.ts` 新增两条：连续两次瞬时失败后第三次成功（断言退避
  `[3000, 9000]` 与 `3 次上限` 文案）、三次都失败才返回错误
- 版本 bump `0.4.8`

## 0.4.7（引擎，skill 仍 2.4.3）— 2026-11-11

**背景取值修对了，但文字样本取了章节标题。** 0.4.6 验收（用例 B：删 geometry）报出
`文字 #FFFFFF / 背景 #FFFFFF / 1.00:1`，而产物逐节点实测是「标题 `#FFFFFF`、正文 `#EEEEEE`」。
审计把章节里第一个 TEXT（标题）当成了正文样本；正文 `#EEEEEE` 压 `#FFFFFF` 实际约 1.15:1。

### 修法

- 审计只统计**正文层**（`bodyNames`，默认 `正文/规则`）：标题、标号这类文本既不进样本，
  也不进「正文条数」；它们的低对比单独记在 `otherLowContrast`，message 里一句带过
- 一章里一个正文层都认不出来时，退回「全部文本」，并在 `basis: 'all-text'` 里标明口径，
  message 写成「文本（未识别到正文层）」，不再谎称正文
- message 的样本附「层名」，一眼能看出取的是哪一层

### 顺带（验收建议）

- **`V2_BRIDGE_DOWN` 附端口持有者**：探活失败时用 `describePortHolders()` 报
  「端口 9223 当前被占用：pid=35520（…\figma-console-mcp\dist\local.js）」。
  真机 2026-11-10 的现场就是残留 figma-console 占着 9223，而旧文案只说「没有插件回话」
- 截图重试在 0.4.6 已验证生效（验收 12.5：本次无 `V2_W_SCREENSHOT_FAILED`），回执 9.5.2 可关闭

### 回归

- `tests/server/contrast-audit-script.spec.ts` 扩到 11 条：新增「只统计正文层，标题白字不进样本」
  「正文层名对不上时退回全部文本并标明口径」
- 84 files / 661 tests 通过；版本 bump `0.4.7`

## 0.4.6（引擎，skill 仍 2.4.3）— 2026-11-06

**对比度自检把「没有底色」也一起跳过了——恰好屏蔽掉最该响的那种火。** 0.4.5 验收用例 B
（删掉 `geometry`）第二条判据不可达：`V2_W_PACK_GEOMETRY_DEFAULTED` 正常出现，但没有
`V2_W_TEXT_CONTRAST_LOW`；告警全集只有 BADGE_ANCHOR / ASSET_KEY_UNMATCHED / PACK_GEOMETRY /
SCREENSHOT_FAILED。

### 根因（比验收判断更靠前一层）

审计从**章节节点**开始走，`walk(chapter, null)`：

- 章节上方的根帧（默认 `#FFFFFF`）与章节外框（`#161616`）**都不在子树里**
- 章节本身 `fills = []`（编译期造壳时清空）
- 于是「找不到实心祖先」→ 整章计 `skipped`，一条不判

所以不只是「无实心祖先被跳过」，而是**起点选错**：引擎明明知道章节上方刷了什么颜色
（章节外框内层 fill → `docBackground` → 默认白），却没传进去。

### 修法（采用验收建议 1）

- `auditTextContrast({ rootIds, minRatio, inheritedBackground })` 新增继承背景；脚本
  `walk(root, inherited)` 以它为起始背景，章节内部的实心容器仍优先覆盖
- 渲染侧按实际刷的颜色算：`sectionShell` 内层 `fill` → `docBackground` → `#FFFFFF`
- 用例 B 现在成立：缺 geometry → 继承背景 `#FFFFFF`，正文 `#EEEEEE` → 报
  `#EEEEEE` / `#FFFFFF` / 约 1.17:1
- 用例 A 不变：继承背景 `#161616`，正常配置仍 0 条

### 顺带

- **截图重试**：`exportNodeImage` 套 `retryTransient`（3 次 × 3s）。真机连续两次的
  `Unable to establish connection to Figma after 10 seconds` 属「渲染刚结束、连接抖一下」，
  重试一次基本就回来；仍失败才降级成 `V2_W_SCREENSHOT_FAILED`
- **文档**：`V2_W_RENDER_RETRIED` 明确写「已自动重试成功、无需人工干预、不要因此重跑」；
  `V2_W_SCREENSHOT_FAILED` 写明「画布是好的，别重渲染」

### 回归

- `tests/server/contrast-audit-script.spec.ts` 扩到 9 条：新增「缺 geometry 现场靠继承背景
  报出真实颜色」「章节内实心底覆盖继承背景」
- 84 files / 659 tests 通过；版本 bump `0.4.6`

## 0.4.5（引擎，skill 仍 2.4.3）— 2026-11-06

**对比度自检假阳性：TEXT 拿自己的填充当背景，恒等于 `1.00:1`。** 现场（变色龙 0.4.4 验收，
enginePid 1552）：正常配置下 3 章共 98 条 `V2_W_TEXT_CONTRAST_LOW`，数据一律
`文字 #FFFFFF / 背景 #FFFFFF / 1.00:1`；缺不缺 `geometry` 数值完全相同，画布实际是
`#161616` 底 + 白字，可读正常。

### 根因

`buildContrastAuditScript` 里：

```js
const own = solid(n);          // TEXT 自己的文字色
const nextBg = own ?? bg;      // ❌ 被当成了「子节点的背景」
ratio(fill.color, nextBg.color) // → 自己比自己，恒 1.00:1
```

文字节点没有子节点，`nextBg` 只影响它自己的比值计算 → 必然误报，且与背景实际颜色无关，
所以「有没有 geometry 数值一样」。**采样时机没问题**（渲染收尾后读画布），错的是背景回溯。

### 修法

- `nextBg` 只由**非 TEXT** 节点的填充决定；比值一律用祖先背景 `bg`
- 找不到实心祖先 → 计 `skipped: no-solid-ancestor`，不算低对比
- 脚本提到模块级 `buildContrastAuditScript(rootIds, minRatio)` 导出，**可被单测直接执行**
- 新增 `tests/server/contrast-audit-script.spec.ts`（7 条）：用假 figma 树 + `new Function`
  跑真脚本，覆盖「深底白字不误报」「浅底浅字才报且取祖先色」「TEXT 填充不当背景」
  「无实心祖先跳过」「INSTANCE / 隐藏跳过」「半透明 / 渐变不算背景」「阈值可调」

### 回归

- 84 files / 657 tests 通过（`--no-file-parallelism`）
- 版本 bump 到 `0.4.5`（0.4.4 已被验收方用于「版本可辨识」判据，必须换号才能区分 build）

## v2.4.3（skill）/ 0.4.4（引擎）— 2026-11-05

**模板包不再「本机私有」：基线包随引擎分发，缺了观感会自己说出来。** 现场：换电脑后模板包丢失，
照着组件库重造了一份，结果少了 `geometry`（`docBackground` / `sectionShell`）→ 文档根落默认
`#FFFFFF`，模板的 `#EEEEEE` 浅字压白底，整章不可读，而渲染返回 `ok:true`、`errors:[]`。

### 1. 查到的三条事实

- 模板包**不随仓库分发**：项目级 `<项目>/.interaction-sop/template.json` 被 `.gitignore` 忽略，
  用户级 `~/.game-interaction-sop/templates/*.json` 在仓库外，`git log --diff-filter=A -- "*templates/*.json"` 零条
- 「库已发布 → 生成包」这条路**采不到章节外壳**：`compile/geometry.ts` 的 `captureGeometryFromKeys`
  调 `captureGeometry` 时没传 `sectionSourceId` / `sourceRootId` / `badgeSourceId`（`sourceBackend` 是死参数）
- 缺了**不吭声**：`incomplete` 只检三个 components key；`capabilities` 缺省静默填默认；
  返回体不回显 `geometry`，也没有任何 warning

### 2. 改动

- **六級查找**：`env` → 项目包 → 用户 `<project>` → 用户 `default` → **引擎包内 `<project>`** → **引擎包内 `default`**；
  `assets/packs/default.json` 随包提供官方 1.14 基线（含 capabilities + `docBackground` + 两层 `sectionShell`）
- **`GISOP_BUNDLED_PACKS=off`**：排查「机器上到底有没有包」时关掉基线
- **`V2_TEMPLATE_KEY_STALE`**：库重发后旧 key import 失败，明确报 part / key / pack 路径 + 重取路径
- **观感自检（软告警，不判错）**：`W_PACK_GEOMETRY_DEFAULTED`（缺 docBackground / sectionShell，点名后果）、
  `W_TEXT_CONTRAST_LOW`（正文 vs 最近实心祖先的对比度 < 3.0，`GISOP_CONTRAST_MIN` 可调；跳过实例内部 /
  渐变 / 图片底）；插件侧一次往返算完，失败路径也带字段告警
- **只读工具 `audit_template_pack`**：按渲染同一顺序定位包，输出 pack 摘要 + findings；`deep:true` 加 key 冒烟
- 解析顺序与字段契约写进 `template-contract.md`（geometry 明确为「非必填、缺了掉观感」）

### 3. 回归

- 新增 `tests/v2/template-pack-bundled.spec.ts`（7）、`tests/v2/pack-audit.spec.ts`（9）、
  `tests/server/pack-audit-backend.spec.ts`（3）；`render-pack-observability` 增加失败路径断言
- 全量：83 files / 650 tests 通过（`--no-file-parallelism`）
- 既有 adopt / legacy 用例改为显式 `GISOP_BUNDLED_PACKS=off`（它们模拟「机器上没有包」）

### 4. 未完成

- 基线包缺 `placeholder` / `bubbleGrid` / `docPadding` / `footerGap` 原值（需重编）；蛋仔基线包尚未产出
- `captureGeometryFromKeys` 的 `sectionSourceId` 透传未做（下次重编时一并补）

## v2.4.2（skill）/ 0.4.3（引擎）— 2026-11-04

**桥不再「假活」：活链判定改成插件回环往返，渲染不再把 60s 交给宿主自愈。** 现场：变色龙项目
`render_v2_markdown_to_figma` 恒报 `V2_RENDER_RUNTIME_ERROR / Cannot connect`，`enginePid`
每调都变（49956 → 27364 → 10580 → …）。

### 1. 根因（日志实锤，非猜测）

宿主 MCP 日志（`codemaker-language-server/logs/20261104/180217-…-14536-0.log`）：
`Calling MCP tool: render…` → **正好 60.000s** 后 `self-heal triggered … -32001: Request
timed out` → `Restarting MCP server (old pid=…)`。三连复现（20:45:35→46:35、20:48:50→49:50）。

- `enginePid` 每调都变 = **宿主重启了整个 MCP**，不是 worker swap（swap 只在 boot / dist 变更时发生）
- 触发者是「插件 socket 在、sandbox 假死」：`figma_execute` 发出去没有回程，`figma-console-mcp`
  连接层 60s 才抛错，正好撞宿主阈值 → 重启 → 插件来不及重连 → 下一次 render 立刻 `Cannot connect`
- 引擎侧三道防线全缺：探活默认关、`client.callTool` 无客户端超时、`describeBridgeFailure` 对
  「端口对、无回程」直接 `return undefined`（一句诊断都不给）

### 2. 修复

- **活链判定**：`healthCheck` 记 `pluginConnected` / `lastRoundtripMs`；`Cannot connect`（没有插件客户端）与超时（socket 在、sandbox 不回话）分开归因
- **渲染探活默认开**：`GISOP_PREFLIGHT !== '0'`；失败仍走 5×3s 重试吸收切文件抖动，最终返回 `V2_BRIDGE_DOWN`
- **客户端侧 exec 上限**：`execBudget = 插件 timeout + 5s`（`GISOP_EXEC_TIMEOUT_MS` 覆盖），超时抛 `V2_BRIDGE_NO_REPLY`，message 带端口 + worker/supervisor pid + 重开插件指引；超时后的 rejection 挂空 catch，不污染 worker
- **诊断第三态**：`describeBridgeFailure` 端口正确但无回程时输出「桥在 9223 监听、没有插件回话」+ pid，不再返回空
- **返回体 `bridge` 快照**（create / sync 都有）：`port / preferredPort / fallback / holderPid / pluginConnected / lastRoundtripMs / enginePid / supervisorPid`，定性顺序写进工具描述
- **worker boot 探活**：装配后探一次（8s 上限）记状态，失败只记 stderr、不退出；重连窗口交给 render 的探活重试（不阻塞启动）

### 3. 回归

- 新增 `tests/server/exec-timeout.spec.ts`（7 条：预算默认/覆盖/超时码/正常返回/三种探活归因）
- `tests/server/bridge-state.spec.ts` 第三态 + `describeNoReply`；`tests/v2/render-target-file.spec.ts` 改为「默认探活」并断言 `bridge` 快照
- 全量：80 files / 631 tests 通过（`--no-file-parallelism`）

### 4. 未完成（待真机）

- 假死机上复现 `V2_BRIDGE_NO_REPLY` 且宿主日志无 `self-heal triggered`（本机无假死现场）
- boot 探活失败不阻断启动的单测（`entry-boot` 目前只覆盖「不装后端」路径）

## 未发布（文档补充，无版本变更）— 2026-11-04

**新增排障路径：引擎 MCP 在 host 里「连接失败」≠ 插件/模板问题。** 现场：CodeMaker 里
`figma-interaction-doc-engine` 连接建立约 17s 后 `McpError -32000: Connection closed`，
工具列表里既没有 native 工具也没有代理的 `figma_*`。

根因（两层，均已复现）：

1. host 里同时配了独立的 `figma-console` MCP 条目，它常驻占用 bridge 首选端口 9223；
   引擎内置的 `figma-console-mcp` 只能退到 9224 → worker 自检判「renders will fail」→
   关子进程重拉，3 次都退到 9224 → `fatal` → 进程退出 → host 报连接失败。该实例父进程
   还活着，**不属于孤儿，自动回收不会杀它**。禁用独立条目后实测 `port 9223` +
   `proxy: 134` + `supervisor ready — 140 tool(s)` 正常。
2. 本机 `PATH` 无 `C:\Program Files\nodejs` 时，worker 的 `spawn npx` 直接 ENOENT
   （`cross-spawn` 找不到 `npx.cmd`）；host 有「首次 ENOENT 刷新 PATH 重试」兜底，裸
   shell 没有。

文档：`packages/figma-mcp-server/docs/INSTALL.md` 新增「引擎 MCP 在 host 里连接失败」
（症状表 / 17s 的由来 / 手动跑 stderr 的 30 秒定位 / 两条 stderr → 修法映射 / 谁占着
9223 的判定命令）；`packages/skill/phases/phase4-figma.md` 排查顺序加第 0 步「先确认引擎
工具在不在」；`packages/skill/SKILL.md`「Figma 连接失败」加同款分层判定。


## v2.4.1（skill）/ 0.4.2（引擎）— 2026-11-04

**0.4.1 验收不通过的 B 项（唯一阻断）+ P1/P2/P3 收尾。** 现场：M1/M2/M3，enginePid 11968。

### 1. B（P0）adopt 同步真跑抛 `V2_RECONCILE_SCRATCH_MISMATCH`

根因：`dryRun` 不跑 scratch，真跑才跑；而 adopt（无模板包）时 parts scratch 必然渲染不出来 → 计划通过、真跑炸。修法：

- `planReconcile` 新增 `canCreate`：parts + 无包时置 false。需要新建节点的路径改记 `conflicts[kind=needs-new-node]`，并报 `V2_W_RECONCILE_NO_CREATE`；文字/标号/配图照常写入 → dryRun 与真跑结论一致，二跑 `changes: []`
- `V2_RECONCILE_SCRATCH_MISMATCH` 消息改为带定位：涉及的章节（`01「战斗界面」`）、是否缺包、槽位差异明细
- 重复标记（外部脚本克隆）改成「按结构选赢家」：章节须在章节层、簇须在所属章节、条目须在所属簇；被拖进别的章节的副本不再顶替原位那份
- 标号清理顺序上一版已改「先补齐、后清理」，这版补测试

### 2. D（P1）同步返回体缺 `bubbles`

`reconcile` 成功返回 SHALL 从画布逐章读标号（新增 `readBadges`），列出 `{section, cluster, nodeId}`；数量与簇数不符报 `V2_W_BADGE_COUNT_MISMATCH`（点名缺号）；`badgeSlot=none` 不告警。`dryRun` 也给（读到的是现状）。

### 3. C（P2）旧文案与 pack 噪音

- 旧 `V2_TARGET_FILE_UNREACHABLE + 回落到 legacy` 只存在于旧 dist：源码里只剩注释。为了下次能一眼判定，返回体新增 `engineVersion`（与 `get_skill_requirements` 同源，单一来源 `v2/version.ts`）
- 同步模式不再返回 `packMissing` / `packCandidates`（命中时仍回显 `pack`）；库引用模式上一版已去掉

### 4. P3 观察项

- `V2_W_BADGE_ANCHOR_DEFAULTED` 在同步/adopt 下的文案改为「本次未重排标号」，不再说「按网格摆放」。create 仍是原来的网格文案
- `V2_W_FIGURE_IMAGE_LOST`：确认新插入的空槽标记里没有 `imageHash`，下次同步不会再被判「原本有图」，只告警一次

### 5. 回归

- 新增 `tests/v2/reconcile-scratch-parts.spec.ts`（5 条：降级 / dryRun 一致 / 幂等 / 有包不降级 / 重复标记取舍）
- 新增 `tests/v2/sync-bubbles-manifest.spec.ts`（6 条：清单 / 缺号 / 母版不计 / dryRun / badgeSlot=none / engineVersion）
- 全量：79 files / 621 tests 通过（`--no-file-parallelism`）

### 6. 真机验收（2026-11-04，enginePid 40712）

验收方结论：B（P0）+ P1/P2/P3 全部通过，无新增缺陷，同意按 `0.4.2` / `2.4.1` 归档推送。

| 项 | 观测 |
|---|---|
| B-M1 真跑 `knfkg9iz` | ok:true、无 `SCRATCH_MISMATCH`；5 条 `needs-new-node`（`02/1/#3`、`02/2/#6`、`02/2/#12`、`02/5/#5`、`04/1/#3`）+ `V2_W_RECONCILE_NO_CREATE` 降级；画布 949→949、标号 18→18、preserved 全在 |
| dryRun 一致性 `y4yalzov` | changes `[]`，conflicts 7 条与真跑逐 path / kind 相同 |
| 幂等 `lp1aor57`；M2 `72g666bt`→`9nr3vchu` | 二跑 `changes: []` |
| P1 | reconcile 返回 `bubbles`：M1 18 / M2 9 / M3 16，40/40 nodeId 画布复核一致，无 `BADGE_COUNT_MISMATCH` |
| P2 | 旧文案单路径；5 次同步均无 `packMissing` |
| P3 | 锚点文案逐字命中；`02/2/#12` 三次同步无二次 `FIGURE_IMAGE_LOST` |

遗留（不阻断）：M1 上述 5 处待模板包配回后重跑补齐；验收机 git/npm 不在 PATH（环境问题，构建走绝对路径）。

## v2.4.0（skill）/ 0.4.1（引擎）— 2026-11-03

**按《引擎与 Skill 问题回执-20261103》修 E1–E7 / S1–S5。** 目标文档：`kiroro主串联`（M1/M2/M3）。

### 引擎

| 项 | 修法 |
|---|---|
| E4 标号锚点 | `badgeAnchors` 新增文本形式 `{text, offset?, occurrence?}`：摆放前扫主图子树按 TEXT 匹配、读 bbox 换算，主图换成实例也成立。整表不传且簇数 > 0 → `V2_W_BADGE_ANCHOR_DEFAULTED`（不再静默）。找不到 → `V2_W_BADGE_ANCHOR_TEXT_NOT_FOUND`；同名多个 → `V2_W_BADGE_ANCHOR_TEXT_AMBIGUOUS` |
| E3 同步锁死 | `forceReconcile: true` 显式 adopt；pack 缺失 + `template.componentKey` 为隐式 adopt。指纹变化时按当前包同步并在成功后**重打指纹**；两种情况都报 `V2_W_PACK_ADOPTED`。`V2_PACK_MISMATCH` 文案指出两条出路 |
| E1 模板通路 | `template.fileKey/nodeId` 真实生效：跨文件时先探模板文件，分别报 `V2_TEMPLATE_FILE_UNREACHABLE`（没连 Bridge）/ `V2_TEMPLATE_OTHER_FILE`（连上了但跨文件）；只给 `template.fileKey` 时按模板文件定向写入并报 `V2_W_TARGET_FROM_TEMPLATE`。不再回落「在目标文件里找 1:14」 |
| E2 pack 噪音 | 库引用模式不返回 `packMissing` / `packCandidates`，残留坏 pack 也不再挡渲染；缺包报错附 pack schema 位置 |
| E5 气泡丢失 | 返回体新增 `bubbles`（逐章 `section/cluster/nodeId`）；摆放后重读容器核对数量，不符报 `V2_W_BADGE_COUNT_MISMATCH`；标号改「先补齐、后清理」，克隆中断不再清空整章 |
| E6 写超时 | 渲染/同步返回 `runId`；写超时后返回 `sideEffects`（已落的 changes / 回滚未确认的根帧）+ `V2_W_WRITE_TIMEOUT_RECONCILED` |
| E7 簇配图 | `assetMap` 支持 byTitle 键 `"NN/C/<配图描述>"`；返回体新增 `figureSlots`（path / 描述 / nodeId）作为映射底表 |
| S4 门禁 | 新增 `validate_phase1_signoff` 工具 + `phase1Signoff` 入参（四项规则机器可校验）；传了不合格硬拒绝，不传只软提醒 |

### Skill

- `phase4-figma.md`：模板寻址优先级表 + **模板排查表**（`V2_TEMPLATE_FILE_UNREACHABLE` / `V2_TEMPLATE_OTHER_FILE` / `packCandidates` 三态各怎么修），写明「`componentKey` 是跨文件唯一可靠方式」
- `phase1-analysis.md`：完成声明落盘 + 校验（Phase 2 硬门禁）；**逐帧截图核对**条款（需求来自 Figma/截图时）
- `phase2-markdown.md`：进入条件改为「`validate_phase1_signoff → ok:true`」，不再是自述
- `phase3-asset.md`：标号锚点首选文本形式；配图编键优先 byTitle
- `phase4-figma.md`：新增「定点修补（同步走不通时的安全流程）」；配图审计里的标号核对升级为硬规则（条数 / 对位 / 堆叠 / 越界，逐章截图）；收尾断言加第 9/10 条（标号齐、锚点已生效）

### 回归

- 新增 5 个 spec 文件：`badge-anchor-text` / `reconcile-adopt` / `render-template-ref` / `phase1-signoff` / `render-manifest`
- 全量：77 files / 609 tests 通过（串行跑法见 README「Development」）

---

## v2.3.4（skill）— 2026-11-03

**把联调期踩过的坑写进 skill，避免下次再犯。** 来源：主串联 M1/M2 交付 + 引擎 0.3.2→0.3.9 联调。

### 1. 新增 `references/anti-patterns.md`

8 条反模式，每条按「症状 / 怎么撞上 / 正确做法 / 自检问题」写：

| 编号 | 反模式 |
|---|---|
| AP-1 | 手写 markdown 传参，不读磁盘原文（→ 同步误删条目、连带丢配图） |
| AP-2 | 把推测当结论报给引擎（→ 对方按错方向改一版） |
| AP-3 | 用正式稿做破坏性验证（→ 图丢掉要手工补） |
| AP-4 | 手工摆 GROUP 子节点按局部坐标算（→ 图飞到章节顶部） |
| AP-5 | 低分辨率裁图硬填宽槽（→ 马赛克返工） |
| AP-6 | 改错配置文件想切模板包（`~/.game-interaction-sop/template.json` 不在解析链里） |
| AP-7 | 端口 / 多进程问题靠反复重开插件（应查 `enginePid` / `otherInstances`） |
| AP-8 | 结论不落实测数据（附 8 条可复用断言脚本） |

### 2. `SKILL.md` 全局原则新增「交付纪律」

三条硬纪律：**md 单一来源** / **实测优先于推断** / **破坏性验证只碰沙盒**；文件索引加 `references/anti-patterns.md`。

### 3. `phases/phase4-figma.md` 增加「收尾断言」

完成条件从「引擎返回成功」改为「**收尾断言全部通过** + 配图审计 + 用户验收」。新增 8 条断言（槽数一致 / 槽位无偏移 / 占位组高自洽 / 图槽健康 / 左列 HUG 且高=标题+主图 / 行顶对齐 / 同步幂等 / 测的是新 build）与可直接复用的判定脚本，并写明「GROUP 子节点坐标在父级坐标系，别用局部 x/y 判偏移」这类口径。

---

## v2.5.0 — 2026-11-03

**实现 `roleAnnotation: 'inline-suffix'`：职能拼在正文句尾并上色（蛋仔包投产解锁）。** 引擎 `0.3.9` → `0.4.0`。

### 1. 拼装规则

蛋仔这类模板没有「职能标记」组件位，职能是跟在条目后面的 `@GUI @程序`，且在 Figma 里带色。

- 新增 `v2/role-suffix.ts`：把簇的职能拼到**第一条普通正文**句尾；跳过配图条目（`配图：…`）与 `@职能` 条目；一簇没有正文时不动任何条目
- 渲染（parts）填充前拼装，写完由既有 `paintRoleTokens` 按 `ROLE_COLORS` 补色（写 `characters` 会冲掉原稿字符样式）
- 移除 0.3.7 起发的 `V2_W_ROLE_ANNOTATION_UNSUPPORTED`（能力已实现）

### 2. 同步同口径

渲染写入的是带后缀的文本，计划侧必须按同一份比对，否则每次同步都以为条目被改过：

- `expectedItems` 新增 `inlineRoles`，首条普通正文带后缀
- `planReconcile` 从模板包 `capabilities.roleAnnotation` 取开关

### 3. 测试与版本

- `tests/v2/role-inline-suffix.spec.ts` 重写（6 条）：拼装跳过规则 / 渲染后首条带后缀且 `@GUI` 区间有颜色 / component-variant 不拼 / 同步口径开与关
- 72 files / 577 tests 全绿
- 引擎 `0.3.9` → `0.4.0`

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
