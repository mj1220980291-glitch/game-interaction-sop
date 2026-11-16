## 0. 引导链审计（P0，2026-11-12 新增）

- [x] 0.5 deeper focused：先补 D7/spec，verify 阶段/绑定文件/key 诊断、实例失败清理与 stale 分类回归；tsc + 全量串行 87/721 通过
- [x] 0.6 加载本轮新构建后单次沙盒 verify 留具体 stage/file/key；pack/render 已验收
  - 2026-11-16：verify 全过（`write:false`，3.72s）；pack `\.interaction-sop/template.json` 命中 origin=cwd、deep 4 key ok；渲染 `187:2759` 两次同步零变更零冲突（详见 8.23 / 8.26）

- [x] 0.1 README：模板段落重写 —— 仓库自带基线包、零配置可渲染；自己模板走 compile→发布→verify
- [x] 0.2 README：Quick start 补 `npm run install-mcp` 生成配置片段
- [x] 0.3 `docs/onboarding.md`：新增第 0 步「你会拿到什么」+ 零配置说明 + 自备/借用模板路径
- [x] 0.4 `docs/onboarding.md`：补三个坑（禁用条目占 9223 / 跨文件 import 要关开库 / `@职能` 写法）

## 1. 安装入口（P0，已做）

- [x] 1.1 `scripts/install-mcp.mjs`：`command` 一律输出 `process.execPath`（codemaker 表格 / codex TOML / JSON 片段 / default 提示四处）
- [x] 1.2 `SETUP.md`：Command 字段改成「node 绝对路径」并解释 `spawn ENOENT` 的现场
- [ ] 1.3 真机：在 **PATH 里没有 node** 的机器上按片段配置，确认宿主能连上（本机验证时需临时改回 `node` 复现一次对照组）

## 2. 两套基线包（P0，依赖 Figma）

- [x] 2.1 `captureGeometryFromKeys` 透传 `sectionSourceId` / `sourceRootId` / `badgeSourceId`；缺原稿 id 时写 `gaps`（2026-11-11，引擎 0.4.9）
- [x] 2.2 官方 1.14 的 4 个缺值 —— **决策变更（2026-11-11）**：逐层比对后确认 1.14 原稿的 `docPadding` / `rootGap` / `footerGap` 本来就是 0；`placeholder` / `bubbleGrid` 明确不采（占位灰用默认值；标号位置属每篇文档的 `badgeAnchors`）。理由与采集口径落在 `pack-doc-geometry-and-roleblock`（已归档）与 `template-contract.md`
- [x] 2.3 蛋仔派对重编：**不需要重编**——库内组件仍在，按 key 直接生成 `assets/packs/蛋仔派对.json`（`110:74/86/114/119`），README 状态表已更新
- [x] 2.4 两套包 `audit_template_pack` findings 为空（或仅可接受项），`deep:true` 全 ok——蛋仔 4/4 key ok，仅 `sectionShell` 缺（蛋仔黑边在文档根，属预期）
- [x] 2.5 单测：`deep` 缺 key 时不崩、`gaps` 里有「缺原稿章节 id」的话术

## 3. 已知限制与文档（P1）

- [x] 3.1 `template-contract.md`：写明「左列只到标题+主图高，剩余是卡片底色」（新增「三·六、章节几何」）
- [x] 3.2 `phase4-figma.md`：`badgeAnchors` 未传时的处理口径（只补表、不动版面；两处都改了）
- [x] 3.3 `INSTALL.md`：新增「看起来像 bug、其实是设计」表（左列 HUG / 标号网格 / 10s 抖动）
- [x] 3.4 新增 `docs/onboarding.md`（一页）：四步接入 + 三个已知限制 + demo 位置 + 模板包与卡点分流

## 4. 许可证（P1）

- [ ] 4.1 根目录 `LICENSE`（MIT，署名与年份按团队要求）
- [ ] 4.2 `THIRD-PARTY-NOTICE.md`：`figma-console-mcp` 1.23.0（MIT）+ 来源链接
- [ ] 4.3 README 顶部加一段「第三方组件与许可」

## 5. 分享前自查（P1）

- [x] 5.1 仓库里没有个人 token / 私有路径（`mcps.json` 示例、回执、`~/.game-interaction-sop` 样例）——清掉 4 处个人路径，无 `figd_` / `.env`
- [x] 5.2 两套基线包不含私有库 key（若含，替换成公开模板库或标注「内部库，需自备」）——`default.json` 是公司内 1.14 库 key，已在 `assets/packs/README.md` 与 `docs/onboarding.md` 标注
- [ ] 5.3 `docs/tutorial/`、`docs/architecture/` 若作为分享材料，先提交并校对

## 6. 试点验收（P1）

- [ ] 6.1 找一位没用过本 SOP 的设计同学，按 `docs/onboarding.md` 独立走一遍，中途不提问
- [ ] 6.2 记录卡点（每条：在哪一步、卡了多久、文档哪句没说清），回写文档
- [ ] 6.3 试点产物：`ok:true` + 无 `V2_BRIDGE_DOWN` / `CONTRAST_LOW`（正常配置下）
- [ ] 6.4 **可重复沙盒跑通并留基线报告**（`docs/pilot/reports/`，见 change `add-newuser-sandbox`）

## 7. 回归

- [ ] 7.1 `npx tsc -p tsconfig.json` + `npx vitest run --no-file-parallelism` 全绿
- [ ] 7.2 `node scripts/install-mcp.mjs --agent <all five>` 输出检查（脚本化 grep `command`）
- [ ] 7.3 CHANGELOG + `openspec/HANDOFF.md` 同步
- [ ] 7.4 **每次改动后重跑 `npm run sandbox:newuser`，与基线报告 diff（status / firstError 必须一致）**

## 8. 外部团队双路径接入（P1，2026-11-12 16:17 更新，用户已确认）

目标：同时支持「正规模板接入」与「旧交互文档转干净模板」。后者是必做功能，不因拿到正规模板取消；仅推荐 nodeId、改名或干跑通过不算交付。

### 8A. 样本、识别与契约

- [x] 8.1 取得燕云旧正式稿：库 `jQf7zj33pzOGsGKO4d73OO` / `_staging` `3:10` / 根 `173:15842`；已结合结构与截图自主识别候选
- [x] 8.2 记录首轮失败及纠正：整稿探针截断、隐藏 `活动1` 误选；`cell_comment` 实为合法说明簇；默认 slot-run 导致缺 #Title，显式 none 后入口检查通过，不代表编译/渲染通过
- [x] 8.3 取得正规燕云模板的 fileKey + 根节点，局部扫描与截图对照旧正式稿；记录共同骨架与合法风格差异，不要求旧稿复制正规模板的外观
  - 正规模板 `176:48625`；章节外壳 `176:48717`，说明簇 `176:48724`。正规模板黄方编号/1775 宽竖排簇，旧稿红定位编号/1974 宽嵌套簇，差异记录在 design D0。
- [x] 8.4 补齐本 change 的设计/规格：抽取范围、槽位映射、能力证据、清洗规则、歧义确认、写入与清理边界及验收场景；引擎改动前完成，不预定工具名称
  - proposal 范围、design D0、engine-mcp-server delta 已补；尚未完成 OpenSpec validate。

### 8B. 旧正式稿 → 干净模板（必做）

> 2026-11-16 拆分：8.5–8.10（识别/隔离提取/清洗/编译/固化）与 8.27（章节示例簇）已迁到 `openspec/changes/add-legacy-template-cleaning/`。本文件保留历史勾选与证据索引，不再在此追加实现任务。

- [ ] 8.5 AI 综合命名、层级、重复结构、截图判断部件；输出候选、依据、歧义与能力来源；只在无法判定时请用户确认，不要求用户先手工挑一章一簇
- [ ] 8.6 在隔离副本抽取最小样板：保留章节外壳/圆角/底色/内边距、标题与状态标题关系、布局、编号与职能样式；原稿不变
- [ ] 8.7 清洗具体需求、旧主图/配图、个人信息、审核记录和无关历史内容，替换为占位；保留有用途的隐藏样式母版，记录每项保留/替换/移除依据
- [ ] 8.8 整体 + 可读底色局部截图验收；独立部件与整篇预览分区，不把重复样板当文档内容
  - 现有实验区 `176:48948` **未通过**：标题落在内容下方、章节外壳丢失、残留业务信息、章节与独立簇重复；副本 staged `176:48949/176:48972/176:49046/176:49048/176:49085` 仅供排查，未编译/未发布
- [ ] 8.9 显式确认能力后干跑，再真编译验证嵌套正文、配图结构与职能变体；失败清理本轮半成品，不动原稿和用户资产
  - [x] 8.9a 先补设计/delta，再修完整卡片槽位识别及外壳/标题/状态/舞台/气泡保留；旧直接两列与外置标题兼容；新增插件脚本回归 5 场景，tsc 与相关 4 文件/41 测试通过
  - [ ] 8.9b Figma 完整卡片及正规模板实测、发布/跨文件导入/渲染（本轮不操作 Figma）；全量串行已跑，4 个 reconcile 用例 V2_PACK_MISMATCH 待隔离归因
  - [x] 8.9c 用户选择保留燕云嵌套 none 簇；先补 design/delta，再复用正文宿主内顺序构建，覆盖无图/多正文/GUI、程序、拼接/图文交错/长文/容器保护/多宿主拒绝/缺变体；不改已通过章节，不操作 Figma，不用 caps none 降级
  - [x] 8.9d parts 职能实例纳入深度优先条目清单、正文与 role 打标；同稿两次规划 changes/conflicts 为空，改单条职能正文仅一条更新；旧未打职能标记 parts 同步兼容。新增 10 测试，tsc 通过，全量串行 87 文件 / 701 测试通过（35.42s）
  - [ ] 8.9e 重启加载新构建；主代理补运行期职能组件（标签 TEXT + 独立正文 TEXT，variantKeys=GUI/程序/拼接）后，发布/独立沙盒导入/2章3簇长文视觉/两次真实同步及局部更新验收。本轮自动测试仅验证渲染、打标与同步规划，未替代真机
  - 2026-11-16 真机进度：pack 落 `.interaction-sop/template.json`（origin=cwd，deep 4 key ok，roleBlock=GUI/程序/拼接 keys）；`phase=verify` write:false 全过（3.72s）；渲染 root `182:625`（2 章 3 簇、3 气泡、图 1 张+占位 1）；同步两次 `changes: []`；改单条正文只出 1 处 update。**视觉未过**：每簇残留 3 条模板职能实例且未被隐藏，同步因此固定 9 条 conflicts → 见 8.24
- [ ] 8.10 将已验证流程固化为可重复的正式稿清洗功能，补相应自动化测试与操作说明；只读候选推荐不能替代清洗功能

### 8D. deeper focused 共享桥证据（2026-11-13）

- [x] 8.15 先补 D6/delta/正式 spec；核对 worker→console 父链与内部沙盒只读 probe，排除已证实的 client 隔离，定位启动桥缓存未刷新
- [x] 8.16 最小修复成功 execute 刷新状态、脚本错误不误判断桥、MCP 错误 envelope 与严格 healthCheck；新增 7 回归，同 client 外部/内部及双文件并发定向覆盖
- [x] 8.17 tsc + 全量串行 87 文件 / 714 测试通过（38.96s），同步 CHANGELOG/HANDOFF/诊断回执；版本不变，无 Figma 写入/配置改动/commit/push
- [ ] 8.18 现有进程加载新构建后，双文件内部只读 probe + bridge=true/checkedAt 更新实测；需一次用户引擎重启，未确认自动重载
- [ ] 8.19 主代理独立沙盒 verify 一次；如仍导入失败，查组件导入/库网络状态并留证，不能把脚本错误或启动缓存当桥断连。随后按 8.12–8.14 验端到端

### 8E. verify 可观测性与桥级短路（2026-11-16，只读复核后）

- [x] 8.20 只读复核上一轮结论：确认「整服务被替换、非本地动作、dispatch 不等就绪」；推翻「每部件 ~16s 等回连」，把「宿主 60s self-heal」降级为未证实；留证据于报告 JSON `lifecycleDiagnosis20261116`
- [x] 8.21 先补 D9 + delta + 本任务：冒烟逐部件明细、`errorKind` 分类、桥级短路、`verify.bridge` 有界探活、worker lifecycle 留痕
- [x] 8.22 实现 8.21 五项并补单测；`npx tsc -p tsconfig.json` + `npx vitest run --no-file-parallelism` 全绿（87 文件 / 734 测试，37.34s）
- [x] 8.23 真机：用户重启 MCP 加载新构建（supervisor 32572 / worker 19624，lifecycle 出现 boot 记录）；两文件重开插件后 `verify` 一次通过（`write:false`，四原子 import + geometry + spacing 全过，gaps/diffs 空，宿主 cost 3.72s）。插件上报仍是 1.39.0（Figma 加载缓存），需另查缓存路径

- [x] 8.24 未标注的模板原生职能实例要在产物里隐藏/移除（`parts/index.ts:813-817` component-variant 分支只有注释）
  - [x] 8.24a 只读比三个模板母版：官方 1.14 是空 FRAME、蛋仔无职能节点、燕云三个可见 INSTANCE；补 D10 + delta（按 `roles` 取舍、隐藏不删除、纯容器不动、正文以 md 为准）
  - [x] 8.24b 实现 + 回归（未标注角色不可见、标注角色可见且正文空、纯容器不动、隐藏失败只警告），tsc + 全量串行 87 文件 / 736 测试通过（新增 2 条）
  - [x] 8.24c 重启加载后重渲染（旧 `182:625` 留作缺陷对照）：`185:1278` 视觉正确但首轮同步 3 个 delete 把标注角色行藏掉 → 由 8.25 修复、8.26 复验通过（`187:2759`）
  - [x] 8.25 reconcile 侧把簇级 `roles` 当多余 item：真机对照 `185:1931` 的载体 stamp（GUI/程序/拼接 均带 `role`，未标注的空 stamp）后定位到 `plan.ts` 的条目序列——parts 且 md 无职能子弹时把 role 条目从序列剔除，职能仍由 `stamp.roles`/`roleOps` 对账；tsc + 全量串行 87 文件 / 737 测试，相关 4 文件 43 测试通过
  - [x] 8.26 重启加载后重渲染验证（`187:2759`）：新建视觉只留标注角色（01/1 只 GUI、01/2 无、02/1 程序+拼接）；同步两次均 `changes: [] / conflicts: []`；改单条正文只 1 处 update、冲突 0；两章 状态说明按 foreign 保留
  - [ ] 8.27 章节母版自带示例簇仍随章出现（①簇标题 + 正文占位 + 程序/GUI/CCS 三行 + 配图占位），属 8.8 已记的「章节与独立簇重复」→ **已迁至 `add-legacy-template-cleaning` 任务 5**

### 8C. 正规模板与清洗结果共用下游，各留证据

- [ ] 8.11 正规模板独立完成部件/能力确认、体检与编译；不能把正式稿的能力判断直接套用
- [ ] 8.12 两条路径分别人工发布，在独立沙盒 `phase=verify` 验真实 import 并回填 key / 几何 / 文档留白；不在库文件自证
- [ ] 8.13 分别 `audit_template_pack(deep)` + 最小 2 章/3 簇样例渲染，覆盖正文、合法职能条目、配图、长短内容；模板包、截图、回执落盘，差异有说明
- [ ] 8.14 连续同步两次应无变更，再改单条正文验局部更新；回归既有包与新用户沙盒，与基线比较；之后进入 6.1–6.3 真人独立试点
