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
