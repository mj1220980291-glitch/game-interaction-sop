## 1. 标记与结构档案（可独立发布）

- [ ] 1.1 `reconcile/stamp.ts`：`DocStamp` 增 `structure?` 与 `parts?{structure, packHash, components}`，`parseStamp` 兼容旧标记
- [ ] 1.2 新增 `v2/template/pack-hash.ts`：由 `components` + `capabilities` 算 `packHash`（稳定排序后 sha256 前 16 位）
- [ ] 1.3 新增 `v2/reconcile/structure.ts`：`StructureProfile` 类型 + `legacyProfile`（沿用现有常量，行为零变化）
- [ ] 1.4 `reconcile/snapshot.ts`、`plan.ts` 的容器/槽位常量改为从 profile 取；legacy 全套测试保持绿
- [ ] 1.5 新增 `partsProfile`：`说明栏` / `#Title_Main` / `舞台` / `气泡` / `配图` / `正文/规则` / `标号/N`

## 2. parts 渲染打标

- [ ] 2.1 新增 `v2/render/parts/stamp-parts.ts`：`stampPartsDoc(backend, rootId, ir, layout, pack)`，按 D3 表挂 `section`/`cluster`/`item`/`slot`
- [ ] 2.2 `renderFromParts` 返回填充期收集的节点清单（章 / 簇 / 条目 / 槽位 id），供打标使用
- [ ] 2.3 `render.ts` 去掉 `loadPartsPack() === undefined` 的打标跳过，parts 成功后调用 `stampPartsDoc`；打标失败只记 warning
- [ ] 2.4 单测：parts 渲染产物根帧带 `parts.structure`，章节/簇/条目数量与 `ir` 一致

## 3. 同步入口分派

- [ ] 3.1 `reconcile/index.ts`：读 `doc` 标记后按 `structure` 选 profile；缺省 legacy
- [ ] 3.2 `packHash` 与当前包不一致 → `V2_PACK_MISMATCH`，不写画布
- [ ] 3.3 无标记仍返回 `V2_NOT_STAMPED`（含 parts 文档）
- [ ] 3.4 单测：三档入口行为（legacy / parts / 未标记）+ 指纹不匹配

## 4. 条目与配图的 parts 路径

- [ ] 4.1 `runFills` 支持裸配图槽：`rectId` 缺省时用 `groupId` 自身，legacy 行为不变
- [ ] 4.2 `snapshot.ts` 认 `正文/规则` TEXT 与 `配图` RECTANGLE 为条目，簇容器取 `说明栏`
- [ ] 4.3 手改判定、tombstone、外来节点规则复用现有实现对 parts 生效
- [ ] 4.4 单测：改文字 / 换图 / 手改保留 / 删条不重建（parts 结构）

## 5. parts scratch 与几何重算

- [ ] 5.1 把 `chapter.fit`、`chapter.stretch`、`placeBadges` 从 `parts/index.ts` 抽到 `parts/geometry.ts`
- [ ] 5.2 `renderScratch` 按 structure 分派：parts 用 `renderFromParts` + `stampPartsDoc`
- [ ] 5.3 scratch 解析器支持 parts 布局（章 / 簇 / 条目 id 映射）
- [ ] 5.4 同步写入后对受影响章节调用几何重算；未受影响章节不动
- [ ] 5.5 单测：新增簇走 scratch、标号数量重排、拖动过的标号坐标不被覆盖

## 6. 端到端与文档

- [ ] 6.1 真机跑链路 A：渲染 → 手改一句 → `target.rootId` 同步 → 校验 `preserved` / `changes`
- [ ] 6.2 真机跑模板重编后同步 → `V2_PACK_MISMATCH`
- [ ] 6.3 更新 `openspec/HANDOFF.md`：parts 同步可用、一次性重渲染要求、新增坑
- [ ] 6.4 同步 `openspec/specs/render-reconcile-parts/spec.md` 到主 specs（archive 时）
