## Why

kiroro 主串联的真机反馈（《引擎问题反馈 #2 — 职能标记组件与标号》）暴露两条阻断级缺陷，且都被误诊成「配置没读到 / 多进程串台」：

1. **多部件（parts）渲染路径从不把 `roleBlocks` 传给 `fillCluster`**（`render/parts/index.ts:689` 写死 `undefined`），所以 `roleBlock.variantKeys` 在 parts 模式 100% 不生效，报错里的 `variantPrefix` 恒为兜底值 `职能标记=`。用户对照测试只调了 `loadRoleBlocks`，才误判成服务端配置问题。
2. **`placeInstance` 用 `appendChild` 替换主图占位**（`figmaConsoleBackend.ts:351`），主图被扔到父级末尾，直接压住 `气泡` 容器里的标号 —— 违反既有约定「标号 SHALL 位于图区之上」（`openspec/specs/template-render/spec.md:151`）。

这两条让用户每轮渲染后手工做两件补救（提层、手插职能实例），重渲一次全被冲掉。同时反馈里还有若干诊断/文档缺口：跨库 `componentSetId` 静默降级、`resolvedRoleBlock` 无法对账、`variantKeys` 没写进契约、`imagesPlaced` 口径与视觉不符。

## What Changes

- **roleBlocks 贯通 parts 路径**：`renderFromParts` / `fillChapter` 上下文携带 `roleBlocks`，`fillCluster` 收到实参；`roleAnnotation = component-variant` 的簇在 parts 模式正常生成职能组件实例，不再降级或抛错。
- **职能可用性前移校验**：解析 IR 后、克隆模板前，按 IR 里实际出现的角色逐个预检（`variants` ∪ `variantKeys`），缺角色直接返回，不进入画布。
- **跨库解析报错区分**：`roleBlock.componentSetId` 解析失败时区分「节点不存在」与「跨库不可见」，用 `V2_ROLE_BLOCK_SET_NOT_IN_TARGET_FILE` 并指明改用 `variantKeys`；不再用「模板未配置组件集」这句掩盖原因。
- **配置优先级写死并回显**：`variantKeys` 优先于 `componentSetId`；渲染返回值新增 `resolvedRoleBlock: { mode, roles, componentSetId?, variantPrefix, labelTextName, source }` 与 `configPath`，一次调用可对账。
- **`placeInstance` 保位**：新实例按占位节点原索引 `insertChild`，不再 `appendChild`；主图不再压住标号，槽位名与层序同时保住（连带修掉 stamp 报「缺槽位 main」与主图统计口径）。
- **主图统计口径修正**：parts 的 `imagesPlaced` / `placeholdersUsed` 按「主图槽是否找到 + 资产是否实际落图」计，并补 `mainSlotMissing` 诊断信息。
- **文档补齐**：`variantKeys` 跨库写法与优先级、锚点取值建议（贴控件左上偏上）、`badgeAnchors` 整表缺省语义（不传 = 全网格、不告警）、同步模式把普通正文改成 `@职能` 的插入规则，写进 tool description 与 `template-contract.md` / `phase3` / `phase4`。

**BREAKING**：无。parts 模式此前遇到 `component-variant` 必失败，修复后变为成功；未配置 `roleBlock` 的文档行为不变。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `template-render`: 新增「职能标记组件在 parts 路径必须生效」与「跨库/同文件两种取变体方式的优先级与失败语义」要求；把「标号位于图区之上」从口头约定升级为可校验行为（主图实例化后层序不得覆盖标号）。
- `render-reconcile-parts`: 章节主图落图后 `气泡` 层序、`imagesPlaced` / `placeholdersUsed` 统计口径、主图槽缺失诊断。
- `engine-mcp-server`: `render_v2_markdown_to_figma` 返回体新增 `resolvedRoleBlock` / `configPath`；错误码 `V2_ROLE_BLOCK_SET_NOT_IN_TARGET_FILE`；预检失败不产生节点。

## Impact

- 代码：`packages/figma-mcp-server/src/v2/render/parts/index.ts`、`src/v2/render.ts`、`src/v2/role-block.ts`、`src/v2/template-config.ts`、`src/server/figmaConsoleBackend.ts`、`src/v2/ir.ts`（新错误码 / 告警枚举）
- 文档：`packages/figma-mcp-server/docs/template-contract.md`（若不存在则并入现有契约文档）、`packages/skill/phases/phase3-asset.md`、`phase4-figma.md`、`createServer.ts` 的 tool description
- 测试：`tests/v2/role-block*.spec.ts`（新增 parts 路径用例）、`tests/parts/*` 层序与统计断言、`tests/server/place-instance*.spec.ts`
- 版本：引擎 `0.3.0 → 0.3.1`；已安装方需重跑 `npm run install-mcp` 或重启 MCP
- 真机：kiroro 目标文件重渲一次，确认 9 个标号默认可见、`@程序` 等职能自动成实例
