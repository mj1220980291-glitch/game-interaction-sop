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

一个 `说明块` 不是扁平正文，而是「簇级表头 + 可重复槽位段」。模板 `1:14` 自带
2 段（2026-08-11 实测确认）：

```
说明块01
  标题(GROUP)                                    ← 簇级表头，全块唯一
    序号 → 交互说明标记 → Base(VECTOR) + Number(TEXT)
    #Title_Main(TEXT)
  #Title  Frame4273xxx  正文/规则×2  配图         ← 槽位段 1
  #Title  Frame4273xxx  正文/规则×2  配图         ← 槽位段 2
```

因此一个 `####` 子分类 SHALL 渲染为该簇说明块**内部**的一段槽位，而不是一个
独立说明块。每簇仍然只占 1 个说明块，块数 SHALL 恒等于簇数。

槽位段的边界定义：以每个 `#Title`（`SECTION_CHILD_NAMES.clusterSubTitle`）为起点，
延伸至下一个 `#Title` 之前。第一个 `#Title` 之前的节点属于簇级表头，引擎 SHALL
不克隆、不删除。

簇级表头 SHALL 原样保留：一个簇在主图上只对应 1 个编号气泡，其编号与主标题必须
且只能出现一次。引擎 SHALL NOT 通过「只删 `Number` TEXT」的方式去除编号——蓝色圆圈
由同级的 `Base` VECTOR 绘制，单删文字会留下空心圆。

槽位 SHALL 按「先建后删」组装：先按 `groups` 顺序克隆出全部新槽位段追加到块尾，
再整体删除模板原有的槽位段。说明块是 AUTO_LAYOUT 容器且后端只支持 append，克隆
必落块尾，唯有此顺序能得到正确的堆叠次序；它同时允许每段按需精确组装，而不是
克隆后再裁剪。

每段 SHALL 按如下规则组装：

| 元素 | 规则 |
|---|---|
| `#Title` | `title` 非 null 时克隆并写入；`title === null`（W5 的隐式首组）时不克隆，绝不留下模板占位文案 |
| 角色标签 FRAME | 仅第 1 段克隆。`@角色` 是 `###` 簇级声明，逐段重复只是噪音 |
| `正文/规则` | 按该组可见 bullet 数精确克隆，`配图：` bullet 不占正文槽位 |
| `配图` | 仅声明了 `配图：xxx` 的组克隆，并将描述写入其 `配图占位文案` TEXT |

无 `####` 的簇（`groups` 长度 ≤ 1 且 `title === null`）SHALL 走原扁平路径，模板自带的
全部 `#Title` 实例被删除，代码路径与本能力实现之前逐字节一致。

#### Scenario: 无 `####` 完全向后兼容

- **WHEN** 簇 IR 为 `{ groups: [{ title: null, bullets: ['a', 'b'] }] }`
- **THEN** 渲染路径 SHALL 不进入槽位分支，产物与实现前一致，且模板自带的全部 `#Title` 占位 SHALL 被删除
- **AND** 整份不含 `####` 的文档，其 backend 调用序列 SHALL 与本能力实现之前逐项一致

#### Scenario: 多个 `####` 渲染为同一块内的多段槽位

- **WHEN** 簇 IR 为 `{ groups: [{ title: '基础信息', bullets: ['a'] }, { title: '升级反馈', bullets: ['b'] }] }`
- **THEN** 引擎 SHALL 产出 1 个说明块，其直接子节点顺序为 `[标题, #Title="基础信息", 角色框, 正文="a", #Title="升级反馈", 正文="b"]`

#### Scenario: 簇级表头不随子分类重复

- **WHEN** 一个簇有 3 个 `####`
- **THEN** 该说明块内 `Number`、`#Title_Main`、`Base`、`交互说明标记` SHALL 各只存在 1 个

#### Scenario: 角色标签只出现在第一段

- **WHEN** 一个簇有 2 个 `####`，`@GUI @程序`
- **THEN** 该说明块内 `Frame 4273` 开头的 FRAME SHALL 只有 1 个，且其内只保留 `@GUI` 与 `@程序` 两个 TEXT

#### Scenario: 配图只落在声明它的那一段

- **WHEN** group[0].bullets = ['a']，group[1].bullets = ['b', '配图：xxx']
- **THEN** 该说明块内 SHALL 只有 1 个 `配图` GROUP，位于第 2 段，其 `配图占位文案` TEXT 写入该描述

#### Scenario: 子分类数超过模板自带槽位数

- **WHEN** 一个簇有 4 个 `####`，而模板只自带 2 段槽位
- **THEN** 引擎 SHALL 产出 4 段，顺序与文档一致

#### Scenario: 分组簇与不分组簇共存

- **WHEN** 章节内第 1 个簇有 2 个 `####`、第 2 个簇无 `####`
- **THEN** 右栏 SHALL 有 2 个说明块；第 1 块含 2 段槽位，第 2 块不含任何 `#Title`

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

引擎 SHALL 在每个章节的 cluster 循环开始前，将气泡 FRAME 内多余的种子节点（索引 ≥ 1 的所有子节点）删除，确保仅保留 1 个种子供后续 clone 使用。此操作 SHALL 对每个章节独立执行，包括第一个章节（masterSectionGroup）。

#### Scenario: 第二章节气泡数量等于其簇数

- **WHEN** 第一章节有 5 个簇、第二章节有 3 个簇
- **THEN** 第一章节气泡 FRAME SHALL 含 5 个气泡节点，第二章节气泡 FRAME SHALL 含 3 个气泡节点，两者互不干扰

#### Scenario: 第二章节说明块无前序章节残留

- **WHEN** 第一章节有 4 个说明块、第二章节有 2 个簇
- **THEN** 第二章节右栏 SHALL 仅含 2 个说明块，不出现第一章节填充的内容残留

#### Scenario: 模板多余种子被清理

- **WHEN** 模板 `气泡` FRAME 初始含 2 个种子节点（`标号/2` 和 `标号/1`）
- **THEN** 引擎 SHALL 在 cluster 循环前删除第 2 个种子，渲染后该 FRAME 内气泡数量 SHALL 等于该章节簇数，不含孤儿节点

