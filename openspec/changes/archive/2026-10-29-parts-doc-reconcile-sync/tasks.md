## 1. 标记与结构档案（可独立发布）

- [x] 1.1 `reconcile/stamp.ts`：`DocStamp` 增 `structure?` 与 `parts?{structure, packHash, components}`，`parseStamp` 兼容旧标记
- [x] 1.2 新增 `v2/template/pack-hash.ts`：由 `components` + `capabilities` 算 `packHash`（稳定排序后 sha256 前 16 位）
- [x] 1.3 新增 `v2/reconcile/structure.ts`：`StructureProfile` 类型 + `LEGACY_PROFILE`（沿用现有常量，行为零变化）
- [x] 1.4 `snapshot.ts` / `plan.ts` 的容器与配图形态改由 profile 决定；legacy 全套测试保持绿
- [x] 1.5 新增 `PARTS_PROFILE`：单层配图槽 + parts scratch

## 2. parts 渲染打标

- [x] 2.1 新增 `v2/render/parts/stamp-parts.ts`：`stampPartsDoc(backend, layout, ir, pack)`，按 D3 表挂 `section`/`cluster`/`item`/`slot`
- [x] 2.2 `renderFromParts` 返回填充期收集的节点清单（顶部 / 章节 / 簇 / 条目 / 标号 id）
- [x] 2.3 `render.ts` 去掉 parts 跳过打标的分支，parts 成功后调 `stampPartsDoc`；打标失败只记 warning
- [x] 2.4 打标对位：真机渲染 2 章 3 簇 → `structure: parts`、`packHash` 存在、`section ×2`、`cluster ×3`、`item ×4`（3 规则 + 1 配图），与 `ir` 一致；纯函数层由 `parts-reconcile-units.spec.ts` 覆盖

## 3. 同步入口分派

- [x] 3.1 `reconcile/index.ts`：读 `doc` 标记后按结构选 profile；缺省 legacy
- [x] 3.2 `packHash` 与当前包不一致 → `V2_PACK_MISMATCH`，不写画布（真机验过：`0592116b992a260c → ae4609e2841f79de`）
- [x] 3.3 无标记仍返回 `V2_NOT_STAMPED`（含 parts 文档）
- [x] 3.4 入口行为：单测覆盖 `profileFor` 三档；parts / 未标记 / 指纹不匹配三档在真机验过

## 4. 条目与配图的 parts 路径

- [x] 4.1 `runFills` 支持裸配图槽：`rectId` 缺省时用条目节点自身，legacy 行为不变
- [x] 4.2 `snapshot.ts` 认 `正文/规则` TEXT 与 `配图` RECTANGLE 为条目；条目在内容层里时按子孙遍历，插入/移动落在 `itemsParent`
- [x] 4.3 手改判定、tombstone、外来节点规则复用现有实现对 parts 生效（外壳节点不再误报 foreign）
- [x] 4.4 真机验过：改文字（`update`）、换图（`asset` + `imageHash` 9d800e… → a9785d…、描边清空）、手改保留（`hand-edit`）、删条不重建（`designer-deleted` 且跨多次同步粘住）

## 5. parts scratch 与几何重算

- [x] 5.1 `chapter.fit`、左列贴合、`placeBadges` 从 `parts/index.ts` 抽到 `parts/geometry.ts`
- [x] 5.2 `renderScratch` 按结构分派：parts 用 `renderFromParts` + `stampPartsDoc`
- [x] 5.3 scratch 解析器支持 parts 布局（章 / 簇 / 条目 / 标号 id 映射）
- [x] 5.4 同步写入后对受影响章节调用 `refreshChapterGeometry`；未受影响章节不动
- [x] 5.5 真机验过：新增簇（`01/3 insert`，说明栏 3 簇、标号 3 个、章节 978 与左列齐）、簇删除（标号 3→2）、标号在网格位（(1063,186) = 1700/280 按 1200×719 缩放）、拖动过的标号 (300,500) 在后续同步中不被覆盖

## 6. 端到端与文档

- [x] 6.1 真机跑链路 A：渲染 → 手改一句 → `target.rootId` 同步 → `preserved` 有 `hand-edit`、`changes` 只含 MD 改的那条
- [x] 6.2 真机跑模板重编后同步 → `V2_PACK_MISMATCH`
- [x] 6.3 更新 `openspec/HANDOFF.md`：parts 同步可用、一次性重渲染要求、新增坑
- [x] 6.4 同步 `openspec/specs/render-reconcile-parts/spec.md` 到主 specs（archive 时）
