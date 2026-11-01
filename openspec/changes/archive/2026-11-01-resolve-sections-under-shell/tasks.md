## 1. 读法（已实现）

- [x] 1.1 `snapshot.ts` 章节改为 `tree.findAll(root, kind === 'section')`
- [x] 1.2 `foreign` 判定：子树含章节的容器当结构层跳过
- [x] 1.3 `layout.ts:mapLayout` 同样改为全树收集 + `containerOfSections` 推共同父级
- [x] 1.4 `containerOfSections`：单一父级直接用；多父级取外壳的共同父级，否则 root

## 2. 打标（已实现，待真机）

- [x] 2.1 `stamp-parts.ts` 沿 `parentId` 链给章节外层补 `{kind:'slot', role:'template'}`
- [x] 2.2 真机确认壳节点有 stamp、`preserved` 里不再有 foreign 外框

## 3. 测试

- [x] 3.1 新增 `tests/v2/reconcile-shell-sections.spec.ts`（2 例：壳内章节可识别、壳无标也不吞章节）
- [x] 3.2 `tsc` + 全量测试（64 files / 517 tests）

## 4. 真机验收

- [x] 4.1 对 `4233:58395` 跑 dryRun 同步 → `changes: []`、无 `designer-deleted`
- [x] 4.2 正式同步 → 同上，且画布不被改动
- [x] 4.3 出图目视核对
