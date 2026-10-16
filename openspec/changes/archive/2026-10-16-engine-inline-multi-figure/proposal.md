## Why

上一个 change（`sop-feedback-style-motion-figure-inline`）已把 v2 Markdown 契约改为「`配图：` 紧跟它说明的规则，一簇可多张」，但引擎仍按旧语义渲染：每个说明块（或每个 `####` 槽位段）只取**第一条** `配图：` 的描述，固定放在**块/段末尾**，其余配图描述直接丢失。设计师手改时一簇贴了多达 6 张图、逐条穿插，引擎产物与之差距最大，契约与渲染不一致必须先补上。

本 change 只处理「一簇多图原位渲染」；配图框尺寸按比例 + 确定性裁剪、增量渲染另开 change。

## What Changes

- 说明块内 `正文/规则` TEXT 与 `配图` GROUP 的堆叠顺序 SHALL 与 Markdown 中 bullet 顺序一致：每条 `配图：` 渲染为紧跟其前一条规则的一个 `配图` GROUP。
- 一个说明块（无 `####`）或一个 `####` 槽位段内 SHALL 允许多个 `配图` GROUP，每个写入各自的描述。
- 扁平路径（无 `####`）分两种：
  - 无配图 → 沿用原路径，backend 调用序列不变（保持向后兼容承诺）
  - 有配图 → 走「先建后删」原位组装：按 bullet 顺序追加克隆，再删除模板原有正文与配图。顺带修复现存隐性 bug：旧路径复用模板原位节点，`说明块01` 内 ≥3 条 bullet 时唯一的配图实际落在第 2、3 条之间
- `####` 槽位路径：每段内按 bullet 顺序组装；连续的规则 bullet 仍合并为一次 `batchCloneNodes`，没有配图的段调用序列不变；配图描述改为整块一次批量写入。
- 移除 skill 侧与 `markdown-v2-contract` 主 spec 中「引擎仅渲染首个配图描述到簇末」的已知差距说明。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `figma-template-1-14-rendering`：新增「配图按 bullet 原位渲染且一簇多张」需求；修改「簇内子分类小标题渲染」中 `配图` 组装规则（每段仅首个 → 按 bullet 原位、可多个）。
- `markdown-v2-contract`：修改「配图 bullet 原位插入且一簇允许多张」需求，删除已知差距表述。

## Impact

- `packages/figma-mcp-server/src/v2/render.ts` — `fillBlockContent`（扁平路径原位分支）、`fillGroupSlots`（段内原位组装）、新增共享的原位组装 helper
- `packages/figma-mcp-server/tests/v2/` — 新增原位多图渲染测试；现有 `render-image-seed` / `render-subgroups` 测试须保持通过
- `packages/skill/references/markdown-v2-spec.md` — W3 删除已知差距说明
- **不影响**：parser、IR、backend 接口（只用已有的 `cloneNode` / `batchCloneNodes` / `deleteNodes` / `scanSubtree`）
- **成本**：多图簇的 RTT 增加（每张图 1 次克隆 + 1 次 scan 写描述），30s 超时风险略升；单图在末尾的常见情况不受影响
