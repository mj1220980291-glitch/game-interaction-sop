## Why

`render_v2_markdown_to_figma` 只有一种模式：从 1:14 模板克隆一份全新文档。想"更新"就只能删掉旧文档、换上新文档，设计师手贴的图、手改的字会一起丢失。变色龙项目就是这样丢了 20 多张手贴图，最后靠版本历史才找回来（`引擎开发反馈.md` §六 #1）。这样一来，交互文档没法在 Agent 和设计师之间来回协作。

另外，超时之后插件可能还在后台继续执行，重跑会把内容重复插入一遍（§六 #2）。现在的渲染是"整份重建"，不是幂等的，没法安全地重试。

## What Changes

- 首次渲染时，引擎给它生成的每个节点打上隐藏标记（`setSharedPluginData`），记下节点身份和"上次写入的内容"。设计师在画布上看不到这些标记。
- `render_v2_markdown_to_figma` 新增**同步模式**：传入 `target.rootId`（一份已渲染的文档）后，不再克隆新文档，而是拿当前 markdown 和这份文档逐条比对，只改有变化的部分：
  - 界面按名称匹配，簇按标题匹配；条目按文字对齐（同 diff 算法），算出改、增、删、移
  - 设计师手改过的条目一律保留。如果 markdown 也改了同一条，就报冲突，不覆盖
  - 没有标记的节点（手贴的图、画板）一律不碰，始终跟在它前面那个引擎节点后面
  - 被设计师删掉的引擎节点不重建，只在报告里列出
- 新增可选参数 `scope`（`"NN"` 或 `"NN/C"`），把同步范围限定在某个界面或某个簇。不传就是整篇同步。
- 新增可选参数 `dryRun`：只返回修改计划和冲突，不写画布。
- 同步结果返回 `changes`、`conflicts`、`preserved` 三份清单。
- 同步过程可安全重跑：条目的写入和它的标记在同一次调用里完成，计划每次都从画布现状重新计算。超时或中断后重跑，结果会收敛到同一个状态，不会重复插入。
- 修改计划在本地计算，执行时按批提交，单次 `figma_execute` 的耗时控制在 30s 上限以内。
- 不带 `rootId` 时仍是首次渲染，行为与现在一致，只是多一次打标记的批量调用。

不包含：没有标记的旧文档认领（adopt），留给后续 change `adopt-legacy-doc`。

## Capabilities

### New Capabilities
- `render-reconcile`：对已带标记的文档做增量或原位同步，包括标记数据模型、匹配与对齐规则、手改判定、冲突与外来节点的处理、scope 与 dryRun、幂等与分批执行

### Modified Capabilities
- `figma-template-1-14-rendering`：首次渲染必须给所有引擎生成的节点打标记
- `engine-mcp-server`：`render_v2_markdown_to_figma` 的输入新增 `target.rootId`、`scope`、`dryRun`，输出新增 `changes`、`conflicts`、`preserved`；原生工具仍然只有那两个
- `skill-sop-workflow`：Phase 4 重新渲染已有文档时，必须走同步模式（传 `rootId`），不再新建一份；冲突清单要交给用户裁决

## Impact

- 代码：`packages/figma-mcp-server/src/v2/render.ts`（打标记、拆出 reconcile 入口）、新增 `src/v2/reconcile/`（读取、对齐、计划、执行）、`figma-client.ts`（`FigmaBackend` 新增标记读写、按位置插入、批量执行计划的方法）、`server/figmaConsoleBackend.ts`（插件侧实现）、`server/createServer.ts`（schema 与参数校验）
- 测试：`tests/v2/helpers/mock-backend.ts` 要支持 pluginData 和按位置插入。`render-subgroups.spec.ts` 的 `BASELINE_CALL_SEQUENCE` 末尾会多一次打标记调用，需要写明理由
- 文档：`packages/skill/phases/phase4-figma.md`、`packages/skill/references/markdown-v2-spec.md`（如果涉及），以及与之对应的主 spec，两边要双向同步
- 兼容性：同步模式只对本 change 上线之后渲染出来的文档有效。对没有标记的文档传 `rootId`，会返回明确的错误码，提示需要先认领
