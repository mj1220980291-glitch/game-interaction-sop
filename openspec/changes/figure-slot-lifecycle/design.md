## Context

配图槽在三处被独立判断，口径不完全一致：

1. **填充**（`render/parts/index.ts:647-728` 的 `fillCluster` + `render.ts:1559-1650` legacy `fillImages`）：按 md 的 `配图：` 条目克隆 / 匹配槽，把 assetMap 的 `figma_node` 裁切图铺到 `配图占位` 矩形上
2. **认领**（`collectClusterLayout`，`:761-830`）：判哪些槽「真的被用」——`withImage`（矩形有 IMAGE 填充）或 `hintOf(id) === '配图占位：<desc>'`；判不出的进 `looseNodes`
3. **隐藏**（`:688-694`）：`looseNodes` 逐组 `setNodeVisible(false)`

同步侧配对（`reconcile/plan.ts:711-776`）用的是第三套口径：按 `配图占位文案` 的**文本内容**（`figureHintText`）认槽，并按 `stamp.imageHash` 判「图被手改过没有」。

真机结果（M1/M2，`rootInstanceId 4221:51589` / `4221:54064`）：

```
imagesPlaced 4/2   figuresPlaced 18/9   warnings []
手工：删空配图框 27、改图层名、删占位文案
```

`warnings` 全空说明：要么 `loose` 判定认为这些槽「被用」（认领误判），要么隐藏没执行，要么隐藏的槽在产物里仍占版面。**根因未定位**——这正是本 change 第一步要复现的。

## Goals / Non-Goals

**Goals:**

- 每个配图槽在渲染结束时只有一个明确结局，可枚举、可断言
- md 声明了图却没有资产 → 必须有人看得见（软告警）
- 置图后的收尾（删占位文案）自动化，且不破坏同步配对
- 同步对「新增 / 删除 / 改描述」三种配图条目给出确定语义

**Non-Goals:**

- 不改 8 项能力枚举、不加新能力
- 不改模板部件本身（编译侧瘦身逻辑不动）
- 不引入「槽改名」——同步与契约都按名称定位，改名是破坏性变更，另立 change
- 不做图片内容的自动裁切策略调整（`crop` 语义由调用方给）

## Decisions

### D1：三态显式化，落进 layout

`PartsClusterLayout` 的 figure 条目补 `state: 'filled' | 'placeholder' | 'hidden'`：

| 态 | 判据 | 产物 |
|---|---|---|
| `filled` | 槽矩形有 IMAGE 填充 | 图 + 无占位文案 |
| `placeholder` | md 有 `配图：` 条目，但 assetMap 无该项或该项 apply 失败 | 灰板 + `配图占位：<desc>` + 软告警 |
| `hidden` | md 无对应条目 | 整组 `visible=false`，组内文本一并不可见 |

替代方案：只留「用 / 不用」两态。否决——`placeholder` 是本次真机最缺的一态（缺资产静默），必须能区分「没写」与「写了没图」。

### D2：认领顺序改为「先按渲染期账本，再按文本」

渲染时我们**知道**自己把哪张图放进了哪个槽。`FigureState` 已有 `placed` 计数，扩成 `Map<groupId, assetKey>` 账本，`collectClusterLayout` 直接查账本；文本匹配降级为账本缺项时的回退。

理由：现有 `hintOf` 是启发式（找组内第一个 TEXT），多文本槽 / 描述前缀不一致就会误判，27 例最可能就是这种误判导致 `loose` 为空。

替代方案：继续修 `hintOf` 的启发式。否决——真机每换一种簇结构就要再修一次，账本是确定性信息，不该浪费。

### D3：配对主依据用 stamp，不新增 pluginData

置图后删占位文案是必须的（否则图上压着一行「配图占位：…」），同步不能靠这行文本配槽。

**实现时发现原设计多余**：渲染期写 stamp 时已经带上了 `stamp.asset`（`reconcile/stamp.ts:86`，`plan.ts:745` 用它判 `sameAsset`）。所以配对键本来就在，不需要新写 `gisop.asset.*` pluginData；而且 `NodeInfo` 根本没有 pluginData 读取能力，硬加要动桥的序列化。

改为：`plan.ts:figure()` 以 `it.stamp.asset` 为主依据，文本（`figureHintText`）仅用于「描述变了」与「人工改过」的判断；stamp 缺失的老产物保持现有文本路径。

替代方案（原 D3）：写 pluginData 作配对键。否决——与既有 stamp 重复，且读不了。

### D4：`figuresPlaced` 语义拆分

`summary` 增 `figuresPlaceholder`（三态里 `placeholder` 的计数），`figuresPlaced` 只计 `filled`。这样「18 个配图位，只有 12 张图」一眼可见。

### D5：删除条目直接删槽，不做隐藏池

原打算「槽整组 `visible=false`，保留给同步复用」。实现时确认同步的**新增**本来就走 scratch 管线（新建槽 + 填图），复用隐藏槽意味着 snapshot 要把隐藏节点也当条目、还要补 stamp 逻辑，收益只是省一次克隆。

改为：未手改的槽在 md 删除条目后整组删除；手改过的保留并报冲突。产物里不留隐藏残槽，也不需要「新增优先复用」这套分支。

### D6：同步三态语义（按已实现行为定稿）

实测现有 `reconcile/plan.ts` 已经按这张表运行，本次只补规范与测试，不改逻辑：

| md 变化 | 槽未手改 | 槽手改过 |
|---|---|---|
| 新增条目 | scratch 供给新槽 + 填图 | 同左 |
| 删除条目 | 整组删除 | 冲突，保留 |
| 描述变更 | 只改文案 + stamp | 冲突 |
| 资产变更 | 重填 | 冲突，保留人工图 |

人工新建的槽没有 stamp → 走 `preserved: foreign`，既不删也不冲突。

## Risks / Trade-offs

- [27 例根因未知，D2 修的可能不是它] → 任务 1 先复现定位，若根因在 `refreshChapterGeometry` 或 `setNodeVisible` 缺失，改走对应修复，D2 仍作为正确性改进保留
- [pluginData 新增写入面] → 只写不读失败即忽略；同步侧所有读取都有文本回退
- [隐藏槽被同步启用时尺寸未重算] → 复用现有 `refreshChapterGeometry`，同步后统一跑一次
- [删除占位文案后老产物与新产物行为不一致] → 按 `stamp` 里有无 asset key 分支，老产物走文本回退
- [`figuresPlaceholder` 新增字段] → 仅新增，老调用方忽略即可

## Migration Plan

1. 复现 27 例（用 M1 md + 同一 assetMap，数 `visible=false` 的槽）
2. 落 D2 账本 + D1 三态，跑全量测试
3. 落 D3 pluginData 写入 + 同步读取回退，重点验「删文案后同步仍认得出」
4. 落 D6 同步三态，配 fixture 测试
5. 回滚：D3 的写入可关（env `GISOP_FIGURE_PLUGINDATA=0`），D1/D2 不动数据结构只多字段

## Open Questions

- 27 例的真根因：`loose` 误判为 used？还是 `setNodeVisible` 在 parts backend 上是 no-op？还是隐藏后 `refreshChapterGeometry` 把高度算进去了？
- 隐藏槽在 Figma 里是否会因为 `clipsContent` 影响截图导出？
- 槽克隆上限：一簇最多支持几个配图？当前无限制，是否需要跟 md 契约对齐一个数？
