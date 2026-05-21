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

本 SOP 提供两个 npm 包：

- `@game-interaction-sop/engine` — parser + renderer
- `@game-interaction-sop/mcp-adapter` — 将 `FigmaBackend` 接口绑到你手上的 MCP `figma_execute` 工具

标准调用样板（AI 在 Phase 4 里应当按此生成代码并通过 MCP 执行）：

```ts
import {
  parseV2,
  renderV2MarkdownToFigma
} from '@game-interaction-sop/engine';
import { createFigmaConsoleBackend } from '@game-interaction-sop/mcp-adapter';

// 1. exec 桥接：把引擎的 FigmaBackend 请求转成你当前能用的 MCP 调用。
//    下面以 figma-console MCP 为例；如果你用的是 Cursor-Talk-to-Figma 等
//    其他兼容插件，把 tool 名字换成对应的即可。
const backend = createFigmaConsoleBackend({
  exec: async (code) => {
    const resp = await useMcpTool('figma-console', 'figma_execute', { code });
    if (!resp.success) throw new Error(resp.error);
    return resp.result;
  }
});

// 2. 读 Markdown + 校验
const parsed = parseV2(markdown);
if (!parsed.ok) throw parsed.errors[0];

// 3. 真正渲染
await renderV2MarkdownToFigma({
  markdown,
  assetMap,    // Phase 3 整理出的 asset_map
  backend,
  target: {
    fileKey: 'UYCJok3MXTWITMfeJSqEF6',  // 或用户的 Figma 文件 key
    pageId: 'YYY'                        // 询问用户 / 默认新建
  }
});
```

**不要手写 `figma_execute` 脚本绕过 adapter。** 所有 pitfall 保护（GROUP 爆炸防护 / FRAME-local 坐标换算 / 单点 probe / 角色 TEXT 删除 / 配图占位双向判定）都在 engine 的 safety wrappers 里。绕过 adapter 等于把 pitfalls 的防护全卸掉。

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

引擎拒绝写，返回失败的强校验项。回到 Phase 2 修正 Markdown，重新走 Phase 4。**不要让用户手改 Figma 来补救**。

```
⚠️ Markdown 未通过强校验：
- [失败项 1]
- [失败项 2]

我现在回到 Phase 2 修正 Markdown，修完后重新写 Figma。
```

#### 结果 C：Figma API / 引擎运行时失败

报告失败原因，告诉用户 Figma 文件状态（已部分写入 / 未写入），询问下一步：重试 / 撤销 / 人工介入。

```
⚠️ Figma 写入失败：[错误]
- Figma 状态：[未写入 / 已部分写入]
- 建议下一步：[重试 / 在 Figma 中 Ctrl+Z 撤销 / 人工调整]
```

---

## 用户验收后

如果用户提手动微调请求（"把 02 章第 3 个气泡往左挪一点"），按需要：

- 小范围微调 → 直接调引擎的微调工具（如有）
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
- ❌ 不通过引擎、直接调 Figma MCP 写文档
- ❌ 引擎报错时，绕过引擎手动 patch Figma
- ❌ Markdown 校验失败时，让用户手改 Figma 来补救
