## Context

`packages/figma-mcp-server/src/v2/parser.ts`（旧版，459 行）是 figma-mcp-server 包自带的独立 parser，与 `packages/engine/src/v2/parser.ts`（新版，749 行，支持 `BulletGroup`/`####`）并行存在。

当前 cluster body 扫描逻辑（`parseClusters` 内）对每一行做：

```
匹配 /^\s*[-*]\s+(.*)$/  → push bullet
else 非空行             → push t.trim()（此处 "#### 基础信息" 被吞入）
```

`####` 行不匹配 bullet 正则，落入 else 分支，原文字面量被推进 `bullets[]`。

## Goals / Non-Goals

**Goals:**

- `####` 行不再出现在 `SemanticCluster.bullets[]` 里
- 加入 `STRIP_H4` 开关，默认 `true`（strip）；flag 翻为 `false` 时恢复原行为，为日后统一到 engine parser 保留切换路径
- 补充测试：含 `####` 的 fixture 跑完后 bullets 干净

**Non-Goals:**

- 不尝试渲染 `####` 内容到 Figma（那是 Change B 的事）
- 不修改 engine parser 或 engine IR
- 不修改 render.ts

## Decisions

### D1：直接 skip 还是保留为带标记的结构？

**选 skip（推入时过滤掉）**，不选 `{ type: 'h4-title', text }` 结构。

原因：当前 render.ts 只消费 `bullets: string[]`，没有消费 `####` 语义的地方。做结构保留需要同步改 render.ts 才能看到效果，改动范围扩大。待 Change B 统一 parser 时 render.ts 会升级为支持 `groups[]`，届时此 skip 逻辑一并废弃即可。

### D2：`STRIP_H4` 放哪里？

放在 `parseClusters` 函数签名的可选 options 参数里（`{ stripH4?: boolean }`），默认 `true`。

不做全局常量，原因：将来若 createServer.ts 需要切换行为，可以在调用点控制，不需要改 parser 文件。

### D3：测试 fixture 用新文件还是复用 buzhong.md？

新建 `packages/figma-mcp-server/tests/fixtures/h4-strip.md`，包含 1 个 `### 簇` 内有 2 个 `####` 分组、共 5 条真实 bullet。

原因：buzhong.md 是 happy-path 基线，不要在它上面叠 #### 行为测试（影响基线干净性）。

## Risks / Trade-offs

| 风险 | 缓解 |
|---|---|
| `####` 内容在 Figma 里完全不可见 | 已知且接受；脏数据问题更优先；Change B 解决可见性 |
| `STRIP_H4=false` 时行为退回旧版（脏数据） | flag 只在迁移路径用，不对外暴露，不做文档 |
| 旧 fixture 若含 `####` 行可能破坏既有测试 | grep 检查：当前所有 fixtures 均无 `####` 行，安全 |

## Migration Plan

1. 改 `parseClusters`，加 `####` 行检测（2-3 行）
2. 加 `STRIP_H4` 默认 true 的 options 参数
3. 新建 fixture + 测试用例（1 个 happy-path：bullets 干净；1 个 edge：只有 #### 无真实 bullet → bullets 为空数组）
4. 跑 `pnpm test`，确认全绿
5. 无需 migration 步骤，parser 是无状态函数，无数据库/存储变更

## Open Questions

无。
