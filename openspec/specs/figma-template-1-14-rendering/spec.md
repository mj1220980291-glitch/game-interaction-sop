# figma-template-1-14-rendering Specification

## Purpose
TBD - created by archiving change v2-add-cluster-subgroup-headings. Update Purpose after archive.
## Requirements
### Requirement: 渲染目标为 Figma 模板 1:14

引擎 SHALL 把 v2 IR 写入 `TEMPLATE_FILE_KEY = 'UYCJok3MXTWITMfeJSqEF6'` 文件中 `TEMPLATE_NODE_ID = '1:14'` 的 COMPONENT 实例（或其副本）。

#### Scenario: 写入指定模板

- **WHEN** 调用方传入 `target: { fileKey, pageId }`
- **THEN** 引擎 SHALL 在该 file 的该 page 下基于 1:14 模板克隆出文档结构

### Requirement: 文件头与设计总览一次性注入

文件头 4 行字段 SHALL 写入模板的 4 个标题 TEXT 节点（owner / group / ticketLink / lastUpdate）；`### 功能背景` 与 `### 核心交互` 段 SHALL 写入对应固定 frame 内的 TEXT。

#### Scenario: 头部字段映射

- **WHEN** IR.header.owner = '苗儿'
- **THEN** 引擎 SHALL 把 '苗儿' 设置为 `跟进UI` 对应 TEXT 节点的 characters

### Requirement: 章节按 IR 顺序克隆界面说明组

每个非 `isGlobalSpec` 的章节 SHALL 克隆"界面说明 N"组（基于 1:14），并把章节名、章节序号写入对应位置；`isGlobalSpec` 章节 SHALL 删除主图占位 / 占位文案 / 气泡 FRAME 并保留右侧说明区。

引擎 SHALL 在渲染任何章节内容之前，先完成所有章节节点的克隆（两阶段策略）：阶段 1 从空白 masterSectionGroup 批量克隆所有 section node；阶段 2 再依次渲染各章节。克隆操作 SHALL 发生在 masterSectionGroup 尚未被任何内容填充时。

#### Scenario: 全局规范章节跳过主图区

- **WHEN** 一个章节 `isGlobalSpec=true`
- **THEN** 引擎 SHALL 调用 `backend.deleteNodes` 删除该章节的 `主图占位` / `占位文案` / `气泡 FRAME` 三类节点

#### Scenario: 多章节克隆源为空白模板

- **WHEN** 文档含 3 个章节
- **THEN** 引擎 SHALL 先克隆出 section node[0]（masterSectionGroup 本身）、node[1]（clone）、node[2]（clone），克隆完成后再开始填充 node[0]，不得在填充 node[0] 之后再克隆 node[1] 或 node[2]

### Requirement: 章节内气泡按局部序号编号且仅与本章节关联

每个章节内的 `###` 簇按出现顺序对应该章节主图上的气泡 1, 2, 3, …；气泡编号 SHALL 在章节边界处重置。引擎 SHALL 不维护跨章节的全局连号。

#### Scenario: 第二章节气泡从 1 重新开始

- **WHEN** `## 01.` 含 5 个簇、`## 02.` 含 8 个簇
- **THEN** 02 章主图上 SHALL 出现编号 1-8 的气泡，而不是 6-13

### Requirement: 簇内子分类小标题渲染

引擎 SHALL 按 `Cluster.groups` 数组分组渲染说明块。具体策略：

| group 数 | title 情况 | 渲染行为 |
|---|---|---|
| 1 | null | **完全等同 v2 旧版**：克隆 1 次说明块，bullets 平铺，不插小标题 TEXT，无任何新函数调用 |
| 1 | 非 null | 复用现有说明块，在 bullets TEXT 之前的 `subTitle` TEXT 写入 title |
| ≥ 2 | 任意 | 第 1 个 group 复用现有说明块，第 2..N 个 group 各通过 `cloneClusterBlock` 克隆 1 个新说明块；每个有 title 的 group 的说明块 `subTitle` TEXT 写入 title |

新插入/修改的小标题 SHALL 使用模板内 `subTitle` TEXT 节点（`name === SECTION_CHILD_NAMES.clusterSubTitle`）写入；若该节点不存在则克隆 bulletSource TEXT 并定位在 bullets TEXT 之上 4px（FRAME-local）。

角色标签 FRAME（`name starts with SECTION_CHILD_NAMES.roleTagsFramePrefix`）SHALL 只保留在第 1 个 group 的说明块中，并执行 keep-first 删除；第 2..N 个 group 的说明块 SHALL 整体删除角色标签 FRAME。

`配图：xxx` bullet 归属的 group 的说明块 SHALL 保留 imagePlaceholder；其他 group 的说明块 SHALL 删除 imagePlaceholder。

#### Scenario: 单 group + null title 完全向后兼容

- **WHEN** 簇 IR 为 `{ groups: [{ title: null, bullets: ['a', 'b'] }] }`
- **THEN** 渲染路径 SHALL 不调用 `cloneClusterBlock`，不调用 `insertSubgroupTitleText`，产物与 v2 旧版一致

#### Scenario: 双 group 各自独立说明块

- **WHEN** 簇 IR 为 `{ groups: [{ title: '基础信息', bullets: ['a'] }, { title: '升级反馈', bullets: ['b'] }] }`
- **THEN** 引擎 SHALL 在 Figma 内产出 2 个说明块：第 1 块 `subTitle='基础信息'`，bullet `a`，保留角色标签；第 2 块 `subTitle='升级反馈'`，bullet `b`，角色标签 FRAME 被删除

#### Scenario: 含配图的 group 保留占位，其余删除

- **WHEN** group[0].bullets = ['a']，group[1].bullets = ['b', '配图：xxx']
- **THEN** group[0] 的说明块 imagePlaceholder SHALL 被删除；group[1] 的说明块 SHALL 有 imagePlaceholder

#### Scenario: 第 2..N 说明块角色标签被整体删除

- **WHEN** 簇有 3 个 group
- **THEN** 第 2 和第 3 个说明块 SHALL 各自不含角色标签 FRAME（整体删除，不只是 keep-first 删除其中几个 TEXT）

#### Scenario: cloneClusterBlock 返回完整子节点集合

- **WHEN** 调用 `cloneClusterBlock(backend, sourceId, parentId)`
- **THEN** 返回的 `ClusterBlockNodes` SHALL 包含 `blockId`、`subTitle`（若存在）、`bulletSource`、`allBulletTexts`、`roleFrame`（若存在）、`imagePlaceholders`

### Requirement: 角色 TEXT 按簇 keep-first 删除

模板的角色标签 FRAME 默认含 7 个角色 TEXT 子节点；引擎 SHALL 按簇的 `roles[]` 决定保留集合，对每个匹配 `@角色名` 的 TEXT 保留**首次出现的一个**，其余（不在保留集合内的、或同名重复的）批量 `deleteNodes`。

#### Scenario: 簇仅需 程序+GUI

- **WHEN** 簇 roles=['程序','GUI']
- **THEN** 该簇的角色标签 FRAME 内 SHALL 仅余 1 个 `@程序` TEXT + 1 个 `@GUI` TEXT，其他 5 个被删除

### Requirement: 配图占位双向判定

引擎 SHALL 同时识别两种"是否需要配图"信号——簇 bullets 里有 `配图：…` 行，**且** Phase 3 的 assetMap 里有该簇的图源——两者均成立时配图占位被填充；任一缺失时占位以"待补充"文字形式保留并在结果里报告。

#### Scenario: bullets 有配图标记但 assetMap 无图

- **WHEN** 簇含 `- 配图：xxx，待补充`、assetMap 该簇键缺失
- **THEN** 占位 SHALL 保留为可见的"待补充"占位，不抛错；引擎结果里 `result.missingAssets` SHALL 包含该簇 ID

### Requirement: 单点 Probe 优先于批量

涉及 ≥ 3 个气泡 `move_node` 的批量操作前，引擎 SHALL 对该批的第一个气泡执行 `probeMoveOrThrow`，验证落点 `absoluteBoundingBox` 与期望偏差 ≤ 2px，否则中止整批并触发一次 undo。

#### Scenario: Probe 失败终止批量

- **WHEN** 第一个气泡 probe 后落点偏差 > 2px
- **THEN** 引擎 SHALL 抛 `FigmaSafetyError(PROBE_VERIFICATION_FAILED)` 且不触发后续批量 move

### Requirement: 主图光栅化降级

当主图源是 Figma 文件内的 COMPONENT/FRAME/GROUP（无现成 imageHash），引擎 SHALL 调用 `backend.rasterizeNodeToImageFill` 把源节点导出为 PNG 字节并 set 为目标占位的 IMAGE fill。

若 backend 抛出 `isBridgeTimeout: true`（>7s 的桥超时），引擎 SHALL 优雅降级——保留占位为空，在结果里 `result.rasterTimeouts` 报告该章节，不阻塞其他章节渲染。

#### Scenario: 桥超时降级

- **WHEN** 调用 `rasterizeNodeToImageFill` 时 backend 抛超时错误
- **THEN** 该章节主图占位 SHALL 保持空状态、其他章节继续渲染、`result.rasterTimeouts` 包含该章节 ID

### Requirement: 多章节气泡与说明块相互独立

在含 ≥ 2 个章节的文档中，第 N（N ≥ 2）个章节的气泡 FRAME 与说明块容器 SHALL 不含任何来自前序章节的残留子节点。渲染结束后，每个章节气泡 FRAME 内的气泡数量 SHALL 等于该章节的簇数量，不得多于或少于。

#### Scenario: 第二章节气泡数量等于其簇数

- **WHEN** 第一章节有 5 个簇、第二章节有 3 个簇
- **THEN** 第一章节气泡 FRAME SHALL 含 5 个气泡节点，第二章节气泡 FRAME SHALL 含 3 个气泡节点，两者互不干扰

#### Scenario: 第二章节说明块无前序章节残留

- **WHEN** 第一章节有 4 个说明块、第二章节有 2 个簇
- **THEN** 第二章节右栏 SHALL 仅含 2 个说明块，不出现第一章节填充的内容残留

