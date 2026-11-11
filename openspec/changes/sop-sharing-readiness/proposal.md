## Why

SOP 要交给其他设计团队使用。复盘近两周的现场（变色龙项目 9–13 节回执、换机器丢包、`spawn ENOENT` 排查）后，结论是：**引擎本身够用了，卡点在「别人装不起来 / 装起来不像」**。

已定的验收基线：引擎 `0.4.7` 起（0.4.8 加重试退避）。当前版本 `0.4.8`、skill `2.5.1`。

三个必须解释清楚的事实：

1. `scripts/install-mcp.mjs` 原先输出 `"command": "node"` —— 目标机器 PATH 里没有 node 时，宿主连 MCP 进程都拉不起来，表现是「MCP 面板一直连不上」，日志只有 `spawn ENOENT`（我们自己的验收机就是这种，排查了一整晚）
2. 引擎自带基线模板包只有官方 1.14（`assets/packs/default.json`），**蛋仔包不存在**。蛋仔团队首次渲染会命中官方基线：不报错、只「长得不对」，比报错更难查
3. 官方基线包缺 `placeholder` / `bubbleGrid` / `docPadding` / `footerGap` 四个原值（历史未留档），观感与原稿有差，会被当成 bug 报回来

## What Changes

- **安装入口改成绝对路径**：`scripts/install-mcp.mjs` 输出的 `command` 一律为 `process.execPath`；`SETUP.md` 表格同步改成「node 绝对路径」，并写明为什么
- **两套基线模板包按 `compile → verify` 重编**：官方 1.14 补齐 4 个 geometry 字段；蛋仔派对新建 `assets/packs/蛋仔派对.json`；入库前用 `audit_template_pack` 体检
- **`captureGeometryFromKeys` 透传 `sectionSourceId` / `sourceRootId` / `badgeSourceId`**：让「库已发布 → 只生成 pack」这条路也能采到章节外框，别的团队不必整轮 compile
- **写一页「新团队接入」**：30 分钟走通（装 → 配 MCP → 起插件 → 渲染 demo），并列出 3 条已知限制（左列 HUG、badgeAnchors 手工补表、10s 抖动会自动重试）
- **补 LICENSE / NOTICE**：`vendor/figma-console-mcp-1.23.0.tgz` 是 MIT，内部分享也要标来源
- **试点验收**：找一个没用过 SOP 的设计同学，按接入文档独立走一遍（中途不提问）

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `engine-mcp-server`: 安装片段 SHALL 使用 node 绝对路径
- `template-contract`: 基线包内容要求（两套、含完整 geometry）

## Impact

- `scripts/install-mcp.mjs`（已改）、`SETUP.md`（已改）
- `packages/figma-mcp-server/assets/packs/`（需重编产出，依赖 Figma）
- `packages/figma-mcp-server/src/v2/compile/geometry.ts`（透传参数）
- `packages/figma-mcp-server/docs/INSTALL.md`、`packages/skill/references/template-contract.md`（已知限制）
- 根目录 `LICENSE` / `THIRD-PARTY-NOTICE.md`（新增）
- **不在范围**：模板包切换 UX（另行立项）、`suggest_badge_anchors`（另行立项）
