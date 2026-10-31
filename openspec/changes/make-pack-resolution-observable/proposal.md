## Why

真实需求（M1/M2，kiroro 主串联）跑通但踩了两个坑：模板包缺失时抛 `V2_TARGET_FILE_UNREACHABLE`，把**目标文件**当模板所在文件去查 `1:14`，指向完全错误的方向；`template` 入参只改 legacy 模板寻址、改不了模板包查找，传了等于没传且无任何提示；不带 `target` 时又变成第三个错误 `cloneNode: source not found`。

同时渲染结果里**没有任何字段**说明用了哪个 pack（路径 / 项目 / 三个 key / 能力）。这次两次成功调用的 `warnings` 全空，实际却需要手工修 27 个空配图框、102 条居中正文、6 条虚线描边——零告警不等于零问题，缺的正是模板解析的可观测性。

现状靠「静默回落到克隆 `1:14`」推进（已用全局 `default.json` 兜住），推广到新项目前必须变成显式可诊断。

## What Changes

- 模板包解析结果进渲染返回值：`pack: { path, project, components, capabilities }`；未命中时 `packMissing: true` + 已查的 4 个候选路径
- 新增硬错误码 `V2_TEMPLATE_PACK_MISSING`：模板包未命中且不做 legacy 回落时抛出，message 列出查过的路径与各自的跳过原因（不存在 / 解析失败 / 缺 key）
- 修正 legacy 回落路径的诊断文案：模板节点在**哪个文件**查、为什么查，不再把 target fileKey 说成模板文件
- 显式声明 `template` 入参与 pack 查找的关系：`template` 只影响 legacy 模板寻址；当 pack 已命中时，渲染返回 warning `W_TEMPLATE_ARG_IGNORED`
- 解析器不再「读不到就静默跳过」：每个候选路径都记录 `{ path, state: missing | invalid | incomplete, reason }`，供返回值与错误 message 共用
- **BREAKING（行为面）**：pack 未命中且用户显式要求多部件模式（`GISOP_TEMPLATE_PACK` 指向的路径无效）时由「静默回落」改为硬失败

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `template-contract`: 「项目模板包」——查找结果必须可回显、每个候选路径的跳过原因必须可诊断；缺包不得静默回落
- `template-render`: 新增「模板解析可观测」要求——返回值必须带本次使用的 pack 摘要，`template` 入参冲突必须告警

## Impact

- `packages/figma-mcp-server/src/v2/template-config.ts`：`loadTemplatePack` / `loadPartsPack` 返回候选轨迹；新增 `resolvePackWithTrace`
- `packages/figma-mcp-server/src/v2/render.ts`：`bindTargetFile`（约 `:440-505`）重排诊断顺序，`RenderResult` 加 `pack` / `packMissing`
- `packages/figma-mcp-server/src/v2/render/parts/index.ts`：把 pack 摘要并入返回值
- `packages/figma-mcp-server/src/server/createServer.ts`：工具返回 schema 增加字段（向后兼容，仅新增）
- 测试：`tests/v2/template-pack-lookup.spec.ts`（8 例）扩候选轨迹断言；`tests/v2/render-*.spec.ts` 补缺包错误码与告警
- 文档：`packages/skill/references/template-contract.md` 补「解析可观测」小节；`openspec/HANDOFF.md` 坑 27 标记为已修
