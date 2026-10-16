# Phase 4 — 写入 Figma

## 进入条件

Phase 2 完成（Markdown 已保存）+ Phase 3 完成（设计稿决策已收集）。

## 完成条件

引擎返回成功，用户在 Figma 看到结果，验收通过。

---

## 一句话主义

**所有 Figma 操作的细节（节点克隆 / TEXT 填充 / 角色 TEXT 删除 / 气泡定位 / GROUP-bbox 爆炸防护 / FRAME-local 坐标换算 / undo 栈风险等）都封装在 `figma-interaction-doc-engine` 工具里。本 skill 只负责调用 + 报告结果。**

不要在这里写"如何调 MCP move_node 才不会爆炸"之类的事。那是引擎代码的责任。

---

## 标准调用流程

### 第一步：声明开始

```
开始 Phase 4：写入 Figma。

输入：
- Markdown：[路径]
- 设计稿：[N 章有图，M 章占位]

我现在调用 figma-interaction-doc-engine。
```

### 第二步：调用引擎

引擎以 MCP Server `figma-interaction-doc-engine` 的形式提供，**直接调用它的 MCP 工具即可，不需要写任何胶水代码**。

Phase 4 只用得到两个工具：

| 工具 | 用途 | 是否碰 Figma |
|---|---|---|
| `validate_v2_markdown` | 强校验 Markdown，返回 `ok/errors/warnings/ir` | 否 |
| `render_v2_markdown_to_figma` | 按 v2 Markdown 填充模板 1:14 | 是 |

**先校验，后渲染。**

#### 1. 校验

```json
{
  "markdown": "<Phase 2 保存的 Markdown 全文>"
}
```

返回 `ok: false` 时不要继续渲染，直接走「结果 B」回到 Phase 2。

#### 2. 渲染

```json
{
  "markdown": "<同上>",
  "assetMap": {
    "01": { "type": "image", "src": "<图片路径或 base64>" },
    "02": { "type": "figma_node", "fileKey": "<file key>", "nodeId": "<node id>" },
    "03": { "type": "skip" },
    "01/1/2": { "type": "figma_node", "fileKey": "<file key>", "nodeId": "<node id>",
                "crop": { "x": 700, "y": 0, "width": 520, "height": 160 } }
  },
  "target": {
    "fileKey": "UYCJok3MXTWITMfeJSqEF6",
    "pageId": "<询问用户 / 缺省新建>"
  }
}
```

参数说明：

- `markdown`（必填）— Markdown 全文，不是路径
- `assetMap`（可选）— 两类 key：
  - `"NN"` 章节主图，三种 `type`：
    - `image` — 需要 `src`
    - `figma_node` — 需要 `fileKey` + `nodeId`，可选 `crop`
    - `skip` — 留占位
    - **缺省的章节按 `skip` 处理**，Phase 3 跳过的章节不写进去即可
  - `"NN/C/K"` 配图（第 NN 章第 C 簇第 K 张，K 跨 `####` 连续），只支持 `figma_node`（可选 `crop`）/ `skip`；不写键的配图保留"配图占位：xxx"。键怎么编、区域怎么定见 `phase3-asset.md`「配图资产」
- `target`（可选）— `fileKey` / `pageId`
  - `fileKey` 决定写进哪个文件。**不传就写进 Figma Desktop 当前活动的那个文件**，所以只要用户可能同时开着别的文件，就该显式传 `UYCJok3MXTWITMfeJSqEF6`
  - 目标文件必须也开着 Desktop Bridge 插件；否则引擎返回 `V2_TARGET_FILE_UNREACHABLE`
  - 目标文件里的 `1:14` 不是模板时，引擎返回 `V2_TEMPLATE_NODE_MISMATCH` 并且一个节点都不写

**不要手写 `figma_execute` 脚本绕过这两个工具。** 所有 pitfall 保护（GROUP 爆炸防护 / FRAME-local 坐标换算 / 单点 probe / 角色 TEXT 删除 / 配图占位双向判定）都在引擎的 safety wrapper 里。绕过引擎等于把防护全卸掉。

### 第三步：处理引擎返回

引擎返回三种结果：

#### 结果 A：成功

```
✅ Figma 写入完成。
- 输出位置：[Figma URL，定位到生成的"模板"实例]
- 文档 rootId：[rootInstanceId]（之后再写入这份文档要用它走同步模式）
- 共 N 个界面 / M 个气泡 / K 个语义簇
- 主图：[N 张已置入 / M 张占位]
- 配图：[summary.figuresPlaced 张已置入 / 其余保留占位]

请在 Figma 检查，需要任何手动微调（气泡位置 / 文字修订）随时告诉我。手改的内容之后同步不会被覆盖。
```

`warnings` 里有配图相关软告警时，附在成功报告后逐条说明，**不重渲染**：

- `V2_W_FIGURE_FILL_FAILED` — 某张配图没贴上（message 带键名和 nodeId，常见原因：源节点不在目标文件 / 被删 / 导出失败）。该占位保留了描述文案，告诉用户是哪张、为什么，问要不要修好 `asset_map` 后用同步模式（带 `rootId`，`assetMap` 只写这一张）补上
- `V2_W_ASSET_KEY_UNMATCHED` — `asset_map` 里某个键在文档里找不到对应章节/配图，多半是编键时数错了 C 或 K。回 `phase3-asset.md` 核对编键

#### 结果 B：v2 强校验失败

`validate_v2_markdown` 返回 `ok: false`，或 `render_v2_markdown_to_figma` 拒绝写入。回到 Phase 2 修正 Markdown，重新走 Phase 4。**不要让用户手改 Figma 来补救**。

```
⚠️ Markdown 未通过强校验：
- [失败项 1]
- [失败项 2]

我现在回到 Phase 2 修正 Markdown，修完后重新写 Figma。
```

#### 结果 C：Figma API / 引擎运行时失败

报告失败原因，告诉用户 Figma 文件状态（已部分写入 / 未写入），询问下一步：重试 / 撤销 / 人工介入。

若返回 `V2_BACKEND_UNAVAILABLE`，说明 MCP Server 启动时没接上 Figma 后端——让用户检查 Figma Desktop Bridge 插件是否在目标文件里运行中，然后重启 MCP Server。

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
- ⚠️ 冲突 K 处，需要你决定：
  1. 03/2/#4 — Figma 现在是「…」，md 想改成「…」
```

`conflicts` 不为空时，**逐条交给用户裁决**，不要自行重跑或改用新建模式绕过：

| kind | 含义 | 用户选 md 为准时怎么办 |
|---|---|---|
| `text` | 双方都改了同一条 | 请设计师在 Figma 里把这条改回上次的文字，或直接改成 md 的文字，再同步 |
| `figure` | 设计师换过这张图，md 又指定了新图 | 请设计师删掉手换的图（恢复占位）后再同步，或者放弃这次换图 |
| `deleted-but-changed` | 设计师删了这条，md 又改了它 | 引擎不会把删掉的东西加回来；需要的话在 md 里写成一条新内容 |
| `container-not-empty` | md 删了某个界面/簇，但里面有手贴内容或手改 | 请设计师先把手贴内容挪走或删掉，再同步 |

用户选 Figma 为准时，把 md 改成和 Figma 一致即可，下次同步就不再报。

其它返回：

- `V2_NOT_STAMPED` — 这份文档是同步功能上线前渲染的，没有标记，引擎认不出哪些是它生成的。**不要改用新建模式覆盖**，告诉用户需要先做一次"认领"（后续功能），在那之前只能新渲染一份并手动搬运手贴内容
- `V2_SCOPE_NOT_FOUND` — scope 指向的界面/簇在文档里还不存在。新增界面/簇要去掉 scope 整篇同步
- `V2_RECONCILE_BUSY` — 上一次同步还没结束（或刚中断不到 1 分钟）。等一分钟再试
- `V2_RECONCILE_APPLY_FAILED` — 中途失败。直接用相同参数重跑即可，不会重复插入

---

## 用户验收后

如果用户提手动微调请求（"把 02 章第 3 个气泡往左挪一点"），按需要：

- 小范围微调 → 让用户在 Figma 里直接改（引擎不提供微调工具）；之后同步不会覆盖这些手改
- 内容修改 → 改 Markdown，走上面的同步模式

---

## SOP 完成

用户验收通过后：

```
🎉 SOP 完成。

产物：
- v2 Markdown：[路径]
- Figma 文档：[URL]

如果后续需要调整，告诉我修改点，我会从对应 Phase 重入。
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
