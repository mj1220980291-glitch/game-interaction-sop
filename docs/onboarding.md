# 新团队接入（30 分钟）

目标：从一个干净的环境，走到「AI 把一份 Markdown 渲染成 Figma 交互文档」。
共五步，每步都有验证点；任一步没过就**别往下走**，后面的失败都会被前一步的问题掩盖。

## 0. 你会拿到什么（先看这一节）

拿到仓库链接后，拉下来看到的是：

| 目录 / 文件 | 是什么 |
|---|---|
| `packages/figma-mcp-server/` | 引擎（MCP Server），要编译 |
| `packages/skill/` | 给 AI 用的 SOP 文档包（Phase 0–6） |
| `packages/figma-mcp-server/assets/packs/` | **自带的两份模板包**（官方 1.14、蛋仔派对） |
| `vendor/` | 内置的 Figma 运行时，不用单独装 |
| `README.md` / `SETUP.md` / `docs/` | 入口、逐步配置、图文说明书 |

**关键一点：模板不需要你准备。** 仓库自带基线包，装完引擎就能渲染；想用自己团队的模板，
见本文最后一节「用自己的模板」。

| 步 | 做什么 | 预计 | 验证点 |
|---|---|---|---|
| 1 | 装依赖 + 编译引擎 | 5–10 min | `dist/server/index.js` 存在 |
| 2 | 配 MCP（只配一个） | 3 min | agent 的工具列表里出现 `render_v2_markdown_to_figma` |
| 3 | Figma 里起连接插件 | 3 min | 渲染返回 `ok:true` 且 `bridge.pluginConnected === true` |
| 4 | 渲染 demo | 5 min | 画布上出现一份完整文档 |
| 5 | 换成自己团队的模板（可选） | 10–30 min | `audit_template_pack` 对你的包 `findings: []` |

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

## 三个「不是 bug、但会卡住你」的坑

| 现象 | 原因 | 怎么办 |
|---|---|---|
| MCP 面板显示已连接，但每次渲染都 `Cannot connect` | host 里还留了一条**独立的 `figma-console`** MCP 条目（可能已被置灰/禁用，但进程仍在），它占着 9223，引擎只能退到 9224，插件连的是另一个 | 删掉那条独立条目（不是禁用，是删除），再跑 `node scripts/cleanup-orphan-mcp.mjs --force` 清残留进程 |
| 跨文件渲染/实例化卡 30 秒后超时 | Figma 对「另一个文件里的库」有缓存，换了桥或库重发后会失效 | 在**渲染目标文件**里 `Assets → Libraries`，把用到的库关掉再打开一次 |
| 文档里写了 `@GUI` 但没变成彩色标签 | 职能标签只认 `- @GUI：文本` 这种**条目**写法；独立一行 `@GUI` 只是普通文字 | 改成 `- @GUI：这条规则的内容`，或干脆不写（模板的 `roleAnnotation` 决定要不要） |

## 用自己的模板（可选）

先确认一件事：**仓库自带的基线包能不能用？**
- 能（观感和官方 1.14 / 蛋仔接近）→ 什么都不用做，直接渲染
- 不能（你们有自己的模板）→ 不要手写模板包，走下面这条链

```
figma_compile_template(phase=compile)   # 把源模板的部件编译进我们库的 _staging 页
  → 在 Figma 里人工发布（Figma 没有发布 API，只能点一次）
  → figma_compile_template(phase=verify)  # 回填 4 个 key + 几何 + 文档级留白
  → 落 assets/packs/<项目>.json（或 <项目>/.interaction-sop/template.json）
```

两个硬门槛，提前知道能省很多时间：

1. **模板必须满足六条铁律**（章节/簇可克隆、簇内有编号+标题+内容行）。很多团队的模板是「画好的一整张图」，章节和簇都是拍平的 GROUP、没有可克隆母版 —— 探针会直接判 `non-conformant`，这种要先改模板
2. **组件 key 绑定特定库**：基线包指向公司内「官方 1.14」库，团队外无效；你们要发布到自己的库

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

> 不知道自己该用哪份？直接渲染一次，返回体里有 `pack.path` 与 `pack.origin`，一眼就能看出命中的是仓库基线还是你自己的包。

## 卡住的分流

| 卡在哪 | 先看 |
|---|---|
| agent 里根本没有引擎工具 | `INSTALL.md`「引擎 MCP 在 host 里连接失败」——先确认进程活着，再排模板 |
| 工具在、渲染报 `V2_BRIDGE_DOWN` / `Cannot connect` | 插件没接入：开文件 → 起插件 → 保持窗口 |
| 渲染成功但长得不像 | `audit_template_pack`；再看 `V2_W_PACK_GEOMETRY_DEFAULTED` |
| 文档里字看不清 | `V2_W_TEXT_CONTRAST_LOW`：先查包的 geometry，再查模板本身是不是低对比设计 |

图文版（含截图）在 [`docs/tutorial/index.html`](./tutorial/index.html)。
