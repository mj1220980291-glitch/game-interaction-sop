## Why

SOP 现在默认要「策划文档」开场，真实场景里策划往往先给设计稿或 Figma 链接；先看图能直接读出界面结构，少问一整轮"这界面长什么样"。另外交付时正文旁的配图槽常留灰板，引擎虽然返回 `figuresPlaceholder`，但 skill 没有强制"截图看一眼 + 提醒用户补图"的动作，缺图就这样交付了。

## What Changes

- Phase 1 开场顺序改为**设计稿优先**：第一回合先问"有设计稿 / Figma 链接吗"，拿到图就以图为骨架提问；用户明确没有图时，才要策划文档。设计稿不是硬前置，不阻塞流程
- Phase 2 的「配图」改为**正文默认项**：除非整簇无任何可指认的视觉对象，每簇 SHALL 至少一条 `配图：`；允许显式声明"本簇无配图"并写理由，不允许静默不写
- Phase 4 渲染/同步成功后新增**配图审计**：对生成结果截图，逐章核对配图槽，缺图清单列到"章节 / 簇 / 配图描述 / 该做什么"，明确提醒用户手动配图；审计不阻塞交付，也不触发重渲染
- SKILL.md 的 Phase 切换规则、输出契约、description 同步；`phase1` / `phase2` / `phase3` / `phase4` 四份 phase 文件更新
- 版本号：skill `2.2.2` → `2.3.0`（行为变化，非修 bug）

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `skill-sop-workflow`: 新增「Phase 1 开场先索要设计稿」与「Phase 4 配图审计」两条行为要求；「每簇默认配图」作为 Phase 2 产出要求的一部分

## Impact

- 文档/流程侧：`packages/skill/SKILL.md`、`phases/phase1-analysis.md`、`phases/phase2-markdown.md`、`phases/phase3-asset.md`、`phases/phase4-figma.md`、`packages/skill/package.json` / `manifest.json`、根 `CHANGELOG.md`
- 引擎侧无改动：缺图统计已由 `render_v2_markdown_to_figma` 的 `summary.figuresPlaceholder` 与 `V2_W_FIGURE_ASSET_MISSING` 提供；截图用现成 `figma_capture_screenshot` / `figma_take_screenshot`
- 对老用户的影响：开局第一次回答要变成"有没有设计稿"；Phase 4 结束时多一轮截图审计输出
