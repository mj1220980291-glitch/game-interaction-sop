## Context

两条渲染路径并存，但只有一条能同步：

| 路径 | 产物结构 | stamp | 同步 |
|---|---|---|---|
| legacy | 从 `1:14` 整份克隆，`界面说明N` / `说明块NN` / `rec组` / `正文/规则` | 有（`stampRenderedDoc`） | 可用 |
| parts | 四个库部件 detach 后拼装，`左列` / `舞台` / `气泡` / `说明栏` / `配图` / `#Title_Main` | 无（`render.ts:302` 主动跳过） | 不可用 |

reconcile 全链（`Tree` 读标 → `buildSnapshot` → `planReconcile` → `applyOps` 分批 + `runFills` → 写 doc 标）本身与"节点长什么样"无关，**但与"节点叫什么、谁是谁的父级"强相关**：`snapshot.ts` 用 `SECTION_CHILD_NAMES` 认容器，`plan.ts` 用 `rec组` 认气泡宿主，`renderScratch` 用 legacy 管线造原型。

模板包（`~/.game-interaction-sop/templates/*.json`）让 parts 成为默认路径，所以"不能同步"是当前主路径的常态。

## Goals / Non-Goals

**Goals:**

- parts 文档渲染后自带 stamp，`target.rootId` 能直接进同步
- 同步语义与 legacy 完全一致：手改保留、只改变化、conflicts、设计师删除不重建、scope、dryRun、锁与幂等
- 新增界面 / 簇时，原型来自 **parts 管线**渲染的 scratch 文档，不引 `1:14`
- 同步后 parts 专有几何（章节高度、左列拉伸、标号网格）与新建时一致

**Non-Goals:**

- 不实现 adopt：无 stamp 的存量 parts 文档继续 `V2_NOT_STAMPED`，重渲染一次即可
- 不改 parts 的编译流程与模板包格式
- 不支持跨结构迁移（legacy 文档切成 parts 文档）
- 不修标号挤在一列（网格数据问题，另行处理）

## Decisions

### D1 · 结构档案（StructureProfile），不复制第二套规划器

把"节点叫什么、哪个是容器、哪个是槽位"抽成 `StructureProfile`：

```ts
interface StructureProfile {
  id: 'legacy' | 'parts';
  nameOf: {
    section: (n: NodeInfo) => boolean;   // 界面说明N / 章节实例根
    sectionTitle: string[];              // #Name / #Title_Main
    clusterHost: string[];               // 说明块容器 / 说明栏
    bubbleHost: string[];                // rec组 / 气泡
    badgePrefix: string;                 // 标号/1
    figureSlot: string[];                // 配图 GROUP / 配图 RECTANGLE
    bulletSlot: string[];                // 正文/规则
    roleFrame: string[];                 // 职能标记 / Frame 4273*
  };
}
```

`snapshot.ts` / `plan.ts` 里的常量改为从 profile 取。**为什么不做两套**：对齐、tombstone、手改判定、冲突分级这几块占 reconcile 八成逻辑，复制一份必然漂移；profile 只承载命名与层级差异，改动面可控。

### D2 · doc stamp 增 `structure` 与 `parts` 指纹

```ts
interface DocStamp {
  kind: 'doc'; v: 1;
  structure?: 'legacy';          // 缺省 = legacy，老文档行为不变
  parts?: { structure: 'parts'; packHash: string; components: Record<string, string> };
  ...
}
```

`packHash` 是 `components` 四件 key + `capabilities` 的短哈希。同步入口：`tree.root.parsed.parts.packHash !== currentPackHash` → `V2_PACK_MISMATCH`，提示"模板重编过，请重渲染"。

**为什么校验**：部件重编会改槽位名或能力（`figure` 从 `named-group` 变 `none` 之类），在旧文档上按新能力同步会删错节点；重渲染是无损的，拒绝更安全。

### D3 · parts 打标挂在部件实例上，不新建容器

| stamp | 挂在 |
|---|---|
| `doc` | 文档根帧 |
| `section` | `界面说明N` 根帧 |
| `cluster` | 簇实例根帧（在说明栏里） |
| `item` | `正文/规则` TEXT；`配图` RECTANGLE（裸槽，无 GROUP 包裹） |
| `slot` | `sections`=说明栏容器、`section.name`=`#Title_Main` 所在标题块、`main`=主图占位、`bubbleFrame`=气泡、`bubble`=标号/N、`template`=顶部/结尾里的模板残留 |

`item.figure` 的 `asset` / `imageHash` 语义与 legacy 相同；差别只在"配图没有外层 GROUP"，填图与 hash 抓取都直接作用在 RECTANGLE 上。

### D4 · scratch 按结构分派

`renderScratch` 里按 `structure` 选择实现：

- legacy：现有 `renderInner`
- parts：`renderFromParts`（同一 pack、同一 page），产出后立即 `stampPartsDoc`，再用同一 profile 把 `ScratchRef` 解析成 nodeId

**为什么不用目标文档里的现成簇当原型**：集群能力（隐藏池、标号母版、组网）在部件里是编译期固化好的，从目标文档里克隆一份已填充的簇会带进上一份文案与标号状态；scratch 是干净的。

### D5 · 同步后重算 parts 几何

新增/删除簇会改变章节高度与标号数量，而这几件事只在 parts 渲染里做过（`chapter.fit`、`chapter.stretch`、`placeBadges`）。本次把它们从 `parts/index.ts` 内部函数抽成可复用模块（`parts/geometry.ts`），渲染与同步都调；同步只对**受影响的章节**调用，避免整篇重排。

### D6 · 裸配图槽的填图能力

`runFills` 目前要求 `配图 GROUP + 配图占位 RECTANGLE` 两层（`f.rectId` 必填）。parts 是单层 RECTANGLE：扩展为"`rectId` 缺省时用 `groupId` 自身当目标"，legacy 行为不变。

## Risks / Trade-offs

- **[标号网格与新簇不匹配]** 新簇从 scratch 搬过来时带的是 scratch 里的标号坐标 → 搬到目标后按目标章节重排（复用 `placeBadges` + `bubbleOffset`），不复制坐标
- **[auto-layout 顺序被打乱]** 说明栏是 auto layout，插入位置错会让整块重排 → 沿用 legacy 规则：插在"前一个引擎节点 + 紧随其后的连续外来节点"之后
- **[部件重编后同步删错节点]** → D2 的 `packHash` 校验，不一致直接拒绝
- **[一次性迁移成本]** 存量 parts 文档必须重渲染一次才有 stamp → 文档里写明；重渲染本身是幂等的
- **[profile 抽象不足导致 if 分支回流]** 两套结构的差异若超出命名（例如气泡锚点算法不同）仍会在 plan 里出现分支 → 允许 profile 提供 `bubbleOffset` 之类的钩子，但禁止出现 `if (structure === 'parts')` 散落各处
- **[同步失败留脏]** 沿用现有 `V2_RECONCILE_APPLY_FAILED` + 重跑收敛 + 临时根清理

## Migration Plan

1. 先落 stamp 与 profile，但不改同步入口 → parts 文档开始带标，同步仍拒绝（行为不变，可安全发布）
2. 再落 snapshot/plan 的 profile 化 + 裸槽填图 → legacy 全量回归必须绿
3. 最后开 parts 同步入口，跑「渲染 → 手改 → 同步」端到端
4. 回滚：入口按 `structure` 分派是单点开关，关掉即回到 `V2_NOT_STAMPED`

## Open Questions

- parts 模板 `clusterGroups = none` 时 `####` 小标题怎么参与对齐：按"忽略该行"处理，还是按条目同步（legacy 是当条目）
- 章节里只有一个簇时，删掉该簇要不要连说明栏一起删（legacy 的 `container-not-empty` 规则是否直接适用）
