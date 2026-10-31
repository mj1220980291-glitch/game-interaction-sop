## Context

创建路径（`renderV2MarkdownToFigma`，`render.ts:227`）与同步路径（`reconcileWithRetry`，`:412`）是对称的两条路，但健壮性不对称：

| 能力 | 创建 | 同步 |
|---|---|---|
| 桥探活 | 有，但默认关（`GISOP_PREFLIGHT=1`） | 无 |
| 瞬时错误重试 | **无** | 有（2 次尝试、5s 间隔、`isTransientBridgeError` 判据） |
| 落点 | 无参数，`createFrame` 不传 x/y → `(0,0)` | 跟随原文档 |
| 错误形态 | message 拼原始异常 + 节点 dump | 同 |

真机现象：`figma_get_status` 说已连接，`render` 报 `Cannot connect`（桥的假阴性，`HANDOFF` 坑 26 同源），第三次调用成功。用户体感是「随机失败」。

落点：`render/parts/index.ts:199` 的 `createFrame` 只传 name / width / height，Figma 落到 `(0,0)`。

## Goals / Non-Goals

**Goals:**

- 新文档默认不压设计稿（可显式指定位置，或自动找空位）
- 一次瞬时连接错误不导致整次渲染失败，且重试对产物无副作用
- 报错一眼能看出结论，明细按需展开

**Non-Goals:**

- 不解决桥的假阴性根因（探活误报在 `bridge-port-stability` 范畴，且探活默认关是刻意的）
- 不改同步的落点（同步本来就贴着原文档）
- 不做「自动排版已有文档」（只决定新文档落点）
- 不改 `warnings` 的语义，只改呈现（聚合）

## Decisions

### D1：落点参数优先于自动摆放

`position` 显式给就精确落点；`autoPlace` 只在无 `position` 时生效；两者都给 → `position` 胜，返回软告警 `W_POSITION_OVERRIDE`。

替代方案：只做自动摆放。否决——真机里人要的是「放到我预留的那块空白」，算法猜不准，最后还是要挪。

### D2：`autoPlace` 用现有子节点包围盒，不做空隙搜索

`below`：`y = max(child.y + child.height) + gap`，`x` 与最宽子节点左边对齐；`right`：`x = max(child.x + child.width) + gap`，`y` 与最上子节点顶对齐。`gap` 取 `geometry.rootGap ?? 100`。

一次 `scanPageChildren` 就够，复杂度 O(n)。不做「找最大空隙」——真机页面上是散落的设计稿，空隙搜索的收益不如可预测的位置大。

取不到页面子节点（后端无该能力 / 报错）→ `(0,0)` + `W_AUTOPLACE_FALLBACK`。

### D3：重试放在最外层，包住整轮创建

复用 `reconcileWithRetry` 的判据与注入手法（`isTransientBridgeError`、可注入 `sleep` / `run`），新建 `renderWithRetry`。

安全前提：创建路径失败时已有回滚（「失败回滚」要求：撤销点 + 删本次根帧）。重试前先跑一次回滚，避免留下半成品被下一轮影响。

替代方案：只在写操作批次内重试。否决——批次之间共享 `rootInstanceId` 等状态，局部重试会重复克隆。

### D4：错误 message 收敛，明细结构化

规则：

- `message` 只保留「结论 + 一句原因」，硬上限 200 字符，超长截断并加 `…`
- 原始异常、节点列表、选区 dump 放 `details`（对象），工具层序列化为第二段
- 同一类问题多条 → 一条 message 带 `(n 处)`

替代方案：只截断不结构化。否决——截断会丢排查信息，SOP 阶段 4 依赖这些细节。

### D5：`createFrame` 的可选坐标

后端 `createFrame` 入参是否已支持 `x` / `y` 需确认。支持则直接传；不支持则 `createFrame` 后在同一个 exec 里 `set position`（两次往返 → 一次 exec），避免出现「先落 (0,0) 再跳」的可见抖动。

## Risks / Trade-offs

- [`autoPlace` 依赖页面扫描，大页面慢] → 单次 `scanPageChildren`，只读包围盒；超时上限沿用现有扫描设置
- [重试导致重复创建] → 重试前强制回滚；测试锁「失败一次后画布只剩一份根帧」
- [`position` 语义是相对页面还是相对画布] → 明确为页面坐标（与 `pageId` 一致）
- [message 截断后信息不足] → `details` 保底；工具返回同时给 `code`
- [软告警变多] → 新增 3 个码，均为「配置/能力缺失」类，正常路径不触发

## Migration Plan

1. 先确认 `createFrame` 坐标能力与页面扫描能力
2. 落 `position`（最小改动，立即解决压稿）
3. 落 `autoPlace` + 回退告警
4. 落 `renderWithRetry`（对齐同步实现）
5. 落错误三段式（工具层序列化）
6. 回滚：`position` / `autoPlace` 均为可选入参，错误结构变更仅在 message 过长时生效

## Open Questions

- `autoPlace` 的 `gap` 是否该进 `geometry`（项目级配置）而不是硬编码 100？
- 页面为空时 `autoPlace` 应落 `(0,0)` 还是也带 `W_AUTOPLACE_FALLBACK`？（倾向静默落 `(0,0)`）
- 错误 `details` 是否上传给调用方日志就可能含设计内容（选区 dump），是否需要脱敏开关？
