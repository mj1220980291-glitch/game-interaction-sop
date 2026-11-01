## Why

真机（2026-10-31，page `4231:55123` / 文档 `4233:58395`）：多部件渲染 4 章 18 簇全部成功、176 个 stamp 全部写入，但 md 不变再跑一次同步返回

```json
{ "ok": true, "changes": [], "preserved": [
  { "kind": "foreign", "detail": "章节外框" } ×4,
  { "kind": "designer-deleted", "detail": "登录命名界面" }, …×4 ] }
```

即：同步没生效却报成功，还把 4 个章节全判成「设计师删了」。

根因两处：

1. `reconcile/snapshot.ts:203` 只扫 `sectionsContainer` 的**直属子级**找章节。多部件渲染按 `geometry.sectionShell` 给每章各套一层「章节外框」，章节在各自壳里 → 一个都扫不到。
2. `reconcile/layout.ts:165` 在渲染期用「第一个章节的父级」推容器并 `children()` 过滤，同样假设所有章节同父级；`render/parts/stamp-parts.ts` 又没给壳打标记 → 壳进 foreign。

官方 1.14 就是两层壳，所以这类项目的同步一直是假成功。

## What Changes

- 同步快照：章节改为「在 root 子树里按 stamp `kind: 'section'` 收集」，不再依赖同父级假设
- 渲染打标：多部件路径按父级链给每章的「章节外框」补 `{ kind: 'slot', role: 'template' }`，壳不再被判 foreign
- 渲染期 layout：章节收集同样改为全树按名字找，容器取外壳的共同父级（仅用于新增章节的落点与残留判定）
- 结构层不进 foreign：子树里含章节的容器一律当结构层跳过

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `render-reconcile-parts`: 「多部件文档渲染后携带标记」——结构层（章节外框）必须打标；章节发现不得依赖直属子级

## Impact

- `packages/figma-mcp-server/src/v2/reconcile/snapshot.ts`：章节收集与 foreign 判定
- `packages/figma-mcp-server/src/v2/reconcile/layout.ts`：`mapLayout` 的章节收集与容器推导
- `packages/figma-mcp-server/src/v2/render/parts/stamp-parts.ts`：按父级链补结构层标记
- 测试：新增 `tests/v2/reconcile-shell-sections.spec.ts`（壳内章节可识别、壳不打标也不吞章节）
- 已知遗留：新增章节仍直接插到容器下，不会自动套壳（`place` 只搬节点）——另立变更
