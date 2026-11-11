# 面向管理者的产品架构图

## Purpose

以单页产品语言介绍游戏交互文档 SOP 的全流程、后台职责及经验复用，不要求读者了解工程接口或代码结构。

## Requirements

### Requirement: 16:9 单页、离线可用

`docs/architecture/leadership.html` SHALL 内联全部主图、样式和脚本，不请求网络资源。主图 SHALL 使用 1920 × 1080 坐标，随视口等比缩放；窄屏不改变图的比例。主图外的讲解备注 SHALL 可在小屏阅读。

### Requirement: 流程、后台与资产形成闭环

主图 SHALL 包含提供材料、澄清需求、确认方案、匹配图文、生成交付、沉淀经验六步；后台 SHALL 分别解释 AI 理解与协作、统一内容整理与校验、文档自动生成与更新。案例、表达规范及预先配置的版式 SHALL 显示为可复用项目资产。

### Requirement: 使用产品语言且不扩大能力

主图 SHALL NOT 出现 MCP、IR、reconcile、组件键、节点 ID 等工程术语。SHALL 标明人工确认和修改冲突处理；SHALL NOT 暗示程序验证了业务语义正确、无人审核、自动学习版式，或没有依据的效率提升数字。

### Requirement: 汇报与导出

页面 SHALL 提供全屏、讲解备注和 3840 × 2160 PNG 导出。导出只包含主图，不包含工具栏和备注。主图 SHALL 有文本替代说明，按钮 SHALL 支持键盘，导出进度 SHALL 以状态文本反馈。

## 内容依据（维护用，不进入汇报主图）

| 产品概括 | 项目依据 |
|---|---|
| 历史参考、需求澄清、方案审核、图文确认、交付与沉淀 | `packages/skill/SKILL.md`；`packages/skill/phases/phase0-recall.md` 至 `phase6-extract.md` |
| 统一内容与校验 | `packages/figma-mcp-server/src/v2/parser.ts`；`phase1-signoff.ts` |
| 按版式生成、图文与标注、连接设计工具 | `packages/figma-mcp-server/src/v2/render.ts`；`render/parts/index.ts`；`figma-client.ts` |
| 差异更新、人工修改保留、冲突交人处理 | `packages/figma-mcp-server/src/v2/reconcile/plan.ts`；`packages/skill/phases/phase4-figma.md` |
| 表达习惯需确认、知识按影响程度维护 | `packages/skill/phases/phase5-style-learn.md`；`phase6-extract.md` |

## 验证范围

检查浏览器中主图的 16:9 比例、文字边界与相互遮挡、全屏、备注、PNG 导出，以及桌面和窄屏无页面横向溢出；进行截图目视复核。本次不修改引擎或 skill 运行行为。
