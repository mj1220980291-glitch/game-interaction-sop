## 1. 复现 27 例

- [x] 1.1 静态定位：`collectClusterLayout` 的 `loose` 只从 `clusterItems()` 的条目顺序推，模板自带但没进 `ordered` 的空槽不会进 `loose` → 不隐藏（27 例最可能成因）
- [x] 1.2 真机复核：M1 渲染后统计 `visible=false` 的配图组数量（改后应等于模板自带空槽数）
- [ ] 1.3 若真机仍有残留，按 design Open Questions 继续查 `setNodeVisible` 与 `refreshChapterGeometry`
- [x] 1.4 结论写进 `design.md`（D2 兜底已实现，见任务 2.3）

## 2. 三态与账本

- [x] 2.1 `FigureState` 增加 `placeholders` 计数（`filled` / `placeholder` 分开统计）
- [x] 2.2 `PartsRenderResult.summary` 增加 `figuresPlaceholder`；`RenderResult.summary` 透传
- [x] 2.3 `collectClusterLayout` 的 `loose` 改为「子树全部配图组 − 已认领」求差集（含裸矩形槽）
- [x] 2.4 `summary.figuresPlaced` 只计真正填图数，占位另计
- [ ] 2.5 legacy 路径 `fillImages`（`render.ts:1559-1650`）对齐同一套三态（该路径无 parts layout，暂只透传计数）

## 3. 缺资产告警

- [x] 3.1 新增软告警码 `W_FIGURE_ASSET_MISSING`，逐条带章节 / 簇 / asset key
- [x] 3.2 `skip` 与 `figma_node` 不报警；缺失 / 不支持的类型计为占位并报警
- [x] 3.3 补测试：声明 1 条不给资产 → 1 条告警、`figuresPlaceholder=1`

## 4. 置图后收尾与配对键

- [x] 4.1 置图成功后删除槽内占位文案层（后端 `fillFigurePlaceholder` 已有，确认主图 / 配图两条路径都带 `hintId`）
- [x] 4.2 清描边同样已由后端完成（`rect.strokes = []`）
- [x] 4.3 配对依据改用既有 `stamp.asset`（原设计的 pluginData 方案否决，见 design D3）
- [ ] 4.4 测试：渲染 → 同步（描述不变）零变更；老产物（无 stamp.asset）走文本回退零变更

## 5. 同步三态

- [x] 5.1 新增条目：由 scratch 管线供给新槽并填图（已有行为，补测试锁定；原「复用隐藏槽」方案按 design D5 否决）
- [x] 5.2 删除条目：未手改整组删除；手改报冲突并保留（已有行为，补测试锁定）
- [x] 5.3 描述变更：只更新占位文案与 stamp，不重建节点（已有行为，补测试锁定）
- [x] 5.4 人工槽：走 `preserved: foreign` 保留（不新增 `W_FIGURE_SLOT_ORPHAN`，现有通道已覆盖，见 design D6）
- [ ] 5.5 同步后统一重算章节几何，断言无空白 / 压叠（几何重算已在 `refreshChapterGeometry`，缺一条针对删槽的断言）

## 6. 回归与真机

- [x] 6.1 单测：三态矩阵、账本优先、增删改三类同步（`render-parts.spec.ts` + `reconcile.spec.ts` 共 7 例）
- [x] 6.2 `npm run build && npm test` 全绿；`openspec validate --strict` 通过
- [x] 6.3 真机：M1 全量渲染，手工修补清单里的「删 27 空配图框」「删占位文案」两项应降为 0
- [x] 6.4 真机：对 `4221:51589` 跑一次同步（md 不变）→ `changes` 为空

## 7. 文档

- [x] 7.1 `packages/skill/references/template-1-14.md` 补三态表与配对键说明
- [x] 7.2 `引擎问题反馈.md` 中 P1-3 / P1-4 / P1-5 / P2-11 标注对应 change 名（已在小节标题下标注）
