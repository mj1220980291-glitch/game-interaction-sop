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
    "03": { "type": "skip" }
  },
  "target": {
    "fileKey": "UYCJok3MXTWITMfeJSqEF6",
    "pageId": "<询问用户 / 缺省新建>"
  }
}
```

参数说明：

- `markdown`（必填）— Markdown 全文，不是路径
- `assetMap`（可选）— key 是 `## NN.` 的两位章节号字符串；三种 `type`：
  - `image` — 需要 `src`
  - `figma_node` — 需要 `fileKey` + `nodeId`
  - `skip` — 留占位
  - **缺省的章节按 `skip` 处理**，Phase 3 跳过的章节不写进去即可
- `target`（可选）— `fileKey` / `pageId`

**不要手写 `figma_execute` 脚本绕过这两个工具。** 所有 pitfall 保护（GROUP 爆炸防护 / FRAME-local 坐标换算 / 单点 probe / 角色 TEXT 删除 / 配图占位双向判定）都在引擎的 safety wrapper 里。绕过引擎等于把防护全卸掉。

### 第三步：处理引擎返回

引擎返回三种结果：

#### 结果 A：成功

```
✅ Figma 写入完成。
- 输出位置：[Figma URL，定位到生成的"模板"实例]
- 共 N 个界面 / M 个气泡 / K 个语义簇
- 主图：[N 张已置入 / M 张占位]

请在 Figma 检查，需要任何手动微调（气泡位置 / 文字修订）随时告诉我。
```

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

## 用户验收后

如果用户提手动微调请求（"把 02 章第 3 个气泡往左挪一点"），按需要：

- 小范围微调 → 让用户在 Figma 里直接改（引擎不提供微调工具）
- 大范围结构修改 → 改 Markdown 重跑 Phase 4

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
