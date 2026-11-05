# Phase 4 — 写入 Figma

## 进入条件

Phase 2 完成（Markdown 已保存、`validate_phase1_signoff` 返回 ok）+ Phase 3 完成（设计稿决策已收集）。

## 完成条件

引擎返回成功，**收尾断言全部通过**（见下文「收尾断言」，含标号齐 / 锚点已生效），**逐章截图核对过标号**，**配图审计已跑完并报给用户**，用户在 Figma 看到结果，验收通过。

---

## 一句话主义

**所有 Figma 操作的细节（节点克隆 / TEXT 填充 / 角色 TEXT 删除 / 气泡定位 / GROUP-bbox 爆炸防护 / FRAME-local 坐标换算 / undo 栈风险等）都封装在 `figma-interaction-doc-engine` 工具里。本 skill 只负责调用 + 报告结果。**

不要在这里写"如何调 MCP move_node 才不会爆炸"之类的事。那是引擎代码的责任。

---

## 标准调用流程

### 第一步：读项目配置 + preflight

写 Figma 前先读三处项目配置，缺省即回退官方模板，不要阻塞：

1. `<项目根>/.interaction-sop/template.json`（项目模板包，含 4 个部件 key 与 8 项能力；格式见 `references/template-contract.md`）
2. `<项目根>/.interaction-sop/` 下本次生效的文风文件（按 `references/style-mod-schema.md` 的「文件选择顺序」确定，Phase 1 已选定）— 只为判断 `role_annotation.mode`
3. `<项目根>/.interaction-sop/anchors/<需求名>.json`（Phase 3 落盘的标号锚点，格式同 `badge_anchors`）— 存在就并入入参 `badgeAnchors`：本次 Phase 3 重新确认过的键覆盖它，没确认过的沿用，**不要每轮重新问**

**preflight（只用现有 Figma 只读工具，不写画布）**：

- **先跑探针**：`figma_probe_template({ nodeId: <模板根> })`，按结论处理：
  - `ready` → 继续（能力项可采信）
  - `needs-anchor` → 把 `gaps` 里 `inferred` / `default` 的项列给用户确认，确认后才渲染
  - `non-conformant` → 停下来，说清哪条铁律没过、缺什么；不改 Markdown 硬写
  - 报告里的 `capabilities` 决定 md 写法是否成立：`clusterGroups: none` 时 md 不能有 `####`；`overview: none` 时 md 不能有 `## 设计总览`。**冲突就报错，不要静默丢弃**
- **模板寻址：按这个优先级选，不要凭感觉试**（详见下方「模板排查表」）

  | 优先级 | 写法 | 适用 |
  |---|---|---|
  | 1（首选） | `template.componentKey` | 模板已发布到团队库。**跨文件唯一可靠方式**，目标文件不需要放模板 |
  | 2 | 模板包（`top`/`chapter`/`cluster` 三个 key 齐全） | 项目已按 `references/template-compile.md` 编译过 |
  | 3 | `template: {fileKey, nodeId}` | **仅同文件模式**：`fileKey` 必须等于 `target.fileKey`。跨文件必失败 |
  | 4 | 环境变量 / `~/.game-interaction-sop/template.json` / 官方默认 | 单机固定模板，不做多项目切换时 |

  - `componentKey` 从哪来：在团队库里找已发布的「交互文档模板」组件，或用 `figma_execute` 读 `figma.root` 所在库的已发布组件 key。**这是需要「跨文件」时的第一手动作，不要先去试 `fileKey/nodeId`**
  - 只给 `template.fileKey` 不给 `target.fileKey` 时，引擎会按模板文件定向写入并告警 `V2_W_TARGET_FROM_TEMPLATE`；要在别的文件落文档必须显式传 `target.fileKey`
  - 模板重编后 `verify` 会返回 `mdContract`；把它落盘到 `<项目根>/.interaction-sop/md-contract.md`。没有模板变更时用 `figma_compile_template({ phase: "contract", project })` 重新生成，不写画布
- Markdown 里有 `- @职能：` 条目时，确认角色块配置：
  - 跨库优先 `roleBlock.variantKeys`（角色 → 已发布变体 key）
  - 同文件才用 `roleBlock.componentSetId`（组件集在渲染目标文件内；跨库会报 `V2_ROLE_BLOCK_SET_NOT_IN_TARGET_FILE`）
  - 缺配置就明确告诉用户，不要先渲染再报错
- 用户在别的文件里做设计时，先让用户把连接插件切到目标文件
- **落点**：新文档默认落 `(0,0)`，会压在设计稿上。调用时给一个：
  - `position: { x, y }` — 用户指定位置（首选，人最清楚哪块是空的）
  - `autoPlace: "below" | "right"` — 按页面现有内容自动避让（需要 `target.pageId`）
  - 两者同给时以 `position` 为准，返回 `V2_W_POSITION_OVERRIDE`
- **返回要读 `pack`**：`pack.path` / `origin` 说明这次用了哪个模板包；库引用模式下**不应**出现 `packMissing`，出现了说明 `componentKey` 没传进来

### 模板排查表（撞错时按这张表定位，别猜）

| 现象 | 真实原因 | 怎么修 |
|---|---|---|
| `V2_TEMPLATE_FILE_UNREACHABLE`（模板文件 X 没连接 Desktop Bridge） | 传了 `template.fileKey`，但那个文件没在 Figma 里打开 / 没启插件 | ① 在该文件里启动插件；或 ② 改用 `template.componentKey`（跨文件唯一可靠方式）；或 ③ 把 `target.fileKey` 指到模板文件（同文件模式） |
| `V2_TEMPLATE_OTHER_FILE` | 模板文件可访问，但和 `target.fileKey` 不是同一个文件——Figma 不能跨文件克隆节点 | 改用 `template.componentKey`；或把文档渲染进模板文件本身 |
| `V2_TEMPLATE_NODE_MISMATCH` / `V2_TARGET_FILE_UNREACHABLE`（节点读不到） | 目标文件里 `1:14` 是别的图层，或 nodeId 写错 | 核对模板 nodeId；或改用 `componentKey` / 模板包 |
| `packMissing: true` + `packCandidates` 三态 | 见下 | 见下 |

**`packCandidates` 三态各怎么修**（每个候选路径都带 `state` 与 `reason`）：

| state | 含义 | 修法 |
|---|---|---|
| `missing` | 该路径没有文件 | 正常：说明这台机器没配项目模板包。走 `componentKey` 或同文件模式即可，**不要为了消掉这条去手写 pack** |
| `invalid` | JSON 读不出 / 协议不合法（如 `schema_version must be 1`） | 直接删掉这份坏配置或按契约重写；引擎不会拿它渲染。完整 schema 见 `references/template-contract.md`（`schema_version:1` + `components.top/chapter/cluster` + `capabilities`） |
| `incomplete` | 能读，但 `components` 缺 `top`/`chapter`/`cluster` 任一 | 半套 key 拼不出文档。补齐三个 key（`footer` 可选），或改用 `componentKey` |

- 手写 pack **不是一个可接受的临场动作**：它需要真实发布的 4 个组件 key，写错只会换来下一条 `invalid`/`incomplete`。要么用 `figma_compile_template` 编译产出，要么用 `componentKey`
- **`componentKey` 可用时不应出现 `packMissing`**：如果出现了，说明 `template.componentKey` 没进到入参（检查是否被 `additionalProperties: false` 挡掉、或传在了 `target` 里）

**连不上 Figma 时，按这个顺序处理**（读取与写入都适用）：

0. **先确认引擎工具在不在**：工具列表里没有 `get_skill_requirements` / `render_v2_markdown_to_figma`，连代理的 `figma_*` 也没有 → 这是 **MCP 进程级失败**，不是插件、不是模板、不是 Markdown。别让用户重开插件，直接按 `packages/figma-mcp-server/docs/INSTALL.md` 的「引擎 MCP 在 host 里连接失败」定位（两种典型：`spawn npx ENOENT` / 9223 被独立 `figma-console` 条目占着）。工具在、只是调用报错，才继续下一步
1. 先跑 `figma_list_open_files`。返回 `No files connected`、目标文件不在列表里，或渲染返回 `V2_BACKEND_UNAVAILABLE` / `V2_TARGET_FILE_UNREACHABLE`，都算连不上
2. **优先让用户在目标文件里启动这个社区插件**，一次给全链接，不要只描述：

   ```
   请在目标文件（<文件名>）里启动这个插件：
   https://www.figma.com/community/plugin/1695400514520991057
   ```

   关键点要一起说：**它可以在网页端启动，不需要安装 Figma 客户端**；启动后窗口保持打开，连接建立期间别关
3. 该插件因版本/权限原因起不来，才回退到本地 Desktop Bridge（Figma 桌面端 → Plugins → Development → Figma Desktop Bridge）
4. 报错里出现 `ws://localhost:923x` 且 x 每重启一次 +1，或用 `figma_get_status` 看到 `portFallbackUsed: true`：这是**端口漂移**（旧引擎进程没退、僵尸占满 9223–9232），不是插件问题。处理办法见 `packages/figma-mcp-server/docs/INSTALL.md` 的「重启引擎后 Bridge『坏了』」，不要反复重开插件
   - 0.3.3 起引擎会自己抢回 9223 并重拉子进程；仍失败时渲染返回 `E_BRIDGE_PORT_CONFLICT`，`details.bridge` 里有 `port / holderPid / enginePid / supervisorPid`，照着清理即可
   - `get_skill_requirements` 的 `bridge.fallback = true` 时，**不要**判定成几何或模板缺陷：render 本身不可用，先修端口
   - `V2_BRIDGE_NO_REPLY` = 插件 socket 在、sandbox 已假死（单次 exec 超过 `插件 timeout + 5s` 没有回程）。动作只有「在 Figma 里关掉插件再重新运行」；**不要**改 Markdown、不要降级贴图、不要换文件。`V2_BRIDGE_DOWN` 同理（开写前探活失败）
   - 返回体 `bridge.enginePid` 每调都变 = **宿主重启了整个 MCP**（请求超时后的自愈），不是 worker 换人；这种现场先看 `bridge.pluginConnected`，别去猜模板
5. 渲染返回的 `enginePid` 每次不一样、或 `configPath` 不是刚改的那份文件：**多个引擎进程在接请求**（多开窗口最常见）。先 `figma_get_status` 看 `otherInstances`，只留一个窗口并重启该窗口的 MCP
6. 两条都不通 → 停下来等用户，不改 Markdown、不降级贴图、不换文件硬写

对用户复述一句（不要长篇）：

```
模板：<fileKey> / <nodeId>（项目配置 / 用户配置 / 官方默认）
职能标记组件：variantKeys（跨库）/ 组件集 <id>（同文件）/ 未配置（Markdown 未使用 @职能）
```

### 第二步：声明开始

```
开始 Phase 4：写入 Figma。

输入：
- Markdown：[路径]
- 设计稿：[N 章有图，M 章占位]

我现在调用 figma-interaction-doc-engine。
```

### 第三步：调用引擎

引擎以 MCP Server `figma-interaction-doc-engine` 的形式提供，**直接调用它的 MCP 工具即可，不需要写任何胶水代码**。

Phase 4 只用得到三个工具：

| 工具 | 用途 | 是否碰 Figma |
|---|---|---|
| `validate_phase1_signoff` | 校验 Phase 1 完成声明（Phase 2 入口门禁，Phase 4 复检） | 否 |
| `validate_v2_markdown` | 强校验 Markdown，返回 `ok/errors/warnings/ir` | 否 |
| `render_v2_markdown_to_figma` | 按 v2 Markdown 填充模板 1:14 | 是 |

**先校验，后渲染。**

#### 1. 校验

```json
{
  "markdown": "<Phase 2 保存的 Markdown 全文>",
  "phase1Signoff": { "schema_version": 1, "unresolved_conflicts": [], "pending_questions": [], "dimensions": { "params": true, "diff_areas": true, "business": true, "conflicts": true } }
}
```

返回 `ok: false` 时不要继续渲染，直接走「结果 B」回到 Phase 2。传了 `phase1Signoff` 但不合格同样会 `ok: false`（码 `V2_SIGNOFF_*`），回 Phase 1 补挖，不要改声明凑数。

#### 2. 渲染

```json
{
  "markdown": "<同上>",
  "phase1Signoff": { "schema_version": 1, "unresolved_conflicts": [], "pending_questions": [], "dimensions": { "params": true, "diff_areas": true, "business": true, "conflicts": true } },
  "assetMap": {
    "01": { "type": "image", "src": "<图片路径或 base64>" },
    "02": { "type": "figma_instance", "fileKey": "<file key>", "nodeId": "<母版或子版 node id>" },
    "03": { "type": "figma_node", "fileKey": "<file key>", "nodeId": "<node id>" },
    "01/1/2": { "type": "figma_node", "fileKey": "<file key>", "nodeId": "<node id>",
                "crop": { "x": 700, "y": 0, "width": 520, "height": 160 } },
    "01/2/低血量示意": { "type": "figma_node", "fileKey": "<file key>", "nodeId": "<node id>" }
  },
  "badgeAnchors": {
    "01/1": { "text": "Tap the screen", "offset": [-24, -24], "note": "底部提示文案上方" },
    "01/2": { "text": "Click to input", "offset": [-24, -24], "note": "输入框左侧" }
  },
  "target": {
    "fileKey": "<要写入的文件 fileKey>",
    "pageId": "<询问用户 / 缺省新建>"
  },
  "template": {
    "componentKey": "<团队库已发布模板组件的 key —— 跨文件首选>"
  }
}
```

参数说明：

- `markdown`（必填）— Markdown 全文，不是路径
- `phase1Signoff`（Phase 2 起必传）— Phase 1 完成声明对象（与 `.interaction-sop/phase1-signoff.json` 同内容）。不合格 → 引擎在建画布前硬拒绝；不传 → `V2_W_PHASE1_SIGNOFF_MISSING`
- `assetMap`（可选）— 两类 key：
  - `"NN"` 章节主图，四种 `type`：
    - `image` — 需要 `src`
    - `figma_node` — 需要 `fileKey` + `nodeId`，可选 `crop`（栅格化成图片填充）
    - `figma_instance` — 需要 `fileKey` + `nodeId`（源节点为 `COMPONENT` 或 `INSTANCE`）；引擎实例化/clone 后等比缩放居中并删除占位，文档里留真实子版
    - `skip` — 留占位
    - **源节点是母版（COMPONENT / INSTANCE）时必须用 `figma_instance`**，不得用 `image` / `figma_node` 把母版降级成图；`COMPONENT_SET` 需先选定具体变体 nodeId
    - **缺省的章节按 `skip` 处理**，Phase 3 跳过的章节不写进去即可
  - `"NN/C/K"` 配图（第 NN 章第 C 簇第 K 张，K 跨 `####` 连续），只支持 `figma_node`（可选 `crop`）/ `skip`；不写键的配图保留"配图占位：xxx"
  - **`"NN/C/<配图描述>"`（byTitle）** — 不用数顺序，按 `配图：` 后面的描述精确匹配（空白折叠，大小写敏感）。簇里增删配图时不会被后面几张连坐。键怎么编、区域怎么定见 `phase3-asset.md`「配图资产」
  - 描述键写错会返回 `V2_W_ASSET_KEY_UNMATCHED`，**不要用键名猜**，直接看返回体里的 `figureSlots`（见下）
- `badgeAnchors`（可选）— 图上标号的位置，Phase 3 第 5 步逐簇确认过。**两种写法，优先文本**：
  - 文本锚点（首选）：`{ "01/2": { "text": "Click to input", "offset": [-24, -24] } }`
    - `text` 是**主图里控件的文字**（空白折叠、大小写不敏感），`offset` 是相对该控件左上角的像素偏移（负值 = 往左上）
    - 引擎在摆放标号前读主图子树算坐标，**主图换成 `figma_instance` 也成立**，换图后不需要重算
    - 同名控件多个 → 取第 1 个并报 `V2_W_BADGE_ANCHOR_TEXT_AMBIGUOUS`，用 `occurrence` 指定第几个
    - 找不到 → 退回网格并报 `V2_W_BADGE_ANCHOR_TEXT_NOT_FOUND`（主图是位图时没有可匹配 TEXT，这种情况必须用坐标）
  - 坐标锚点：`{ "01/2": { "x": 0.28, "y": 0.52, "note": "输入框左侧" } }`，主图归一化 0–1
  - 整表不传 → 全部按网格并报 `V2_W_BADGE_ANCHOR_DEFAULTED`（**不再静默**）。看到这条就该补锚点，别当成功交付
  - 同步模式的文案是「本次未重排标号」而不是「按网格摆放」：同步只重排变更章节，adopt 模式连重排都跳过，标号保持画布现状
  - **主图换了，坐标就作废**：引擎在每次摆放前重算文本锚点；但如果有人用 `figma_execute` 手工换过主图 / 改过实例，旧坐标锚点不会自己更新——要么改用文本锚点，要么跑一次同步重排标号再截图确认
  - 传了表但某簇没给 → 该簇退回网格并报 `V2_W_BADGE_ANCHOR_MISSING`；坐标越界 → 夹取并报 `V2_W_BADGE_ANCHOR_OUT_OF_RANGE`
  - 只改标号位置时走同步模式（带 `rootId`，`badgeAnchors` 只写要改的那几个簇），不会动文字与配图
- `target`（可选）— `fileKey` / `pageId`
  - `fileKey` 决定写进哪个文件。**不传就写进 Figma Desktop 当前活动的那个文件**（除非传了 `template.fileKey`，见下）
  - 目标文件必须也开着连接插件（优先社区插件 `https://www.figma.com/community/plugin/1695400514520991057`，其次本地 Desktop Bridge）；否则引擎返回 `V2_TARGET_FILE_UNREACHABLE`
  - 目标文件里的模板节点结构不对时，引擎返回 `V2_TEMPLATE_NODE_MISMATCH` 并且一个节点都不写
- `template`（可选）— 三选一，**跨文件一律用 `componentKey`**：
  - `componentKey` — 团队库已发布组件 key。目标文件不需要包含模板，只要插件连着
  - `fileKey` + `nodeId` — 同文件模式，`fileKey` 必须等于 `target.fileKey`。跨文件会明确报 `V2_TEMPLATE_OTHER_FILE` / `V2_TEMPLATE_FILE_UNREACHABLE`，**不会**回落成「在目标文件里找 1:14」
  - 只给 `fileKey` 不给 `target.fileKey` → 引擎按模板文件定向写入并告警 `V2_W_TARGET_FROM_TEMPLATE`

**不要手写 `figma_execute` 脚本绕过这两个工具。** 所有 pitfall 保护（GROUP 爆炸防护 / FRAME-local 坐标换算 / 单点 probe / 角色 TEXT 删除 / 配图占位双向判定）都在引擎的 safety wrapper 里。绕过引擎等于把防护全卸掉。

### 第四步：处理引擎返回

引擎返回三种结果：

#### 结果 A：成功

```
✅ Figma 写入完成。
- 输出位置：[Figma URL，定位到生成的"模板"实例]
- 文档 rootId：[rootInstanceId]（之后再写入这份文档要用它走同步模式）
- 共 N 个界面 / M 个气泡 / K 个语义簇
- 主图：[N 张已置入 / M 张占位]
- 配图：[summary.figuresPlaced 张已置入 / summary.figuresPlaceholder 张占位]（`figure_opt_out` 为真时写「按你要求未配图」）

请在 Figma 检查，需要任何手动微调（气泡位置 / 文字修订）随时告诉我。手改的内容之后同步不会被覆盖。
```

这份报告发出去**之前**先跑「配图审计」（见下方小节），把垫底的缺图清单一起附上。

**先读对账字段，再发报告**：

- `bubbles` — 逐章气泡清单（`section` / `cluster` / `nodeId`）。`bubbles.length` 必须等于 `summary.bubbleCount`；不等就是引擎漏摆了，按清单点名缺哪几号，**不要**报成功
- `figureSlots` — 配图槽清单（`path` / `title` / `nodeId`）。用户问"这张图按哪个键"时直接按清单答，不要回头数 `配图：`
- `warnings` 里出现 `V2_W_BADGE_COUNT_MISMATCH` → 标号数量与簇数不符，按 message 里的缺号重跑同步（只重排标号）
- `warnings` 里出现 `V2_W_BADGE_ANCHOR_DEFAULTED` → 本次没给锚点，标号是模板网格位置。**在报告里明说"标号是示意位"**，并给出补锚点的下一步

`figure_opt_out` 为真时跳过本节：配图类软告警（`V2_W_FIGURE_ASSET_MISSING` / `V2_W_FIGURE_FILL_FAILED`）一律不提，只在审计位置写一句「按你要求本次不配图」。否则按下面逐条说明：

`warnings` 里有配图相关软告警时，附在成功报告后逐条说明，**不重渲染**：

- `V2_W_FIGURE_FILL_FAILED` — 某张配图没贴上（message 带键名和 nodeId，常见原因：源节点不在目标文件 / 被删 / 导出失败）。该占位保留了描述文案，告诉用户是哪张、为什么，问要不要修好 `asset_map` 后用同步模式（带 `rootId`，`assetMap` 只写这一张）补上
- `V2_W_FIGURE_ASSET_MISSING` — md 写了 `配图：` 但 `assetMap` 没有对应键，图位留灰板。问用户：补图，还是删掉这条 `配图：`
- `V2_W_ASSET_KEY_UNMATCHED` — `asset_map` 里某个键在文档里找不到对应章节/配图，多半是编键时数错了 C 或 K。回 `phase3-asset.md` 核对编键
- `V2_W_RENDER_RETRIED` — 首轮撞上瞬时连接错误，引擎整轮重试后成功。告知用户即可，不用重跑
- `V2_W_PACK_GEOMETRY_DEFAULTED` — 模板包缺观感字段（`docBackground` / `sectionShell`），本次走默认白底 / 无外框。**不是错误**：先确认用户是不是换机器后重造了包（缺 geometry），再决定补包
- `V2_W_TEXT_CONTRAST_LOW` — 正文与最近实心背景对比度低于阈值（默认 3.0）。按顺序查：① 包有没有 geometry；② 模板本身是不是低对比设计。**若出现这条，先别交付，让用户确认可读性**
- `V2_W_TEMPLATE_ARG_IGNORED` — 传了 `template.fileKey/nodeId` 但模板包已命中，这两个字段没参与决策。下次别传
- `V2_W_PHASE1_SIGNOFF_MISSING` — 没传 `phase1Signoff`。回 Phase 1 落盘声明并校验后补传，不要忽略
- `V2_W_BADGE_ANCHOR_DEFAULTED` / `V2_W_BADGE_ANCHOR_TEXT_NOT_FOUND` / `V2_W_BADGE_ANCHOR_TEXT_AMBIGUOUS` — 标号没吸附到控件（见上方对账字段）
- `V2_W_WRITE_TIMEOUT_RECONCILED` — 写操作超时后引擎做过对账：返回体里有 `runId` 与 `sideEffects`。**先按 `sideEffects` 核对画布**，再决定重跑；重跑同参数是幂等的

#### 结果 B：v2 强校验失败

`validate_v2_markdown` 返回 `ok: false`，或 `render_v2_markdown_to_figma` 拒绝写入。回到 Phase 2 修正 Markdown，重新走 Phase 4。**不要让用户手改 Figma 来补救**。

```
⚠️ Markdown 未通过强校验：
- [失败项 1]
- [失败项 2]

我现在回到 Phase 2 修正 Markdown，修完后重新写 Figma。
```

若返回 `V2_ROLE_BLOCK_UNAVAILABLE`，说明 Markdown 有 `- @职能：` 条目但模板没配「职能标记」组件集，或组件集缺该角色变体。不要改 Markdown 绕过——先处理模板：

```
⚠️ 模板缺「职能标记」组件：
- 缺的是：@策划 变体 / 整个组件集未配置
- 需要在模板文件里放好 职能标记 COMPONENT_SET（变体名 职能标记=#策划 …）
- 然后在 ~/.game-interaction-sop/template.json（或 config.local.json）填 roleBlock.componentSetId

修好后我重跑 Phase 4。也可以临时把这几条改成普通 bullet（会丢职能归属）。
```

#### 结果 C：Figma API / 引擎运行时失败

报告失败原因，告诉用户 Figma 文件状态（已部分写入 / 未写入），询问下一步：重试 / 撤销 / 人工介入。

若返回 `V2_BACKEND_UNAVAILABLE` 或 `V2_TARGET_FILE_UNREACHABLE`，先让用户在目标文件里启动社区插件
`https://www.figma.com/community/plugin/1695400514520991057`（**网页端也能启动，不必装客户端**），
再不行才回退本地 Desktop Bridge，最后才重启 MCP Server。不要在这之前反复重试或改 Markdown。

```
⚠️ Figma 写入失败：[错误]
- Figma 状态：[未写入 / 已部分写入]
- 建议下一步：[重试 / 在 Figma 中 Ctrl+Z 撤销 / 人工调整]
```

---

## 再次写入已有文档：同步模式

文档已经渲染到 Figma 之后，凡是要再写一次（markdown 改了、补配图、加界面），**一律走同步模式**：带上 `target.rootId`，不新建、不删旧重建。设计师手改的文字、手贴的图、拖过的气泡都会保留。

`rootId` 就是首次渲染返回的 `rootInstanceId`。把它和 Figma URL 一起写进给用户的成功报告（见「结果 A」模板里的"文档 rootId"一行），下次同步从那里取。

```json
{
  "markdown": "<修订后的 Markdown 全文>",
  "assetMap": { "01/2/1": { "type": "figma_node", "fileKey": "…", "nodeId": "…" } },
  "target": { "fileKey": "UYCJok3MXTWITMfeJSqEF6", "rootId": "<rootInstanceId>" },
  "scope": "03",
  "dryRun": true
}
```

- `scope`（可选）：`"NN"` 只同步一个界面，`"NN/C"` 只同步一个簇。用户只说改了某个界面时就传它，其余内容一个字都不会动
- `dryRun`（可选）：只算计划、不写画布。改动较多或拿不准时，先 `dryRun` 给用户看一眼，确认后去掉 `dryRun` 再跑
- `assetMap` 只需要写这次要换或要补的图；不写的键不会清掉已有的图
- 引擎**只比对文字，不比对样式**：md 改了某条，而设计师给这条加过局部加粗/变色，这条的样式会被重置。需要保留样式的条目，让设计师在 Figma 里手改，不要改 md

#### 结果 D：同步完成

返回 `mode: "reconcile"` 和三份清单，照实汇报：

```
✅ 已同步到 Figma（未新建文档）。
- 改动 N 处：[按 changes 列出 path + action]
- 保留 M 处设计师的修改 / 手贴内容：[preserved 摘要]
- 标号对账：bubbles 共 X 个（逐章：01=a / 02=b …）[有 V2_W_BADGE_COUNT_MISMATCH 就点名缺号]
- 配图：审计结果 [N/N 已配 / 缺 X 张，见下方清单]
- ⚠️ 冲突 K 处，需要你决定：
  1. 03/2/#4 — Figma 现在是「…」，md 想改成「…」
```

同步后同样跑「配图审计」，缺图清单一并附在报告里。

**`bubbles` 是同步的唯一标号凭据**：同步不重渲文档，引擎是从画布逐章读回来的，`bubbles.length` 应等于各章簇数之和；出现 `V2_W_BADGE_COUNT_MISMATCH` 就按 message 里的缺号处理（带锚点走一次同步重排），不要手补。

`conflicts` 不为空时，**逐条交给用户裁决**，不要自行重跑或改用新建模式绕过：

| kind | 含义 | 用户选 md 为准时怎么办 |
|---|---|---|
| `text` | 双方都改了同一条 | 请设计师在 Figma 里把这条改回上次的文字，或直接改成 md 的文字，再同步 |
| `figure` | 设计师换过这张图，md 又指定了新图 | 请设计师删掉手换的图（恢复占位）后再同步，或者放弃这次换图 |
| `deleted-but-changed` | 设计师删了这条，md 又改了它 | 引擎不会把删掉的东西加回来；需要的话在 md 里写成一条新内容 |
| `container-not-empty` | md 删了某个界面/簇，但里面有手贴内容或手改 | 请设计师先把手贴内容挪走或删掉，再同步 |
| `needs-new-node` | **adopt 模式（无模板包）下本轮不能新建节点**：md 新增了界面/簇/条目/角色行，但引擎没有部件原型 | 告诉用户：这轮只改了既有内容；配回模板包后重跑即可补齐，或按差异手工补这几处 |

用户选 Figma 为准时，把 md 改成和 Figma 一致即可，下次同步就不再报。

出现 `needs-new-node` 时同时会带 `V2_W_RECONCILE_NO_CREATE`：**这是降级，不是失败**。报告里必须写清「哪几条没搬进去 + 为什么（模板包缺失）+ 怎么补（配回模板包 / 手工）」，不要只报「同步成功」。

其它返回：

- `V2_NOT_STAMPED` — 这份文档是同步功能上线前渲染的，没有标记，引擎认不出哪些是它生成的。**不要改用新建模式覆盖**，告诉用户需要先做一次"认领"（后续功能），在那之前只能新渲染一份并手动搬运手贴内容
- `V2_PACK_MISMATCH` — 文档由模板包渲染，但现在包不在 / 指纹变了。**不要直接重渲**（会丢手改），按下面的优先级处理：
  1. 传 `template.componentKey` 再跑一次：pack 缺失会被视为隐式 adopt，引擎继续增量同步（M1 现场唯一走得通的路）。**先跑 `dryRun: true`，再真跑**——两者结论必须一致，不一致就是引擎 bug，按回执报，不要重试硬撞
  2. pack 在但指纹变了：传 `forceReconcile: true`。引擎按当前包同步，**成功后自动重打指纹**，之后不再报这条；成功会带 `V2_W_PACK_ADOPTED`
  3. 两条都不行（结构真的变了：部件换过、能力改了）→ 才考虑重渲，并且**先让用户确认哪些手改要保留**
- `V2_RECONCILE_SCRATCH_MISMATCH` — 临时文档没渲染成结构（需要新建节点却没有可用的部件原型）。message 会列出涉及的章节与原因；按提示确认 md 是否真的新增了内容，或配置回模板包后重跑，**不要**改用新建模式硬覆盖
- `V2_SCOPE_NOT_FOUND` — scope 指向的界面/簇在文档里还不存在。新增界面/簇要去掉 scope 整篇同步
- `V2_RECONCILE_BUSY` — 上一次同步还没结束（或刚中断不到 1 分钟）。等一分钟再试
- `V2_RECONCILE_APPLY_FAILED` — 中途失败。直接用相同参数重跑即可，不会重复插入；返回体的 `changes` 是已确认落地的部分

**同步模式的已知边界**：它只改文字 / 配图 / 标号位置，**不会把普通正文条目改写成 `@职能` 组件实例**。md 里把一条规则改成 `@程序：…` 时，同步不会插组件；这种情况要么整篇重渲（会丢手改，需先确认），要么让设计师手工换实例。把这一点提前告诉用户，别承诺同步能处理。

---

## 定点修补（同步走不通时的安全流程）

同步被拒（`V2_PACK_MISMATCH` / `V2_NOT_STAMPED` / 结构已变形）而用户又**不允许重渲**（会丢手改 / 手贴图）时，才允许进入这一条。它是降级通道，不是常规路径：**先穷尽上面「同步模式」的 adopt 选项**。

### 允许做的

| 动作 | 边界 |
|---|---|
| TEXT 字符替换 | 只改 `characters`；一次改一条，改完读回核对。批量替换**必须**先列出命中清单（含被替换前后的完整文本）再执行 |
| 同排克隆插行 | 从**同一父级**里已有的一条克隆，插在目标后面，再改文字；克隆源必须是引擎建的条目（有 `gisop` 标记或命名符合模板） |
| 标号补建 | 只从标号容器里的母版克隆，`#Number` 写对应数字，位置按锚点算 |

### 禁止做的

- ❌ 删除任何**不是本次会话创建**的节点（用户手贴的图、手写的块都算）
- ❌ 在实例（INSTANCE）内部做结构编辑——Figma 直接拒绝；要改先让用户 detach
- ❌ 整段重排 / 重命名引擎条目——下次同步会认不出来，把手改判成外来内容
- ❌ 用 `figma_execute` 改完就宣称"已同步"：定点修补**不更新文档指纹**，下次同步仍会拒绝。必须在报告里写明"本次为定点修补，未走引擎同步"

### 操作纪律

1. 先只读：把要动的节点 id、当前文字、目标文字列成清单，发给用户确认
2. 一次一个 patch，每次跑完读回该节点核对；不要在一个脚本里串多个不相干的修改
3. 破坏性验证只在测试页 / 测试文档做；正式文档只做增量
4. 收尾在报告里写清：改了几个节点、哪些没改、画布上还有哪些已知偏差（例如簇配图仍是灰板）

---

## 配图审计（渲染成功 / 同步完成后必做）

渲染成功（结果 A）或用同步模式写完（结果 D）后，**先做这一步再发报告**。审计只读画布，不改任何节点，不触发重渲染，也不拦交付。

**触发条件**：会话级 `figure_opt_out` 为真（Phase 2 用户要求不配图 / Phase 3 说"配图先不贴"）时，**跳过整个审计**，报告里只写一句"按你要求本次不配图，未做配图审计"。否则按下述步骤执行。

### 1. 读引擎统计（权威）

- `summary.figuresPlaced` / `summary.figuresPlaceholder`
- `warnings` 里的 `V2_W_FIGURE_ASSET_MISSING`（md 有配图但 `assetMap` 无对应键）/ `V2_W_FIGURE_FILL_FAILED`（填图失败）

### 2. 按章节截图核对

每个 `## NN.` 章节截一张：

- 多部件产物：截该章根帧（`界面说明N` / 章节外框）
- 老结构（1:14）：截章节节点

用 `figma_capture_screenshot`（或 `figma_take_screenshot`；只能截当前视口时先定位到该章节）。看正文旁是否还有灰板或虚线占位。

**同一张截图必须核对标号（不通过就回炉）**——这不再是"顺带看一眼"：

| 检查项 | 判据 | 不通过怎么办 |
|---|---|---|
| 条数 | 每章可见标号数 === 该章簇数；且与返回体 `bubbles` 里该章的条目数一致 | 有 `V2_W_BADGE_COUNT_MISMATCH` 或对不上 → 带同一份 md + `badgeAnchors` 走同步（只重排标号），不要手补 |
| 对位 | 每个标号贴在它描述的控件左上外侧，不压字、不压控件中心 | 改 `badgeAnchors` 后同步重排 |
| 堆叠 | 多个标号没有重叠成一坨 | 同上；锚点用文本形式最省事 |
| 越界 | 没有标号被夹到图边缘（说明锚点算到图外了） | 检查锚点（或控件文本是否匹配到了面板外的同名文字） |

- 改锚点后用同步模式（带 `rootId` + 只写要改的簇），不动文字与配图，然后**重新截图确认**；不要"改完不看"
- 章节数 > 8 时先截前 8 章；未截的章节按引擎统计进清单，状态标 `待核对`、"你要做的"写"我逐章看过再回你"，**不要**直接写"已配"。**标号这一项不受此豁免**：没截图就等于没核对，报告里必须写"标号未逐章核对"

截图不可用（Bridge 断 / 工具报错）时，不重试多次：直接以引擎统计出清单，并在报告里写明"截图核对未完成，按引擎统计"。

### 3. 合并清单

以引擎统计为准，截图只用来发现统计之外的异常（占位被误判为已填、图片被裁、该显示的 hidden 没显示）。两者矛盾时单点 `figma_execute` 复核该槽再下结论。

| 章节 | 簇 | 配图描述 | 状态 | 你要做的 |
|---|---|---|---|---|
| 02 | 2 | 结算阶段倒计时 | 占位 | 在 Figma 里贴图，或把图发我用同步模式补 |
| 03 | 1 | 头像列对比 | 未找到源 | 补 `assetMap` 键，或删掉这条配图 |
| 01 | 3 | 阶段名与倒计时 | 填充失败 | 检查源节点是否还在目标文件 |

状态取值：`已配` / `占位` / `未找到源` / `填充失败` / `无配图（例外）` / `待核对`

### 4. 输出口径

有缺图时，报告末尾固定一句：

> 还有 N 张配图没贴，别忘了手动配图（或在 Figma 里贴好后告诉我，我用同步模式补）。

- 全部已配 → 只报一句"配图审计：N/N 已配"，不列空表
- Phase 2 写过 `- 配图：无（理由：…）` 的簇 → 状态 `无配图（例外）`，把理由抄进"配图描述"列，不计入缺图数，也不提醒
- `figure_opt_out = true` → 整节跳过，不列清单、不提醒（见本节开头的触发条件）
- 用户说"先这样，后面再补" → 记下这句，直接进 Phase 5，不再追问

---

## 收尾断言（不通过不算完成）

渲染（结果 A）或同步（结果 D）返回 `ok: true` 之后、发报告之前，**必须**跑一遍。任一条不通过：先定位原因（是本次改动引入的，还是既有文档遗留的），再决定「修完重跑」还是「报给用户并说明取舍」，**不要**直接说「已写入」。

只在用户显式 opt-out 配图时跳过图槽相关断言（1–4）。

| # | 断言 | 判据 |
|---|---|---|
| 1 | 槽数一致 | 文档里 `配图` GROUP 数 === md 里 `配图：` 条数 |
| 2 | 槽位无偏移 | 每个槽 `rect.absoluteBoundingBox - group.absoluteBoundingBox === (0,0)` |
| 3 | 占位可读 | 缺资产槽：组高 === `rect.h + gap + hint.h`（官方 1.14 = 323）；`hint.height >= 20` |
| 4 | 图槽健康 | `summary.figureSlotsUnhealthy === 0`，且 `warnings` 无 `V2_W_FIGURE_SLOT_GEOMETRY` / `V2_W_FIGURE_FILL_FAILED` |
| 5 | 左列自适应 | 章节内「左列」`layoutSizingVertical === 'HUG'` 且 `height === 标题高 + 主图高` |
| 6 | 行顶对齐 | 左列所在横向行 `counterAxisAlignItems === 'MIN'` |
| 7 | 幂等 | 同 md、同 assetMap 再跑一次：`changes: []`（同步模式下必查） |
| 8 | 测的是新 build | 返回体 `engineVersion` 与预期一致（当前 `0.4.2`）、`bridge.fallback === false`、`enginePid` 多次调用不变。**报错文案与版本对不上时，先怀疑旧 dist / 旧 worker，别按旧文案定位问题** |
| 9 | **标号齐** | 每章标号数 === 簇数 === `bubbles` 里该章条目数；无 `V2_W_BADGE_COUNT_MISMATCH`；**逐章截图核对过**（截图不可用须在报告里明说） |
| 10 | **锚点已生效** | `warnings` 无 `V2_W_BADGE_ANCHOR_DEFAULTED` / `V2_W_BADGE_ANCHOR_MISSING` / `V2_W_BADGE_ANCHOR_TEXT_NOT_FOUND`，否则标号位置是示意位，不能当交付 |

**脚本（可直接改 nodeId 复用）**

```js
const root = await figma.getNodeByIdAsync('<rootId>');
const figs = [];
const walk = (n) => { if (n.type === 'GROUP' && n.name === '配图') figs.push(n);
  if ('children' in n) n.children.forEach(walk); };
walk(root);

let filled = 0, empty = 0, bad = [];
for (const g of figs) {
  const rect = g.children.find(c => c.name === '配图占位');
  const hint = g.children.find(c => c.name === '配图占位文案');
  const ga = g.absoluteBoundingBox, ra = rect.absoluteBoundingBox;
  const has = Array.isArray(rect.fills) && rect.fills.some(f => f.type === 'IMAGE');
  if (Math.round(ra.x - ga.x) !== 0 || Math.round(ra.y - ga.y) !== 0) bad.push([g.id, 'offset']);
  if (has) filled++;
  else {
    empty++;
    const exp = rect.height + (hint ? 16 + hint.height : 0);
    if (Math.abs(ga.height - exp) > 2) bad.push([g.id, 'groupH ' + Math.round(ga.height)]);
    if (hint && hint.height < 20) bad.push([g.id, 'hint squash ' + Math.round(hint.height)]);
  }
}

const lefts = [];
const w2 = (n) => { if (n.name === '左列') lefts.push(n); if ('children' in n) n.children.forEach(w2); };
w2(root);
return { slots: figs.length, filled, empty, bad, left: lefts.map(l => [l.id,
  l.layoutSizingVertical, Math.round(l.height), l.parent.counterAxisAlignItems]) };
```

**断言口径说明**

- 第 2 条只看绝对坐标：`配图` 是 GROUP 时，子节点坐标写在父级坐标系里，用局部 `rect.x/rect.y` 判断会得到假阳性
- 第 3 条 `gap` 取模板实际值（官方 1.14 = 16）；不同模板包组高不同，先量一个健康槽再套公式
- 第 5 条「左列」是模板约定的节点名；换模板包时先确认该名字存在，不存在就按「主图栏 FRAME」的语义找

---

## 用户验收后

如果用户提手动微调请求（"把 02 章第 3 个气泡往左挪一点"），按需要：

- 小范围微调 → 让用户在 Figma 里直接改（引擎不提供微调工具）；之后同步不会覆盖这些手改
- 内容修改 → 改 Markdown，走上面的同步模式

### 文风沉淀不在这里做

Phase 4 结束时**不要**问"要不要沉淀文风"。Figma 里改过的表述，统一由 Phase 5 收口：

- 问一句"你在 Figma 里改过表述吗？把最新文档链接/node 给我"，这一步归 Phase 5
- 读文本 → 对比 → 提炼条目 → 列清单确认 → 写 `style_own.md`，细则见 `phase5-style-learn.md`

---

## SOP 完成

Phase 4 交付完成后，主动进入 Phase 5（文风沉淀）。

```
🎉 交互文档已交付。

产物：
- v2 Markdown：[路径]
- Figma 文档：[URL]

下一步做文风沉淀：把这一轮你改过的表述存成你的表达习惯。
```

---

## 严禁

- ❌ 在 skill 里写 Figma MCP 的具体调用细节（move_node 坐标系等）
- ❌ 不通过 `render_v2_markdown_to_figma`、直接调 `figma_execute` 写文档
- ❌ 写 TypeScript 胶水代码 import `@game-interaction-sop/engine` —— 该包已废弃，引擎只通过 MCP 工具暴露
- ❌ 引擎报错时，绕过引擎手动 patch Figma
- ❌ Markdown 校验失败时，让用户手改 Figma 来补救
- ❌ 文档已存在时不带 `rootId` 重新渲染、或删掉旧文档重建——会把设计师的手改和手贴图全部丢掉
- ❌ 同步报冲突后，为了"让结果干净"改用新建模式或自行覆盖
- ❌ 跳过配图审计直接发成功报告；缺图却不提醒用户
- ❌ 审计时为"看得更清楚"去移动、重排或删改画布节点（审计只读）
