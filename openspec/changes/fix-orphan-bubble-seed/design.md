## Context

模板 `1:14` 的 `气泡` FRAME 节点树：

```
气泡 (id: 1:113)
  ├─ 标号/2  (id: 1:114)  ← childIds[0]，find 返回这个
  └─ 标号/1  (id: 1:118)  ← childIds[1]，永远不会被触碰
```

`fillCluster` 每次 re-fetch bubbleFrame 的 childIds，取 `find(startsWith('标号/'))` → 始终拿到 `标号/2`。`标号/1` 作为孤儿一直存在于 frame 里，显示模板默认数字，和真正渲染的 ① 视觉叠加。

## Goals / Non-Goals

**Goals:**
- 每个 section 在 cluster 循环开始前，bubbleFrame 里恰好有 1 个种子节点

**Non-Goals:**
- 不修改模板本身（不改 Figma 文件）
- 不重构 fillCluster 的 bubble clone 逻辑

## Decisions

### D1：在 renderSection 的 cluster 循环前 trim bubbleFrame

位置：`renderSection` 拿到 `bubbleFrame` 之后、`for (ci=0; ...)` 之前。

```typescript
// Trim extra seed bubbles from template (1:14 ships with [标号/2, 标号/1]).
// Keep only the first; extras become orphans that duplicate bubble ①.
const bubbleFrameInfo = await backend.getNodeInfo(bubbleFrame.id);
const allBubbleSeedIds = (bubbleFrameInfo.childIds ?? []);
if (allBubbleSeedIds.length > 1) {
  await backend.deleteNodes(allBubbleSeedIds.slice(1));
}
```

不需要 filter by name — bubbleFrame 里只应该有 `标号/N` 节点，所有多余的都删。

## Risks / Trade-offs

- 如果未来模板设计师有意在 bubbleFrame 里放多个种子（不太可能），这里会把额外的删掉。可接受。
- RTT：一次额外的 `getNodeInfo` + 一次 `deleteNodes`（batch）。仅在有多余种子时触发，每个 section 最多 2 次 RTT 增量。
