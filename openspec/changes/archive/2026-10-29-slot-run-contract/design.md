## Context

簇（`说明块NN`）不是一层扁平列表，而是「簇级表头 + 可重复槽位段（run）」：

```
说明块01
  标题(GROUP)                                      ← 簇级表头，全块唯一
    Number(TEXT) / 交互说明标记 / Base(VECTOR)
    #Title_Main(TEXT)
  #Title(TEXT)  Frame427319720  正文/规则×2  配图(GROUP)   ← run 1
  #Title(TEXT)  Frame427319721  正文/规则×2  配图(GROUP)   ← run 2
```

现状三端各自为政：

- 渲染端 `src/v2/render.ts:1720` 的私有函数 `splitSlotRuns` 是唯一的边界规则。
- 编译端 `compile/slim-parts.ts` 只按名字做全局裁剪：`正文/规则` 裁到 1 条、`#Title` 裁到 1 个、媒体按面积留最大的一个并 `replaceWithPlaceholder`。
- 归一化 `compile/normalize-slots.ts:595` 的 `findRoleFrame` 只认第一个职能帧，第二个保持原名。

结果是编译产物与渲染要填的形状错位：`官方1.14` 重编后 `94:3829` 出现配图被拍平成矩形且无占位文案、run 内正文 ×1、第二组 `#Title` 与配图全丢、孤儿 `Frame 427319721`。

## Goals / Non-Goals

**Goals:**

- 一处定义 run 边界，编译 / 渲染 / 同步共用，不可能再各自漂移。
- 瘦身结果满足 run 契约：模板里有几个 run 的「样式载体」保留什么就按 run 决定，不再按名字全局裁。
- `配图` 槽形态唯一（GROUP + `配图占位` 矩形 + `配图占位文案` TEXT），渲染不再需要猜形态。
- run 契约被破坏时编译硬失败，且失败信息能指到「哪个簇、哪个环节」。

**Non-Goals:**

- 不改 md 语法、不改能力枚举（`clusterGroups` 仍是 `slot-run | inline-subtitle | none`）。
- 不改渲染的「先建后删」组装顺序、不改配图资产键规则。
- 不为尚未重编的旧包做形态迁移（旧包裸矩形继续可用，见 Decisions）。
- 不做自动发布；发布仍由人工在 Figma 完成。

## Decisions

### D1 共享模块 `src/v2/template/runs.ts`

纯函数，只吃 `{ id, name, type, visible?, characters? }` 形态的节点，不碰后端：

```ts
interface Run { title?: Node; roleFrame?: Node; body: Node[]; figure?: Node }
splitRuns(children: Node[]): { header: Node[]; runs: Run[] }
```

规则（唯一真相）：

| 判定 | 规则 |
|---|---|
| 边界 | 每个 `#Title` 起一段，延伸到下一个 `#Title` 之前；`#Title` 之前的节点是表头 |
| 职能标签 | 段内 FRAME 且名字命中职能帧前缀（`Frame 4273*` 或已归一化名） |
| 正文 | 段内 TEXT 且名字是 `正文/规则` |
| 配图 | 段内名字是 `配图` 且类型为 GROUP / FRAME / RECTANGLE |
| 完整 run | 至少 1 条正文 |
| `clusterGroups = none` | 整簇视为 1 个无标题 run（表头原样） |
| `clusterGroups = inline-subtitle` | 不产生 run：`#Title` 只作正文首行前缀，一律删除 |

**为什么不用正则扫子树、不在两端各写一份**：`splitRuns` 只处理直接子节点，run 是兄弟级布局，不需要递归；共享后 `reconcile/layout.ts` 的分类分支也能直接复用同一套判据。

### D2 编译瘦身：保留第一个完整 run，其余连根删

`slimParts` 的簇分支改成：

1. `splitRuns(children)` 取表头与 runs。
2. 取**第一个完整 run** 作为样式载体；一个都没有 → 记 gap 并硬失败（见 D5）。
3. 其余 run 的直接子节点（run 的每一个根）整批删；表头不动。
4. 保留 run 内条目**数量保持模板原样**：2 条正文就是 2 条，不裁到 1；1 个职能帧就 1 个，多于 1 个才删多余。
5. 文本占位化仍走 `placeholderSlotTexts`（`正文/规则` → `正文占位`）。

**为什么「保留整段」而不是「保留第一个 `#Title` 之后的所有内容」**：后者正是现在的行为，会把 run 2 的表头、职能帧、配图当成 run 1 的内容留下来，导致孤儿节点。

### D3 配图槽统一 GROUP 化（编译期）

新增后端能力：

- `groupNodes({ parentId, name, childIds })`：把既有兄弟节点包成一个 GROUP（保持绝对位置）。
- `createText({ parentId, name, characters, box })`：用 Noto Sans SC 造占位文案（编译期字体已保证可加载）。

编译期处理顺序：

| 原形态 | 处理 |
|---|---|
| 已是 GROUP | 原地清洗：删内部图片填充、确保内含 1 个 `配图占位` 矩形与 1 个 `配图占位文案` TEXT（缺文案则 `createText` 补） |
| 裸矩形 / 实例 | `groupNodes` 包壳 → 矩形改名 `配图占位` → `createText` 补 `配图占位文案` |
| 无配图槽（`figure = none`） | 不造 |

**替代方案：继续用 `replaceWithPlaceholder`**。否决——它就是拍平的元凶（`slim-parts.ts:488`），换成 GROUP 后保留了文案与结构，渲染也不必再猜。

**替代方案：渲染端容忍两种形态**。部分采纳——渲染仍同时接受 GROUP 与裸矩形（旧包 `蛋仔` 未重编，不能坏），但编译产物一律 GROUP，新增模板不再产生第二种形态。

### D4 渲染：同一套边界 + 职能帧整簇唯一

- `fillGroupSlots` 用 `splitRuns` 取 prototype，不再用自己的 `splitSlotRuns`。
- 组装规则不变（`#Title` 非空才克隆、职能帧只给第 1 组、正文按 bullet 数克隆、配图按 `配图：` 原位穿插）。
- 组装完成后，块内**职能帧只允许 1 个**：多余者随原型删除批次一起删（含编译残留的孤儿帧）。
- `图配置` 克隆只克隆 GROUP（`isFigureSlot` 仍兼容裸矩形，但优先 GROUP）。

### D5 探针：两段，硬失败

| 时机 | 检查 | 失败后果 |
|---|---|---|
| 写画布前（intake 之后、建组件之前） | 原稿每个簇能否 `splitRuns` 出 ≥1 个完整 run | 抛 `V2_COMPILE_RUN_CONTRACT_BROKEN`，一个节点都不建 |
| 瘦身后（产物簇只读扫描） | 保留 run 完整、正文 ≥1、配图是 GROUP 且含 `配图占位` + `配图占位文案`、职能帧 ≤1 | 抛同码，不回填 key；报告列出已建组件 id 供清理 |

**为什么不在渲染端兜底**：渲染已经有一次静默降级（无 `#Title` 时平铺填充），问题被吞掉了两次重编才暴露。编译是一次性动作，早失败成本最低。

**代价**：瘦身后失败时组件已经建在库页面里。现有编译流程没有回滚机制，本次不新增回滚（超出范围），改为在报告里明确列出待删组件 id，并把该情况写进 HANDOFF 的坑位清单。

### D6 用 fixture 锁形状

新增 `tests/v2/fixtures/slot-runs.ts`，固化两种形态：

- `officialTwoRuns`：1:14 真实形状（表头 + 2 段，每段 `#Title`/职能帧/正文×2/配图 GROUP）
- `bareFigureRun`：蛋仔形状（表头 + 1 段，正文×1，配图为裸矩形）

`slim-parts` 与 `fillGroupSlots` 的回归用例直接对 fixture 断言「保留了什么、删了什么、包壳后叫什么」。

## Risks / Trade-offs

- [瘦身后硬失败会留下已建组件] → 报告列出待删 id，写进 HANDOFF 坑位清单；不做自动回滚（避免引入未验证的删除路径）。
- [给裸矩形包 GROUP 可能改变 AUTO_LAYOUT 内的布局行为] → 包壳只对「无父级 AUTO_LAYOUT 的配图槽」无条件执行；父级是 AUTO_LAYOUT 时先用 fixture 验证尺寸不变，若尺寸漂移则退化为「保留裸矩形 + gap 告警」。
- [旧包形态与新包形态长期共存] → 渲染保留双形态判据；在 spec 中把「裸矩形」标为仅兼容旧包。
- [`createText` 依赖 Noto Sans SC] → 复用编译期字体校验结论；字体不可用时按已有 `V2_COMPILE_FONT_UNAVAILABLE` 失败，不降级。
- [1:14 重编后 key 变化影响已交付文档] → 沿用现有「重编新增组件 + 旧组件废弃」策略，不回滚旧 key。

## Migration Plan

1. 合并代码与单测（`npm test` 全绿）。
2. 用新代码重编 `官方1.14`（`phase=compile`）→ 人工在 Figma 发布 4 个部件 → `phase=verify` 回填 key。
3. 用测试 md 渲染一版，截图核对：配图占位文案存在、run 内正文条数正确、小标题齐全、无孤儿职能帧。
4. 失败回滚：`官方1.14.json` 已有一份 `.bak`，恢复 json 即回到旧包（旧组件未删除，仍可 import）。

## Open Questions

- 无。三项决策已在 propose 阶段确认：run 契约破坏硬失败；配图一律 GROUP；真机验收纳入本变更。
