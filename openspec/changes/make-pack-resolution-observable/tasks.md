## 1. 解析轨迹（纯函数）

- [x] 1.1 `template-config.ts` 新增 `PackCandidate` / `PackResolution` 类型与 `resolvePackWithTrace(opts)`
- [x] 1.2 4 个候选路径逐个记 `state`：`missing` / `invalid`（带 JSON 或协议错误摘要）/ `incomplete`（带缺的 key）/ `hit`
- [x] 1.3 `loadTemplatePack` / `loadPartsPack` 改为 `resolvePackWithTrace().hit` 的薄封装
- [x] 1.4 `GISOP_TEMPLATE_PACK=off` 记录为 `disabledByEnv`，不产生 4 项候选

## 2. 测试先行

- [x] 2.1 `tests/v2/template-pack-lookup.spec.ts` 补 4 例：mixed 轨迹、invalid 摘要、incomplete 缺 key、`off`
- [x] 2.2 加断言锁定「`loadTemplatePack` 与 `resolvePackWithTrace` 对同一 cwd/env 结果一致」

## 3. 渲染返回值

- [x] 3.1 `RenderResult` 增加 `pack` / `packMissing` / `packCandidates`（均可选）
- [x] 3.2 `renderV2MarkdownToFigma` 入口解析一次，替换 `:233` 的 `packCaps`、`:471` 的 `loadPartsPack`、parts 路径内的重复查询
- [x] 3.3 成功分支填充 `pack` 摘要（6 字段）；失败分支在缺包时填充 `packMissing` + `packCandidates`
- [x] 3.4 `server/createServer.ts` 工具返回 schema 同步新增字段

## 4. 诊断与错误码

- [x] 4.1 新增错误码 `V2_TEMPLATE_PACK_MISSING`；仅在 `$GISOP_TEMPLATE_PACK` 显式指向 invalid / incomplete 时抛出（设计 D3 三态表）
- [x] 4.2 `bindTargetFile` 重排：缺包先出轨迹，再说明 legacy 回落
- [x] 4.3 重写 `V2_TARGET_FILE_UNREACHABLE` message（三段式，区分目标文件与模板文件，保留原错误码与 bridge 提示句）
- [x] 4.4 无 `target` 的 `cloneNode: source not found` 归一到 `V2_TEMPLATE_PACK_MISSING` 并前置缺包说明
- [x] 4.5 pack 命中且传了 `template.fileKey/nodeId` 时产出 `W_TEMPLATE_ARG_IGNORED`

## 5. 回归

- [x] 5.1 `tests/v2/render-*.spec.ts` 补缺包三态、`template` 忽略告警、message 文案断言
- [x] 5.2 `npm run build && npm test` 全绿；`openspec validate --strict` 通过
- [x] 5.3 真机：用 `32LjMNqRsQOFEwbx3k3iQ3` / `4216:41110` 起一次 M1 渲染，确认返回带 `pack.path` 与 `origin=cwd`
- [ ] 5.4 真机：临时 `GISOP_TEMPLATE_PACK` 指向坏文件，确认 `V2_TEMPLATE_PACK_MISSING` 列出路径与原因

## 6. 文档

- [x] 6.1 `packages/skill/references/template-contract.md` 补「解析可观测」小节（字段表 + 三态表）
- [x] 6.2 `openspec/HANDOFF.md` 坑 27 标记已修，补返回值字段示例
- [x] 6.3 `引擎问题反馈.md` 中 P0-1 / P0-2 标注对应 change 名
