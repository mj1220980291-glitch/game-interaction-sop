## 1. Phase 1 · 设计稿优先

- [x] 1.1 `phases/phase1-analysis.md` 新增「开场材料引导（设计稿优先）」段：第一回合先问设计稿 / Figma 链接，无图给策划文档分支，写明不构成硬门禁
- [x] 1.2 同文件「入场材料识别（双入口）」开头改为"由 Agent 主动索要后判定"，路径 A/B 判定条件不变
- [x] 1.3 `SKILL.md` Phase 1 行、Phase 切换规则表 Phase 1 行、输出契约 Phase 1 行改为"入场路径判定（先要图）"

## 2. Phase 2 · 每簇默认配图

- [x] 2.1 `phases/phase2-markdown.md` 增加「每簇默认配图」规则：至少一条 `配图：`，例外写 `- 配图：无（理由：…）`
- [x] 2.2 同文件自检清单新增 `[ ] 每簇配图已覆盖（或写明无配图理由）`，并列出未覆盖簇编号
- [x] 2.3 同文件说明与 W3 叠加关系（W3 管放哪，本规则管有没有）

## 3. Phase 4 · 配图审计

- [x] 3.1 `phases/phase4-figma.md` 新增「配图审计」小节：读引擎统计 → 按章截图 → 合并清单 → 提醒用户
- [x] 3.2 结果 A（渲染成功）模板加 `配图审计` 行与缺图提醒句
- [x] 3.3 结果 D（同步完成）模板加同一审计行
- [x] 3.4 写明审计不阻塞交付、不触发重渲染；用户说"先这样"直接进 Phase 5
- [x] 3.5 写明"用户主动要求不配图"时的清单标注口径

## 4. Phase 3 · 口径对齐

- [x] 4.1 `phases/phase3-asset.md`「配图资产」段开头说明配图条目已由 Phase 2 保证，Phase 3 不再问"要不要配图"，只做映射

## 5. 版本与变更日志

- [x] 5.1 `packages/skill/package.json` / `packages/skill/manifest.json` / 根 `package.json` version → `2.3.0`（`engineVersion` 不变）
- [x] 5.2 `packages/skill/SKILL.md` frontmatter description 加入"设计稿 / Figma 链接"
- [x] 5.3 `CHANGELOG.md` 增 `v2.3.0` 条目，列两条行为变化

## 6. 校验

- [x] 6.1 `npx openspec validate skill-design-first-and-figure-audit --strict` 通过
- [x] 6.2 通读 `SKILL.md` + 四份 phase 文件，确认"先要图"与"配图审计"在三处描述无矛盾
- [x] 6.3 `npm run build` + `npm test` 仍全绿（本轮不改代码，作回归确认）

## 7. 验收返工（外部验收发现 4 CRITICAL + 6 WARNING）

- [x] 7.1 C1 · `phase1-analysis.md` 第一回合模板加硬约束，情况 A/B 模板首行改为材料确认句
- [x] 7.2 C2 · `phase2-markdown.md` 删除"不加配图"清单，改为"主图已覆盖也必须写配图或走例外"
- [x] 7.3 C3 · `phase3-asset.md` 记录 `figure_opt_out`，`phase4-figma.md` 审计触发条件改读该标记
- [x] 7.4 C4 · `phase2-markdown.md` 例外写法增加"用户显式 opt-out"出口（四类判据）
- [x] 7.5 W1 · `phase1-analysis.md`「不准反复索要」限定作用域为同一阶段
- [x] 7.6 W2 · `markdown-v2-spec.md` T10 示例去掉"可选"，改"SOP 产出默认必配"
- [x] 7.7 W3 · `SKILL.md`「何时启用本 skill」加入设计稿 / Figma 链接 / 配图检查信号
- [x] 7.8 W4 · `packages/skill/README.md` 阶段表改为设计稿优先 + 默认配图 + 配图审计
- [x] 7.9 W5 · `phase4-figma.md` 写明超 8 章未截部分如何进清单（状态 `待核对`）
- [x] 7.10 W6 · `phase4-figma.md` 状态枚举补 `无配图（例外）` / `待核对`，例外簇不计入缺图
- [x] 7.11 返工后重跑 6.2 通读核对：无残留"配图可选 / 只在需要时加"口径

## 8. 第二轮验收返工（2 CRITICAL + 2 WARNING + 2 建议）

- [x] 8.1 逐条核对 `配图：` 相关写法（例外 / 指向主图 / opt-out）在引擎 render 路径有对应处理，参照 `packages/figma-mcp-server/src/v2/render/parts/index.ts:700-740`
- [x] 8.2 引擎识别声明式无配图：`reconcile/stamp.ts` 新增 `isDeclaredNoFigureBullet` / `isFigureSlotBullet`；`render.ts`、`render/parts/index.ts`、`reconcile/layout.ts` 全部改走 `isFigureSlotBullet`，不建槽、不画灰板、不计 `figuresPlaceholder`、不抛 `V2_W_FIGURE_ASSET_MISSING`
- [x] 8.3 单测：`tests/v2/render-figure-assets.spec.ts` 增「声明式无配图」用例（簇 2 无图槽、`figuresPlaceholder === 0`、无 `V2_W_FIGURE_ASSET_MISSING`）
- [x] 8.4 `phase4-figma.md`：`figure_opt_out` 短路 warnings 逐条说明；结果 A 模板补「按你要求未配图」
- [x] 8.5 `CHANGELOG.md` v2.3.0 按现状重写（四类例外判据 / opt-out 整节跳过 / package-lock 版本口径 / 引擎行为）
- [x] 8.6 `markdown-v2-spec.md` W3 收录 `- 配图：本界面主图，<区域>`；`phase3-asset.md` 补该来源映射与「例外条目不编键」
