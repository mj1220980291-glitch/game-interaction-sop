## Context

`renderInner`（`packages/figma-mcp-server/src/v2/render.ts`）对 section 的处理逻辑：
1. 将 `masterSectionGroup`（模板中的 `界面说明1`）用作 section 1 的容器，直接 `renderSection`
2. section 2-N 在循环内依次 `cloneNodeSafe(masterSectionGroup)` 后立即 `renderSection`

问题：step 1 执行完毕时 masterSectionGroup 已被填满（气泡 ①②③、说明块 ①②③），step 2 克隆的是"已填满"的节点，后续 renderSection 无法感知并清理这些遗留子节点。

## Goals / Non-Goals

**Goals:**
- 多 section 文档中，每个 section 的气泡 frame 和说明块均从空白模板状态开始填充
- 修复不引入额外的 MCP RTT（克隆操作本身是必须的，只是顺序调整）

**Non-Goals:**
- 不修改 IR / parser / FigmaBackend 接口
- 不改变单 section 文档的渲染行为
- 不处理「重跑同一实例」场景（那是另一个独立问题）

## Decisions

### D1：两阶段拆分 — 先全量克隆，再依次渲染

**做法**：在 `renderInner` 的 section 循环前，新增一个克隆阶段：

```
阶段 1：克隆（masterSectionGroup 尚为空白）
  sectionNodes[0] = masterSectionGroup          // section 1 直接复用
  sectionNodes[1] = clone(masterSectionGroup)   // ← 克隆空白模板
  sectionNodes[2] = clone(masterSectionGroup)   // ← 克隆空白模板
  ...

阶段 2：渲染（sectionNodes 全部是干净的）
  renderSection(sectionNodes[0], sections[0])
  renderSection(sectionNodes[1], sections[1])
  renderSection(sectionNodes[2], sections[2])
```

**为什么不用 batchCloneNodes**：section clone 需要依次 append 到 `parentOfSections`（需要 parentId），且数量通常 ≤ 16，单次 cloneNodeSafe 串行 RTT 可接受；batchCloneNodes 可作为后续优化。

**备选方案：在 renderSection 入口清理残留节点**
- 需要识别"哪些是遗留的、哪些是模板原生的"——命名歧义，容易误删
- 逻辑分散，不如时序拆分干净

### D2：`removeSparesExceptMaster` 调用时机不变

现有代码在循环外调用 `removeSparesExceptMaster` 清理模板中可能存在的多余 `界面说明X` sibling，这个调用在阶段 1 克隆之前执行，顺序不变。

## Risks / Trade-offs

- **RTT 略增**：N sections → 阶段 1 需要 N-1 次 cloneNodeSafe RTT，再加上阶段 2 的 renderSection RTT。但原有代码也是 N-1 次 clone，顺序调整不增加 RTT 总量。
- **内存**：sectionNodes 数组在内存中保存 N 个 NodeInfo，N ≤ 16，可忽略。
- **单 section 文档**：N=1 时阶段 1 什么都不做，行为完全不变。
