# 新团队接入（30 分钟）

目标：从一个干净的环境，走到「AI 把一份 Markdown 渲染成 Figma 交互文档」。
共四步，每步都有验证点；任一步没过就**别往下走**，后面的失败都会被前一步的问题掩盖。

| 步 | 做什么 | 预计 | 验证点 |
|---|---|---|---|
| 1 | 装依赖 + 编译引擎 | 5–10 min | `dist/server/index.js` 存在 |
| 2 | 配 MCP（只配一个） | 3 min | agent 的工具列表里出现 `render_v2_markdown_to_figma` |
| 3 | Figma 里起连接插件 | 3 min | 渲染返回 `ok:true` 且 `bridge.pluginConnected === true` |
| 4 | 渲染 demo | 5 min | 画布上出现一份完整文档 |

前置：Node ≥ 20、Figma 桌面端（或网页端 + 社区插件）、一个 Figma Access Token、一个支持 MCP 的 agent。

---

## 1. 装依赖 + 编译（5–10 min）

```bat
cd <仓库路径>\packages\figma-mcp-server
npm install
npm run build
```

**验证**：`packages\figma-mcp-server\dist\server\index.js` 出现。

> `npx`/`node` 不在 PATH 的机器上全部用绝对路径（`"C:\Program Files\nodejs\npm.cmd"`）。
> 这不是洁癖：宿主拉起 MCP 用的是**宿主的 PATH**，和 shell 的 PATH 不是一回事。

## 2. 配 MCP（3 min）

**只配一个 server：`figma-interaction-doc-engine`。** `figma-console-mcp` 由引擎自己拉起，
host 里再留一条独立的 `figma-console` 会抢 WebSocket 端口（9223），表现为「MCP 能连上但渲染永远失败」。

生成配置片段：

```bat
node scripts\install-mcp.mjs --agent codemaker
```

把输出原样贴进 agent（`--agent codex|cursor|cline|claude|codemaker` 各有对应格式）。
`command` 必须是 **node 的绝对路径**；写成 `node` 时目标机器 PATH 没有 node，宿主只报 `spawn ENOENT`，
面板表现是「一直在连」。

**验证**：重启 agent 后，工具列表里能看到 `render_v2_markdown_to_figma` 与一排 `figma_*`。

完整字段含义见 [`SETUP.md`](../SETUP.md) 步骤 2；连不上时的分层排查见
[`packages/figma-mcp-server/docs/INSTALL.md`](../packages/figma-mcp-server/docs/INSTALL.md)「引擎 MCP 在 host 里连接失败」。

## 3. 起 Figma 连接插件（3 min）

1. 打开 Figma 桌面端，打开**要写入的那份文件**
2. 起插件：优先社区插件 <https://www.figma.com/community/plugin/1695400514520991057>（网页端也能起）；起不来再回退本地 Desktop Bridge
3. **插件窗口保持开着**，渲染期间别关

**验证**：让 agent 调一次 `figma_get_status`，或直接看渲染返回体的 `bridge.pluginConnected`。
端口被占 / 假死的判定见 `INSTALL.md`「渲染一直失败且 `enginePid` 每次调用都变」。

## 4. 渲染 demo（5 min）

现成的示例文档：`packages/figma-mcp-server/tests/v2/fixtures/buzhong.md`（41 行，两章、带配图占位）。

- 走自然语言：把仓库里的 skill 装给 agent（`npm run install-skill -- --agent codemaker`），
  然后说「用这份 md 渲染到 Figma」——skill 会自己补 `assetMap` / `badgeAnchors` / `target`
- 走裸工具：直接调 `render_v2_markdown_to_figma({ markdown, target: { fileKey } })`

**验证**：返回 `ok:true`，`bubbles.length === summary.bubbleCount`，画布上文档完整。

---

## 三条已知限制（不是缺陷）

| 现象 | 真相 |
|---|---|
| 章节**左列**只有「标题 + 主图」那么高，下面一大片空白 | 左列纵向 HUG，空白是卡片底色。只有左列变 `FIXED` 或高度=章节高才是缺陷 |
| 标号整齐排在网格上，没贴控件 | 本次没传 `badgeAnchors`，会报 `V2_W_BADGE_ANCHOR_DEFAULTED`。补表后走同步重排，**不要手拖标号、不要改模板网格** |
| 偶尔一次渲染失败，再试就好 | figma-console 自己 10s 重连预算；渲染 0.4.8 起整轮重试 3 次、退避 3s / 9s（同步仍是 2 次 / 5s）。看到 `V2_W_RENDER_RETRIED` = 已重试成功，别重跑 |

## 模板包：先确认用的是哪份

模板包决定组件 key 与观感（底色 / 章节外壳 / 标号网格），查找顺序见
[`packages/skill/references/template-contract.md`](../packages/skill/references/template-contract.md)
第五节。渲染前先体检一次：

```
audit_template_pack            # 用的是哪份包、缺哪些观感字段
audit_template_pack deep:true  # 额外做 4 个 key 的 import 冒烟
```

引擎自带的 `assets/packs/default.json` 指向**公司内「官方 1.14」组件库**——库 key 对团队外无效。
用自己模板的团队要按 `assets/packs/README.md` 的 `compile → 发布 → verify` 流程编一份自己的包，
放进 `<项目>/.interaction-sop/template.json` 或 `~/.game-interaction-sop/templates/<项目名>.json`。
库重发布后旧 key 失效会报 `V2_TEMPLATE_KEY_STALE`，按提示重取，**不要手改 key**。

## 卡住的分流

| 卡在哪 | 先看 |
|---|---|
| agent 里根本没有引擎工具 | `INSTALL.md`「引擎 MCP 在 host 里连接失败」——先确认进程活着，再排模板 |
| 工具在、渲染报 `V2_BRIDGE_DOWN` / `Cannot connect` | 插件没接入：开文件 → 起插件 → 保持窗口 |
| 渲染成功但长得不像 | `audit_template_pack`；再看 `V2_W_PACK_GEOMETRY_DEFAULTED` |
| 文档里字看不清 | `V2_W_TEXT_CONTRAST_LOW`：先查包的 geometry，再查模板本身是不是低对比设计 |

图文版（含截图）在 [`docs/tutorial/index.html`](./tutorial/index.html)。
