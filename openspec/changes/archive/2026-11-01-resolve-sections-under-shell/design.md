## Context

多部件文档的树形是 `root → 章节外框 → 界面说明N → 列/簇`（壳层数由 `geometry.sectionShell` 决定，官方 1.14 是两层）。同步侧两处按「章节是容器直属子级」写死，遇到壳就全盘失效。真机表现为 `ok: true` + `changes: []` + 全部章节 `designer-deleted`。

## Goals / Non-Goals

**Goals：** 章节发现与壳层无关；结构层不被当成人工节点；老产物不用重渲染也能同步。

**Non-Goals：** 新增章节自动套壳（`place` 只搬节点，另立变更）；改 `sectionShell` 的采集与渲染。

## Decisions

### D1：按 stamp 收集，不按树形位置

`tree.findAll(root, n => n.parsed?.kind === 'section')`。理由：stamp 是引擎自己写的确定信息，树形位置随模板而变。

替代方案：递归找名字以「界面说明」开头的节点。否决——人工改名就断，且不能区分「设计师复制的章节」。

### D2：结构层判定用「子树里有没有 stamped 章节」

容器直属子级里，凡是子树包含章节的就不进 foreign。这同时覆盖「壳打了标」和「壳没打标」两种产物。

### D3：渲染期也给壳打标

`stamp-parts.ts` 里从章节节点沿 `parentId` 往上走到 root，逐层补 `{kind:'slot', role:'template'}`。理由：以后若有代码按「无 stamp = 人工」判断，壳必须显式归属引擎。

### D4：`mapLayout` 的容器只用于两件事

新增章节插到哪、残留节点扫描范围。取外壳的共同父级；找不到共同父级就用 root。

## Risks / Trade-offs

- [给 root 直属子级打 template 标，可能把人工节点也标成引擎所有] → 只对「子树含章节」的节点补标，其它不动
- [老产物壳无标，靠 D2 兜住] → 已有单测覆盖「壳没打标也能找到章节」
- [新增章节落点仍在容器层，不套壳] → 已知遗留，写进 proposal 的 Impact

## Migration Plan

1. 快照与 layout 改读法（纯读，不改画布）
2. 渲染侧补壳标记，仅影响新产物
3. 老产物无需迁移：D2 兜底
