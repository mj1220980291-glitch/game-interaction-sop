## Why

**模板里「画在部件之外」的那个部分，从来没有被记录过。** 逐层比对原稿与产物后确认三处：

1. `docPadding` / `rootGap` / `footerGap` 三个字段 `schema.ts` 里有，`src/v2/compile/` 里**一行采集代码都没有**。任何项目编包这三个值必然是空，除非有人手工量——蛋仔包现在的 `60 / 60 / 200` 就是手工补的。
2. 缺了不吭声：`auditPackFields` 只看 `sectionShell` 与底色，这三项缺失无任何提示，产物表现为「内容贴边、块贴块、结尾一刀切」，只有肉眼能看出来。
3. 反过来，`sectionShell` 的告警会误伤：模板把黑边画在**文档根**（蛋仔：根帧 padding 左右 60 + `#232429`）时，章节本来就没有外框，却每次渲染都提示「黑边与卡片底色会缺」。

另外两类配置同样「只在本机、丢了不响」，与 2026-11-11 蛋仔包丢失是同一个病：

- 职能标签变体 key（`@GUI` 等 7 个）在 `~/.game-interaction-sop/template.json`
- 书写契约 `md-contract.md` 由人工落盘，蛋仔那份已随包一起丢失

## What Changes

- **编译期自动采 `docPadding` / `rootGap` / `footerGap`**：从原稿根节点内边距、同级块间距、结尾前留白/间距量；量不到写 `gaps` 点名，不再依赖手工
- **`auditPackFields` 增加两项判据**：`docPadding` 有值时不再催 `sectionShell`（黑边已由文档根表达）；三项留白全缺且模板有留白时点名
- **明确不采 `placeholder` / `bubbleGrid`**，理由写进契约：占位灰用默认值即可；标号位置属每篇文档的 `badgeAnchors`，模板网格记下来只会被误当成「已对位」
- **`roleBlock` 进模板包**：`TemplatePack.roleBlock`（`variantKeys` / `variantPrefix` / `labelTextName`），解析优先级 **包 > 用户配置**；蛋仔包随包分发 7 个变体 key
- **书写契约改为「从包派生」**：`md-contract` 不再要求人工保存文件，`phase=contract` 可随时从包里重建；并注明 `需求组` 行在模板无此槽位时可省略

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `template-geometry`：编译期 SHALL 采集文档级留白三项
- `template-compile`：`phase=contract` 可只凭包重建书写契约
- `template-render`：`roleBlock` SHALL 支持从包解析；观感告警不得在留白已表达时误报
- `template-contract`：写明文档级留白与「不采 placeholder/bubbleGrid」的理由

## Impact

- `packages/figma-mcp-server/src/v2/compile/geometry.ts`（新增文档级采集）、`compile/index.ts`（verify / compile 两路透传）
- `packages/figma-mcp-server/src/v2/pack-audit.ts`（告警判据）
- `packages/figma-mcp-server/src/v2/template/schema.ts`（`roleBlock` 字段）
- `packages/figma-mcp-server/src/v2/render.ts` / `role-block.ts`（解析优先级）
- `packages/figma-mcp-server/assets/packs/蛋仔派对.json`（补 `roleBlock`）、`default.json`（补 `roleBlock` 若库内可采）
- **不在范围**：章节标题跨两列的排版重构（2026-11-11 决定不改）
