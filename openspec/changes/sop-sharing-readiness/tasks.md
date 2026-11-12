## 0. 引导链审计（P0，2026-11-12 新增）

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

## 8. 借用外部团队模板（P1，2026-11-12 新增）

- [ ] 8.1 拿到对方模板的 Figma 链接（fileKey + 根节点 id），文件打开、插件连着
- [ ] 8.2 `figma_probe_template` 只读探针；`non-conformant` 则停下来要求对方改模板
- [ ] 8.3 `figma_compile_template(phase=compile)` 干跑 → 真跑（只读对方文件，部件落我们的 `_staging`）
- [ ] 8.4 人工在 Figma 发布库 → `phase=verify` 回填 key / 几何 / 文档级留白
- [ ] 8.5 `audit_template_pack(deep)` + 沙盒渲染一份样例；落 `assets/packs/<项目>.json`
