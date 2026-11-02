## 1. 角色运行时（role-block.ts / template-config.ts）

- [x] 1.1 `loadRoleBlocks` 改为返回结构化结果 `{ ok: true, runtime, source } | { ok: false, failure }`，failure 区分 `not-in-target-file` / `no-variants` / `no-valid-roles`
- [x] 1.2 更新 `render.ts` 调用点：失败转成 `V2_ROLE_BLOCK_SET_NOT_IN_TARGET_FILE` 或 `V2_ROLE_BLOCK_UNAVAILABLE`，保留 `warn` 通道用于非致命提示
- [x] 1.3 `loadConfigFile` 返回 `{ path, config }`，`resolveTemplateConfig` 增加 `configPath` 字段（env 来源标注 `env`）
- [x] 1.4 更新受影响的既有单测（`tests/v2/role-block*.spec.ts`、`template-pack-lookup.spec.ts`）到新签名

## 2. 预检与 parts 贯通

- [x] 2.1 新增 `missingRoles(ir, runtime)`：按 IR 的 `@角色` 比对 `variants` ∪ `variantKeys`，返回缺失角色数组
- [x] 2.2 `renderInner` 在 `loadRoleBlocks` 后、克隆模板前调用预检，缺失即抛 `V2_ROLE_BLOCK_UNAVAILABLE` + `details.missingRoles`
- [x] 2.3 `renderFromParts` 入参增加 `roleBlocks`，经 `FillChapterCtx` 传到 `fillCluster`（替换 `render/parts/index.ts:689` 的 `undefined`）
- [x] 2.4 `renderInner` 把已解析的 `roleBlocks` 传给 `renderFromParts`

## 3. 主图实例保位（figmaConsoleBackend.ts）

- [x] 3.1 `placeInstance` 改为 `parent.insertChild(原索引, inst)`，`inst.name = ph.name`，再 `ph.remove()`，全部在同一次 exec 内
- [x] 3.2 改名失败时 try/catch 降级（只丢诊断精度，不阻断渲染）
- [x] 3.3 补后端单测：实例索引等于占位索引、名称继承、`气泡` 仍在实例之前

## 4. 统计口径与诊断

- [x] 4.1 `applyAsset` 返回 `boolean`（是否真的调用了落图 API），更新所有调用点
- [x] 4.2 parts 的 `image` 改用该返回值；断言 `imagesPlaced + placeholdersUsed === sectionCount`
- [x] 4.3 主图槽缺失且有资产时补 `V2_W_MAIN_SLOT_MISSING`（`context` 带章节名），登记到 `ir.ts` 的软告警枚举
- [x] 4.4 渲染返回新增 `resolvedRoleBlock`（mode / source / componentSetId / variantPrefix / labelTextName / roles）、`configPath`、`enginePid`

## 5. 文档与工具描述

- [x] 5.1 `createServer.ts` 的 `render_v2_markdown_to_figma` 描述补：`variantKeys` 跨库写法、与 `componentSetId` 的优先级、`resolvedRoleBlock` 回显、锚点取值建议
- [x] 5.2 `badgeAnchors` 描述明确「整表不传 = 全网格、不告警；只给一部分才逐簇告警」
- [x] 5.3 模板契约文档补「职能标记组件调用规则」表（库引用 / 同文件 / 变体命名 / `labelTextName` / 正文写入规则）
- [x] 5.4 `packages/skill/phases/phase3-asset.md` 补锚点取值建议（贴控件左上再上偏 10–20px）
- [x] 5.5 `packages/skill/phases/phase4-figma.md` 补：多实例排查看 `enginePid` / `configPath`；同步不支持把正文改写成 `@职能`，需重渲
- [x] 5.6 `CHANGELOG.md` 记三条行为变化 + 版本 `0.3.1`；`package.json` 与 `manifest.engineVersion` 同步

## 6. 测试与门槛

- [x] 6.1 新增 parts 路径职能渲染用例（`variantKeys` 命中、`componentSetId` 命中、缺角色报错且不落节点）
- [x] 6.2 新增跨库组件集用例，断言错误码与 message 关键词
- [x] 6.3 新增返回值用例：`resolvedRoleBlock` 的 mode / source / roles，未配置时字段不存在
- [x] 6.4 新增统计用例：`figma_instance` 主图计 3、主图槽缺失报 `V2_W_MAIN_SLOT_MISSING`
- [x] 6.5 `npm run build` + `npm test` 全绿；`openspec validate --all --strict` 全绿

## 7. 真机验收

- [x] 7.1 kiroro 目标文件重渲一次：9 个标号默认可见、`@程序` 等职能自动成实例、`imagesPlaced` 与章节数一致（实测 4340 文档：2+4+3=9 标号全可见；`职能标记=程序/策划` 各 1 个；`imagesPlaced 1 / placeholdersUsed 2`）
- [x] 7.2 用 `rootId` 跑一次幂等同步，确认新增职能实例不被报成 `foreign`（`changes` 已不再出现 `@职能` 的 insert，`preserved` 为空；仅剩主图资产比对与一处文本差异）
- [x] 7.3 复核该模板章节 `主图` 槽的实际节点名：真实槽位就是 `主图占位`；旧文档里显示成 `Frame 427322255` 是旧 `placeInstance` 没继承名称，已修（新文档实测实例名 = `主图占位`）
- [x] 7.4 重跑 `npm run install-mcp` 前后均可从 MCP 侧看到 `resolvedRoleBlock` / `configPath` / `enginePid`（实测 enginePid 与配置路径随调用返回）

> 已知遗留：parts 的主图槽 stamp 未记 `asset`，同步时每次会重算一次主图资产（`01/#main asset`），不影响画面。已记入本轮遗留，未在本变更内处理。
