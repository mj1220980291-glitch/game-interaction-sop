## ADDED Requirements

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

每个非 `isGlobalSpec` 的章节 SHALL 克隆"界面说明 N"组（基于 1:44），并把章节名、章节序号写入对应位置；`isGlobalSpec` 章节 SHALL 删除主图占位 / 占位文案 / 气泡 FRAME 并保留右侧说明区。

#### Scenario: 全局规范章节跳过主图区

- **WHEN** 一个章节 `isGlobalSpec=true`
- **THEN** 引擎 SHALL 调用 `backend.deleteNodes` 删除该章节的 `主图占位` / `占位文案` / `气泡 FRAME` 三类节点

### Requirement: 章节内气泡按局部序号编号且仅与本章节关联

每个章节内的 `###` 簇按出现顺序对应该章节主图上的气泡 1, 2, 3, …；气泡编号 SHALL 在章节边界处重置。引擎 SHALL 不维护跨章节的全局连号。

#### Scenario: 第二章节气泡从 1 重新开始

- **WHEN** `## 01.` 含 5 个簇、`## 02.` 含 8 个簇
- **THEN** 02 章主图上 SHALL 出现编号 1-8 的气泡，而不是 6-13

### Requirement: 簇内子分类小标题渲染

引擎 SHALL 按 `Cluster.groups` 数组分组渲染说明块。具体策略：

| group 数 | title 情况 | 渲染行为 |
|---|---|---|
| 1 | null | **完全等同 v2 现状**：克隆 1 次说明块，bullets 平铺，不插小标题 TEXT |
| 1 | 非 null | 克隆 1 次说明块，在 bullets TEXT 之上插入 1 行小标题 TEXT |
| ≥ 2 | 全部有 title | 每个 group 各克隆 1 次说明块，每块顶部带小标题 |
| ≥ 2 | 含 1 个 title=null | null group 走 "1+null" 路径（无前缀），其余 group 各带标题 |

新插入的小标题 TEXT SHALL 复用模板内"子标号"对应字号，定位在 bullets TEXT 之上 4px。说明块的克隆 / 移动 SHALL 通过 `cloneNodeSafe` 与 `placeBubbleInFrame` 等安全包装器执行，遵守 GROUP-bbox 与 FRAME-local 坐标规则。

#### Scenario: 单 group + null title 完全向后兼容

- **WHEN** 簇 IR 为 `{ groups: [{ title: null, bullets: ['a', 'b'] }] }`
- **THEN** 渲染产物 SHALL 与 v2 旧版（无 groups 概念时的同等簇）字节级一致——说明块克隆 1 次、不插小标题、bullets 平铺为 `- a\n- b`

#### Scenario: 三个子分组

- **WHEN** 簇 IR 含 3 个 group（如 `基础信息 / 动效表现 / 异常态`）
- **THEN** 引擎 SHALL 在 Figma 内克隆 3 个说明块，每块顶部 TEXT 是对应 group title，bullets 文本框包含该 group 的 bullets

#### Scenario: 混合 null+title 分组

- **WHEN** 簇 IR 为 `[{title:null, bullets:['总览']}, {title:'细节', bullets:['x']}]`
- **THEN** 第一个说明块无小标题、内容是 `- 总览`；第二个说明块顶部有 `细节` 小标题、内容是 `- x`

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
