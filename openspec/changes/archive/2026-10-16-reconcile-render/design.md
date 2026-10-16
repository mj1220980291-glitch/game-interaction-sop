## Context

现在的渲染流程是 `renderV2MarkdownToFigma` → `renderInner`：从 `1:14` 克隆出整份模板，再逐个界面、逐个簇往里填内容。整个过程中引擎不记录任何信息：节点和 markdown 的对应关系只在这一次调用的内存里存在，调用一结束就没了。所以引擎无法"更新"一份已有文档，只能重新生成。

现场事实（变色龙页实测，2026-10-16）：

- `需求目标`、界面里的 `Text` 列、`说明块NN` 都是 VERTICAL auto-layout，所以只要知道插入位置（index），就能把节点插到正确的地方。
- `rec组` 是 `layoutMode: NONE`。设计师会把主图占位整个换成自己的 INSTANCE（比如 `Slide 16:9 - 37`），也会拖动气泡的位置。
- 手贴的图大多是裸 RECTANGLE，直接插在两条 `正文/规则` 之间，不在模板的「配图」GROUP 里。
- 大文档的节点数会超过 `scanSubtree` 默认的上限 500（比如对局与结算有 465 个 TEXT）。
- `figma_execute` 单次调用最多 30s。连续调用 `loadFontAsync` 会被节流，必须先对字体去重。

## Goals / Non-Goals

**Goals:**
- 对一份带标记的文档，传入新的 markdown，只改有变化的部分。设计师手改的文字、手贴的节点、拖过的气泡位置都保留
- 整篇同步和局部（`scope`）同步共用同一套逻辑
- 冲突不自动裁决，只报告
- 同步幂等，中断后可以直接重跑
- 首次渲染的结果和现在完全一样，只是多了标记

**Non-Goals:**
- 认领没有标记的旧文档（留给 `adopt-legacy-doc`）
- 合并文字样式：只比对 `characters`，不比对字体、加粗区间等
- 跨文档搬运内容
- 把冲突的两个版本合并成一条

## Decisions

### D1 标记用 `setSharedPluginData('gisop', …)`

namespace 固定为 `gisop`，key 固定为 `stamp`，值是 JSON。用 shared 版本是因为它不绑定插件 ID：Desktop Bridge 换插件、换 manifest 之后照样能读到。

备选方案：
- 用 `setPluginData`：和插件 ID 绑定，换插件后标记全部失效。不采用。
- 把编号写进图层名：设计师会改名，图层面板也会变乱。不采用。

### D2 数据模型：容器记清单，条目只记身份

```
doc     { v:1, kind:'doc', header:{slot→written}, overview:{bg,core}, sections:[{id:sid,text:name}…], lock? }
section { kind:'section', sid, name, clusters:[{id:cid,text:title}…] }
cluster { kind:'cluster', cid, title, roles:[…], items:[{id:iid, t:'rule'|'figure'|'subtitle', text}] }
item    { kind:'item', iid, t, text, asset?, imageHash? }   ← 正文/规则 TEXT、配图 GROUP、#Title TEXT
slot    { kind:'slot', role, cid?, asset?, imageHash? }    ← 头部/总览 TEXT、#Name、主图、气泡、角色框、模板残留(template)
```

- `sid`、`cid`、`iid` 是引擎生成的短随机 ID，一旦分配就不再改变。
- 条目的"上次写入值"记在**条目自己的标记**上（`text`），和写文字放在同一次 `applyOps` 里，不会出现"写了内容、没写标记"。容器清单负责记录"曾经有哪些条目"，用来认出设计师删掉的节点（tombstone）。
- 配图的 `asset` 和 `imageHash` 也记在条目标记上。`imageHash` 由插件在写标记时现场读取（`captureHash`），读不到图就不记 `asset`，所以填充失败不会被当成"已应用"。
- 渲染时，各容器（章节容器、界面、主图父节点、气泡框、右栏、说明块）里没有被认领的直接子节点统一打 `template` 槽位标记。这样"没有标记"就只可能是之后人加上去的。
- 判断设计师改了哪些文字：节点当前的 `characters` 和条目标记里的 `text` 不一样。

备选方案：
- 只在容器清单里记文字：清单和条目写入不在同一个 op 里，中断时两者会对不上。不采用。
- 条目自己记、容器不记清单：节点被删之后就无从知道它曾经存在过。不采用。

**中断后的孤儿**：带条目标记、但没有任何清单列出它的节点，是上一次同步搬进来、还没来得及更新清单就中断留下的。读取时就地接管，按普通条目处理，避免重跑时再插一份。被**另一个**容器清单列出的节点则按外来节点处理。

### D3 流程：读 → 对齐 → 计划 → 执行 → 报告

```
read      readStampedTree 一次读回整棵树（上限 20000 节点，不进入 INSTANCE 内部）
align     纯函数：DocSnapshot × DocIR × scope → Plan
plan      按容器分组的 op（新节点用符号引用 ScratchRef 表示）+ 资产填充任务
scratch   计划里有新节点时，才把相关界面渲染成临时文档，得到符号引用对应的真实 id
execute   op 合并成若干次 applyOps（每次 ≤300 个），再做资产填充，最后写 doc 标记并解锁
report    { changes, conflicts, preserved }
```

`align` 和 `plan` 是纯函数，不碰 backend。`dryRun` 只走到 plan，不渲染 scratch。

### D4 对齐算法

每一层都用同一个方法：对两个序列按 key 做 LCS；LCS 之外，key 完全相同的一删一增先认作"移动"；剩下的再把同一段内相邻的"删 + 增"按位置配对成"改"。先认移动，是为了避免一条原样挪了位置的条目被误配成"它新邻居的改写"。

| 层级 | 旧序列 key | 新序列 key | 配对出"改"的含义 |
|---|---|---|---|
| 界面 | 清单里的 `name` | md 中 `## NN.` 后面的章节名 | 改名 |
| 簇 | `title` | 簇标题 | 改标题 |
| 条目 | 清单里的 `text`（规范化之后） | md bullet（规范化之后） | 改文字 |

规范化方式和渲染时写入的一致：`normalizeBulletText`、`stripImageBulletPrefix`。配图条目的 key 带上 `figure:` 前缀，这样规则条目永远不会和配图条目配对。

`####` 小标题本身也是一个条目（`t:'subtitle'`），参与同一个序列的对齐，不另开一层。

备选方案：按位置一一对齐。中间插入一条，后面的条目会全部错位，被误判成"全改"。不采用。

### D5 手改判定与处理（条目级）

记 `F` = 节点当前的文字，`W` = 清单里记录的上次写入，`M` = markdown 的新值。

| 情形 | 处理 |
|---|---|
| 节点在，`F == W`，`M == W` | 不动 |
| 节点在，`F == W`，`M != W` | 写入 `M`，更新清单 |
| 节点在，`F != W`，`M == W` | 不动，记入 `preserved` |
| 节点在，`F != W`，`M != W`，`F == M` | 不写画布，清单更新为 `M` |
| 节点在，`F != W`，`M != W`，`F != M` | **不动，记入 `conflicts`** |
| 节点不在（设计师删了），md 没改 | 不重建，清单里保留一条 tombstone |
| 节点不在，md 改了 | 不重建，记入 `conflicts` |
| md 新增 | 插入，分配新 `iid` |
| md 删除，`F == W` | 删除节点 |
| md 删除，`F != W` | 不删，记入 `conflicts` |

tombstone 让"设计师删除"这个决定在后续同步中一直有效，不会因为下次重跑就被重建出来。

配图按同样的规则判定：`W` 换成清单里的 `asset` 和 `imageHash`，`F` 换成节点当前 fill 的 imageHash。

### D6 外来节点（没有标记）

- 外来节点永远不读、不写、不移动、不删除。
- 在 auto-layout 容器里，外来节点"挂"在它前面最近的那个引擎节点后面。往引擎节点 X 后面插新节点时，插入位置是"X 之后、紧跟 X 的那串外来节点之后"。
- 引擎节点被删时，挂在它后面的外来节点原地不动，自然就挂到了前一个引擎节点后面。
- 如果容器（界面或簇）在 md 里被删了，但里面还有外来节点或手改：整个容器保留，记入 `conflicts`。
- `rec组`（NONE 布局）里的外来节点和气泡坐标一律不动。

### D7 结构级变化

| 变化 | 处理 |
|---|---|
| 界面或簇调换顺序 | 跟着 md 重排。重排不会丢内容，所以不算冲突 |
| 新增界面 | 整个 `界面说明` 从 scratch 搬入 `需求目标`，按位置插入 |
| 新增簇 | 说明块从 scratch 搬入 `Text` 列，对应气泡从 scratch 搬入 `气泡` 框 |
| 新增条目 | 从 scratch 对应说明块里把那一个节点搬过来 |
| 界面或簇改名 | 只改 `#Name` 或 `#Title_Main`，规则同 D5 |
| 删除界面或簇 | 容器内没有手改、也没有外来节点，就删除；否则记入冲突 |
| 角色变化 | 画布上的角色还是上次写入的样子，就用 scratch 里的角色框替换旧框；否则记入冲突 |
| 气泡 | 数量跟着簇数走。已有气泡只改编号，不改坐标；新增气泡沿用 scratch 里的默认偏移 |

**新节点从哪来**：只把计划里需要新节点的那几个界面渲染成一份临时文档（scratch，名为 `__gisop_scratch__`），走的就是首次渲染的同一条流水线（从 `1:14` 克隆、填充、打标记），然后把需要的节点搬过去，最后删掉 scratch。这样新节点的样式、配图、角色、编号与首次渲染完全一致，而且不需要另写一套"从原型拼装"的逻辑。上一次中断遗留的 scratch 会在下次同步开始时清掉。

scratch 只导出会被搬走的节点需要的资产（主图、配图），其余的不导出，避免为丢弃的内容付导出时间。

备选方案：从文档里已有的块克隆原型。已有的块可能被手改过，会把设计师的改动复制到新块里。不采用。

### D8 scope

- `"NN"`：只处理 md 第 NN 个界面匹配到的那个 section（按 D4 的界面对齐找到）。D7 里的界面级操作（增、删、重排）跳过。
- `"NN/C"`：只处理这个簇内部的条目。
- scope 之外的部分只读，不写。文档头部和设计总览也只在没有传 scope 时才同步。
- scope 指向的界面或簇不存在时，返回 `V2_SCOPE_NOT_FOUND`。

### D9 执行：按容器分组的 op 加上分批

- op 有四种：`setText`、`delete`、`place`（插入或移动到某节点之后，并越过紧随其后的无标记节点）、`stamp`。
- 每个容器（说明块、界面、文档）的 op 自成一组，组内顺序是：删除 → 角色框替换 → 按新顺序的插入/移动/改字 → 条目标记 → 容器标记。条目的改字和它的标记在同一组里。
- 若干组合并成一次 `applyOps`，每次不超过 300 个 op；插件在批首对字体去重加载。
- 插件遇到第一个无法执行的 op 就停下。引擎随即停止，只报告已落地批次的 changes。重跑时从画布现状重新计算计划：已经搬进来的节点带着标记，会被认出来，不会再插一次（见 D2 的孤儿接管）。
- 资产填充（导出图片）在所有 op 之后逐个执行，每次填完立刻用 `captureHash` 重写该节点的标记。单个失败只告警。
- 最后写 doc 标记并去掉锁。中途失败时也会在 `finally` 里恢复原 doc 标记来解锁。
- 同步模式下绝不删除 root。

备选方案：每个 op 一次往返（RTT）。大文档会有几百次往返，耗时太长。不采用。

### D10 接口

```
render_v2_markdown_to_figma {
  markdown, assetMap?,
  target?: { fileKey?, pageId?, rootId? },
  scope?: "NN" | "NN/C",
  dryRun?: boolean
}
→ { ok, rootInstanceId, errors, warnings, summary,
    mode: 'create' | 'reconcile',
    changes?: Change[], conflicts?: Conflict[], preserved?: Preserved[] }
```

- `scope` 和 `dryRun` 只在传了 `rootId` 时生效。没传 `rootId` 时如果带了这两个参数，返回 `INVALID_INPUT`。
- `rootId` 指向的节点没有 doc 标记时，返回 `V2_NOT_STAMPED`，提示先认领。
- 冲突条目的格式：`{ path:'03/2/#4', kind, figma, markdown, nodeId }`。`kind` 取值为 `text`、`figure`、`deleted-but-changed`、`container-not-empty`。

备选方案：新增一个 `reconcile_v2_markdown` 工具。这样要改原生工具集的 spec，Agent 也得在两个工具之间做选择，而用一个参数就能区分。不采用。

### D11 首次渲染时打标记

渲染完成后，`stampRenderedDoc` 读一次整棵树（`readStampedTree`），按位置把 IR 映射到节点（刚渲染完的文档顺序与 IR 完全一致），再用一次 `stampNodes` 批量写入。好处是完全不用改动现有的各个 fill 函数。预期调用序列末尾多出这两次调用，在测试里写明了理由。映射对不上的部分不打标记，给出 `V2_W_STAMP_LAYOUT_MISMATCH`；打标记整体失败给出 `V2_W_STAMP_FAILED`，文档保留。

这个"按位置映射"也是 scratch 拿到新节点 id 的方式，以及之后 `adopt-legacy-doc` 的起点。

## Risks / Trade-offs

- [文字对齐误判，把"改写"判成"删旧加新"] → 只有相邻的删和增才配对成"改"。误判的后果是"删一条再插一条"，节点上的手改会触发 D5 的 `md 删除且 F≠W` 分支，记入冲突，不会悄悄丢失
- [设计师复制了一个带标记的节点，产生重复 `iid`] → 读取时检测到同一个 `iid` 出现多次，只认第一个，其余当外来节点处理，并给出 warning
- [只比对 characters，设计师加的局部样式在 md 改动时被覆盖] → 已知限制，写进 skill 文档；`dryRun` 可以提前看到会改哪几条
- [插件在后台继续执行的同时用户又重跑，两边并发写] → Op 本身幂等，可以降低重复插入的风险，但不能完全杜绝。在 doc 标记里写入 `lock{runId, at}`，60s 内有另一个 run 就拒绝执行，返回 `V2_RECONCILE_BUSY`
- [大文档分片读取期间画布被修改] → 不处理。读取窗口很短，计划按读到的那一刻生成，下次重跑会自动收敛
- [首次渲染多两次调用] → 每次多约 2 次 RTT，可以接受
- [设计师把一条引擎条目拖到另一个说明块] → 它被原说明块的清单列着，在新位置按外来节点处理（不会被删），原位置显示为"设计师删除"。不会丢内容，只是之后不再随 md 更新
- [新增内容需要渲染 scratch] → 有新节点时，同步耗时约等于渲染相关界面的耗时；只改文字时不渲染 scratch
- [每次 300 个 op 的上限是估计值] → 真机按变色龙规模实测后调整

## Migration Plan

- 本 change 上线前渲染出来的文档都没有标记。对它们传 `rootId` 会得到 `V2_NOT_STAMPED`；它们由后续的 `adopt-legacy-doc` 处理
- 没有回滚方案：功能是新增的。不传 `rootId` 时行为和现在一致

## Open Questions

- tombstone 要不要提供"恢复"入口（比如传 `restore: ['03/2/#4']`）？本 change 先不做，等使用中出现需求再说
- 分批上限（每次 `applyOps` 最多 300 个 op）是估算值，需要用变色龙规模的文档实测后再调整
